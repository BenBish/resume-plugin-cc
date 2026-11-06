#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";
import { listCodexSessions, readCodexSession } from "./lib/codex.mjs";
import { listGrokSessions, readGrokSession } from "./lib/grok.mjs";
import { resolveRepoRoot, canonicalPath } from "./lib/repo.mjs";
import { redactText } from "./lib/redact.mjs";
import { snapshotWorkspace } from "./lib/workspace.mjs";
import { buildHandoff } from "./lib/normalize.mjs";
import { commandVersion } from "./lib/process.mjs";
import { ResumeError, errorResult } from "./lib/errors.mjs";

const SOURCES = ["codex", "grok"];
const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_BYTES = 80 * 1024;

/** @param {string[]} argv */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  /** @type {Record<string, string | boolean | undefined>} */
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--no-redact") options.redact = false;
    else if (arg.startsWith("--")) {
      const name = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = rest[++index];
      if (!value || value.startsWith("--")) {
        throw new ResumeError("INVALID_ARGUMENTS", `Missing value for ${arg}.`);
      }
      options[name] = value;
    } else {
      throw new ResumeError("INVALID_ARGUMENTS", `Unexpected argument: ${arg}`);
    }
  }
  return { command, options };
}

/** @param {unknown} value @param {number} fallback @param {number} max */
function positiveInteger(value, fallback, max) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > max) {
    throw new ResumeError("INVALID_ARGUMENTS", `Expected an integer between 1 and ${max}, received ${value}.`);
  }
  return number;
}

/** @param {string} source @param {{cwd: string, limit: number}} options */
async function listOne(source, options) {
  if (source === "codex") return listCodexSessions(options);
  if (source === "grok") return listGrokSessions(options);
  throw new ResumeError("INVALID_SOURCE", `Unsupported source: ${source}`);
}

/** @param {string} source @param {string} id */
async function readOne(source, id) {
  if (source === "codex") return readCodexSession({ id });
  if (source === "grok") return readGrokSession({ id });
  throw new ResumeError("INVALID_SOURCE", `Unsupported source: ${source}`);
}

/**
 * Sessions without a recorded cwd cannot be ruled out and are kept, matching
 * the workspace-warning behavior in `list`.
 * @param {any} session @param {string} cwd
 */
function sessionInRepo(session, cwd) {
  if (!session.cwd) return true;
  return canonicalPath(String(session.cwd)) === cwd;
}

/** @param {Record<string, string | boolean | undefined>} options */
async function listCommand(options) {
  const cwd = resolveRepoRoot(typeof options.cwd === "string" ? options.cwd : process.cwd());
  const limit = positiveInteger(options.limit, DEFAULT_LIMIT, 100);
  const source = typeof options.source === "string" ? options.source : null;
  if (source && !SOURCES.includes(source)) throw new ResumeError("INVALID_SOURCE", `Unsupported source: ${source}`);
  const selectedSources = source ? [source] : SOURCES;
  const redact = options.redact !== false;
  /** @type {any[]} */
  const sessions = [];
  /** @type {Array<{source: string, code: string, message: string}>} */
  const warnings = [];
  for (const selected of selectedSources) {
    try {
      const found = await listOne(selected, { cwd, limit });
      for (const session of found) {
        if (!sessionInRepo(session, cwd)) continue;
        if (session.title) session.title = redactText(String(session.title), redact).text;
        if (!session.cwd) {
          session.workspaceWarning = "Source CLI did not expose a working directory; verify before continuing.";
        }
        sessions.push(session);
      }
    } catch (error) {
      if (source) throw error;
      const result = errorResult(error).error;
      warnings.push({ source: selected, code: result.code, message: result.message });
    }
  }
  sessions.sort((a, b) => {
    const left = Date.parse(a.updatedAt ?? "") || Number(a.updatedAt) * 1000 || 0;
    const right = Date.parse(b.updatedAt ?? "") || Number(b.updatedAt) * 1000 || 0;
    return right - left;
  });
  return { ok: true, repo: cwd, sessions: sessions.slice(0, limit), warnings };
}

/** @param {Record<string, string | boolean | undefined>} options */
async function inspectCommand(options) {
  const source = typeof options.source === "string" ? options.source : "";
  let id = typeof options.id === "string" ? options.id : "";
  if (!SOURCES.includes(source)) throw new ResumeError("INVALID_SOURCE", "inspect requires --source codex or --source grok.");
  if (!id) throw new ResumeError("INVALID_ARGUMENTS", "inspect requires --id <session-id|latest>.");
  const cwd = resolveRepoRoot(typeof options.cwd === "string" ? options.cwd : process.cwd());
  if (id === "latest") {
    const sessions = (await listOne(source, { cwd, limit: 25 })).filter((session) => sessionInRepo(session, cwd));
    if (!sessions.length) throw new ResumeError("NO_SESSIONS", `No ${source} sessions were found for this repository.`);
    id = sessions[0].id;
  }
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES, 1024 * 1024);
  const raw = await readOne(source, id);
  const workspace = snapshotWorkspace(cwd);
  return { ok: true, handoff: buildHandoff(raw, workspace, { maxBytes, redact: options.redact !== false }) };
}

async function doctorCommand() {
  const node = { available: true, version: process.version, supported: Number(process.versions.node.split(".")[0]) >= 20 };
  const git = await commandVersion("git");
  const codex = await commandVersion(process.env.RESUME_CODEX_BIN ?? "codex");
  const grok = await commandVersion(process.env.RESUME_GROK_BIN ?? "grok");
  let repo = null;
  let repoError = null;
  try {
    repo = resolveRepoRoot(process.cwd());
  } catch (error) {
    repoError = error instanceof Error ? error.message : String(error);
  }
  return {
    ok: true,
    node,
    git,
    codex: { ...codex, adapter: "codex app-server stdio thread/list + thread/read" },
    grok: { ...grok, adapter: "grok sessions list + grok export" },
    repo: { available: repo !== null, root: repo, error: repoError },
    ready: node.supported && git.available && (codex.available || grok.available) && repo !== null,
  };
}

/** @param {string[]} argv */
export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === "list") return listCommand(options);
  if (command === "inspect") return inspectCommand(options);
  if (command === "doctor") return doctorCommand();
  throw new ResumeError("INVALID_ARGUMENTS", "Usage: resume.mjs <list|inspect|doctor> [options]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.log(JSON.stringify(errorResult(error), null, 2));
      process.exitCode = 1;
    });
}
