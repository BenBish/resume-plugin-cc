import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFile } from "./process.mjs";
import { ResumeError } from "./errors.mjs";

const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const ID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

/** @param {string} value */
export function stripAnsi(value) {
  return value.replace(ANSI_PATTERN, "");
}

/** @param {string} output @param {number} limit */
export function parseGrokSessionList(output, limit) {
  const clean = stripAnsi(output).trim();
  if (!clean || /no sessions found/i.test(clean)) return [];
  try {
    const parsed = JSON.parse(clean);
    const rows = Array.isArray(parsed) ? parsed : parsed.sessions ?? parsed.data;
    if (Array.isArray(rows)) {
      return rows
        .slice(0, limit)
        .map((row) => {
          const id = row.id ?? row.sessionId ?? row.session_id;
          if (id === undefined || id === null) return null;
          return {
            source: "grok",
            id: String(id),
            title: row.title ?? row.summary ?? row.firstPrompt ?? "Untitled Grok session",
            cwd: row.cwd ?? null,
            createdAt: row.createdAt ?? row.created_at ?? null,
            updatedAt: row.updatedAt ?? row.updated_at ?? null,
            status: row.status ?? null,
            workspaceWarning: null,
          };
        })
        .filter(Boolean);
    }
  } catch {
    // Current Grok CLI emits a human table. Parse it defensively below.
  }
  /** @type {any[]} */
  const sessions = [];
  for (const line of clean.split("\n")) {
    const id = line.match(ID_PATTERN)?.[0];
    if (!id) continue;
    const withoutId = line.replace(id, " ").replace(/[│|]/g, " ").replace(/\s+/g, " ").trim();
    const iso = withoutId.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?\b/)?.[0] ?? null;
    const absolutePath = withoutId.match(/(?:^|\s)(\/(?:[^\s]+\/)*[^\s]+)/)?.[1] ?? null;
    let title = withoutId;
    if (iso) title = title.replace(iso, " ");
    if (absolutePath) title = title.replace(absolutePath, " ");
    title = title.replace(/\s+/g, " ").trim() || "Untitled Grok session";
    sessions.push({
      source: "grok",
      id,
      title,
      cwd: absolutePath,
      createdAt: null,
      updatedAt: iso,
      status: null,
      workspaceWarning: null,
    });
    if (sessions.length >= limit) break;
  }
  if (!sessions.length) {
    throw new ResumeError("GROK_LIST_UNPARSEABLE", "Could not parse `grok sessions list`; import by explicit session id.");
  }
  return sessions;
}

/** @param {string} markdown */
export function parseGrokExport(markdown) {
  const lines = stripAnsi(markdown).replace(/\r\n/g, "\n").split("\n");
  /** @type {Array<{role: string, text: string, kind: string}>} */
  const messages = [];
  /** @type {string[]} */
  let buffer = [];
  /** @type {"user" | "assistant" | null} */
  let role = null;
  /** @type {"message" | "plan"} */
  let kind = "message";
  /** @type {Record<string, string | null>} */
  const metadata = { title: null, model: null, cwd: null, createdAt: null, updatedAt: null };

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (role && text) messages.push({ role, text, kind });
    buffer = [];
  };

  for (const line of lines) {
    const meta = line.match(/^\s*(?:[-*]\s*)?(title|model|cwd|working directory|created(?: at)?|updated(?: at)?)\s*:\s*(.+)\s*$/i);
    if (meta && role === null) {
      const key = meta[1].toLowerCase();
      if (key === "working directory") metadata.cwd = meta[2];
      else if (key.startsWith("created")) metadata.createdAt = meta[2];
      else if (key.startsWith("updated")) metadata.updatedAt = meta[2];
      else metadata[key] = meta[2];
      continue;
    }
    const heading = line.match(/^#{1,4}\s*(.+?)\s*$/);
    if (heading) {
      flush();
      const label = heading[1].toLowerCase().replace(/\s+message$/, "");
      if (["user", "human", "assistant", "grok", "plan"].includes(label)) {
        role = label === "user" || label === "human" ? "user" : "assistant";
        kind = label === "plan" ? "plan" : "message";
      } else {
        role = null;
      }
      continue;
    }
    if (role) buffer.push(line);
  }
  flush();
  if (!messages.length) {
    throw new ResumeError("MALFORMED_SESSION", "Grok export did not contain recognizable User/Assistant sections.");
  }
  return { messages, metadata };
}

/** @param {{limit: number, cwd?: string, command?: string}} options */
export async function listGrokSessions(options) {
  const command = options.command ?? process.env.RESUME_GROK_BIN ?? "grok";
  const { stdout } = await runFile(command, ["sessions", "list", "--limit", String(options.limit)], {
    timeoutMs: 15_000,
    cwd: options.cwd,
  });
  return parseGrokSessionList(stdout, options.limit);
}

/**
 * Recover a session's recorded working directory from the on-disk session
 * store. Grok groups session directories under ~/.grok/sessions/<encoded-cwd>/;
 * `grok export` emits no workspace metadata, so this is the only source.
 * @param {string} id
 */
function lookupGrokSessionCwd(id) {
  try {
    const root = path.join(process.env.GROK_HOME || path.join(os.homedir(), ".grok"), "sessions");
    for (const group of fs.readdirSync(root)) {
      try {
        const dir = path.join(root, group);
        if (!fs.statSync(dir).isDirectory()) continue;
        if (!fs.readdirSync(dir).includes(id)) continue;
        const cwdFile = path.join(dir, ".cwd");
        if (fs.existsSync(cwdFile)) {
          const recorded = fs.readFileSync(cwdFile, "utf8").trim();
          if (recorded) return recorded;
        }
        const decoded = decodeURIComponent(group);
        if (decoded.startsWith("/") || /^[A-Za-z]:[\\/]/.test(decoded)) return decoded;
        return null;
      } catch {
        continue;
      }
    }
  } catch {
    // Sessions root unreadable; workspace identity stays unknown.
  }
  return null;
}

/** @param {{id: string, command?: string}} options */
export async function readGrokSession(options) {
  const command = options.command ?? process.env.RESUME_GROK_BIN ?? "grok";
  const { stdout } = await runFile(command, ["export", options.id], { timeoutMs: 20_000, maxBuffer: 16 * 1024 * 1024 });
  const parsed = parseGrokExport(stdout);
  return {
    source: {
      harness: "grok",
      id: options.id,
      title: parsed.metadata.title,
      model: parsed.metadata.model,
      createdAt: parsed.metadata.createdAt,
      updatedAt: parsed.metadata.updatedAt,
      cwd: parsed.metadata.cwd ?? lookupGrokSessionCwd(options.id),
      git: null,
      status: null,
    },
    messages: parsed.messages,
    commands: [],
    fileChanges: [],
    partial: false,
  };
}
