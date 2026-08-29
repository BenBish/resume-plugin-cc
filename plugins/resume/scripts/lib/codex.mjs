import readline from "node:readline";
import { spawn } from "node:child_process";
import { ResumeError } from "./errors.mjs";

const REQUEST_TIMEOUT_MS = 20_000;

class CodexClient {
  /** @param {{command?: string, timeoutMs?: number}} [options] */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.nextId = 1;
    /** @type {Map<number, {resolve: (value: any) => void, reject: (reason: Error) => void, timer: NodeJS.Timeout}>} */
    this.pending = new Map();
    this.stderr = "";
    this.closed = false;
    const command = options.command ?? process.env.RESUME_CODEX_BIN ?? "codex";
    this.proc = spawn(command, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-4000);
    });
    this.proc.on("error", (error) => {
      const err = /** @type {NodeJS.ErrnoException} */ (error);
      this.#failAll(
        err.code === "ENOENT"
          ? new ResumeError("CLI_NOT_FOUND", `${command} was not found on PATH.`, { command })
          : new ResumeError("CODEX_PROTOCOL_ERROR", error.message),
      );
    });
    this.proc.on("exit", (code, signal) => {
      if (!this.closed && this.pending.size) {
        this.#failAll(
          new ResumeError("CODEX_PROTOCOL_ERROR", "Codex App Server exited before replying.", {
            code,
            signal,
            stderr: this.stderr.trim(),
          }),
        );
      }
    });
    const lines = readline.createInterface({ input: this.proc.stdout });
    lines.on("line", (line) => this.#onLine(line));
  }

  /** @param {string} line */
  #onLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.#failAll(
        new ResumeError("MALFORMED_SESSION", "Codex App Server emitted malformed JSONL.", {
          line: line.slice(0, 500),
        }),
      );
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(
        new ResumeError("CODEX_PROTOCOL_ERROR", message.error.message ?? "Codex App Server request failed.", {
          code: message.error.code,
        }),
      );
    } else {
      pending.resolve(message.result);
    }
  }

  /** @param {Error} error */
  #failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  /** @param {unknown} message */
  #send(message) {
    if (!this.proc.stdin.writable) {
      throw new ResumeError("CODEX_PROTOCOL_ERROR", "Codex App Server stdin is unavailable.");
    }
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  /** @param {string} method @param {Record<string, unknown>} [params] */
  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ResumeError("SOURCE_TIMEOUT", `Codex App Server timed out during ${method}.`, { method }));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.#send({ method, id, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  /** @param {string} method @param {Record<string, unknown>} [params] */
  notify(method, params = {}) {
    this.#send({ method, params });
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "resume_plugin_cc", title: "Resume Plugin for Claude Code", version: "0.1.0" },
    });
    this.notify("initialized", {});
  }

  close() {
    this.closed = true;
    this.#failAll(new ResumeError("CODEX_PROTOCOL_ERROR", "Codex App Server connection closed."));
    this.proc.kill("SIGTERM");
  }
}

/** @param {unknown} value */
function textFromUserContent(value) {
  if (!Array.isArray(value)) return "";
  return value
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

/** @param {any} thread */
export function normalizeCodexThread(thread) {
  /** @type {Array<{role: string, text: string, kind: string, timestamp?: number | null}>} */
  const messages = [];
  /** @type {Array<{command: string, status: string, exitCode: number | null}>} */
  const commands = [];
  /** @type {Array<{path: string, kind: string}>} */
  const fileChanges = [];
  let partial = thread?.status?.type === "active";
  for (const turn of thread?.turns ?? []) {
    if (turn.status && turn.status !== "completed") partial = true;
    for (const item of turn.items ?? []) {
      if (item.type === "userMessage") {
        const text = textFromUserContent(item.content);
        if (text) messages.push({ role: "user", text, kind: "message", timestamp: turn.startedAt ?? null });
      } else if (item.type === "agentMessage" && typeof item.text === "string" && item.text.trim()) {
        messages.push({ role: "assistant", text: item.text.trim(), kind: "message", timestamp: turn.completedAt ?? null });
      } else if (item.type === "plan" && typeof item.text === "string" && item.text.trim()) {
        messages.push({ role: "assistant", text: item.text.trim(), kind: "plan", timestamp: turn.completedAt ?? null });
      } else if (item.type === "commandExecution") {
        commands.push({
          command: String(item.command ?? "").slice(0, 500),
          status: String(item.status ?? "unknown"),
          exitCode: typeof item.exitCode === "number" ? item.exitCode : null,
        });
      } else if (item.type === "fileChange") {
        for (const change of item.changes ?? []) {
          if (change?.path) fileChanges.push({ path: String(change.path), kind: String(change.kind ?? "update") });
        }
      }
    }
  }
  return {
    source: {
      harness: "codex",
      id: String(thread.id),
      title: thread.name ?? thread.preview ?? null,
      model: null,
      provider: thread.modelProvider ?? null,
      createdAt: thread.createdAt ?? null,
      updatedAt: thread.updatedAt ?? null,
      cwd: thread.cwd ?? null,
      git: thread.gitInfo
        ? { branch: thread.gitInfo.branch ?? null, head: thread.gitInfo.sha ?? null }
        : null,
      status: thread.status?.type ?? null,
    },
    messages,
    commands,
    fileChanges,
    partial,
  };
}

/** @param {{cwd: string, limit: number, command?: string}} options */
export async function listCodexSessions(options) {
  const client = new CodexClient({ command: options.command });
  try {
    await client.initialize();
    /** @type {any[]} */
    const sessions = [];
    let cursor = null;
    while (sessions.length < options.limit) {
      const result = await client.request("thread/list", {
        cursor,
        limit: Math.min(50, options.limit - sessions.length),
        sortKey: "updated_at",
        sortDirection: "desc",
        sourceKinds: ["cli", "vscode", "exec", "appServer"],
        cwd: options.cwd,
      });
      sessions.push(...(result?.data ?? []));
      cursor = result?.nextCursor ?? null;
      if (!cursor) break;
    }
    return sessions.slice(0, options.limit).map((thread) => ({
      source: "codex",
      id: String(thread.id),
      title: thread.name ?? thread.preview ?? "Untitled Codex session",
      cwd: thread.cwd ?? null,
      createdAt: thread.createdAt ?? null,
      updatedAt: thread.updatedAt ?? null,
      status: thread.status?.type ?? null,
      workspaceWarning: null,
    }));
  } finally {
    client.close();
  }
}

/** @param {{id: string, command?: string}} options */
export async function readCodexSession(options) {
  const client = new CodexClient({ command: options.command });
  try {
    await client.initialize();
    const result = await client.request("thread/read", { threadId: options.id, includeTurns: true });
    if (!result?.thread) {
      throw new ResumeError("SESSION_NOT_FOUND", `Codex session not found: ${options.id}`);
    }
    return normalizeCodexThread(result.thread);
  } finally {
    client.close();
  }
}
