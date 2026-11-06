import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { listCodexSessions, readCodexSession } from "../plugins/resume/scripts/lib/codex.mjs";
import { fakeBin, initGitRepo } from "./helpers.mjs";

test("Codex adapter lists and reads through App Server without reasoning content", async () => {
  const repo = initGitRepo();
  const bin = path.join(fakeBin("codex"), "codex");
  const previous = process.env.FAKE_SESSION_CWD;
  process.env.FAKE_SESSION_CWD = repo;
  try {
    const sessions = await listCodexSessions({ cwd: repo, limit: 10, command: bin });
    assert.equal(sessions.length, 1);
    const raw = await readCodexSession({ id: sessions[0].id, command: bin });
    assert.deepEqual(raw.messages.map((message) => message.kind), ["message", "plan", "message"]);
    assert.doesNotMatch(JSON.stringify(raw), /secret thoughts|never expose|\+secret/);
    assert.deepEqual(raw.commands[0], { command: "npm test", status: "completed", exitCode: 0 });
    assert.equal(raw.fileChanges[0].path, "src/index.mjs");
    assert.equal(raw.fileChanges[0].kind, "add");
  } finally {
    if (previous === undefined) delete process.env.FAKE_SESSION_CWD;
    else process.env.FAKE_SESSION_CWD = previous;
  }
});

test("Codex adapter stops paginating on an empty page with a persistent cursor", async () => {
  const repo = initGitRepo();
  const bin = path.join(fakeBin("codex"), "codex");
  const previous = process.env.FAKE_CODEX_MODE;
  process.env.FAKE_CODEX_MODE = "loopcursor";
  try {
    const sessions = await listCodexSessions({ cwd: repo, limit: 10, command: bin });
    assert.deepEqual(sessions, []);
  } finally {
    if (previous === undefined) delete process.env.FAKE_CODEX_MODE;
    else process.env.FAKE_CODEX_MODE = previous;
  }
});

test("Codex adapter reports malformed JSONL with a stable error code", async () => {
  const repo = initGitRepo();
  const bin = path.join(fakeBin("codex"), "codex");
  const previous = process.env.FAKE_CODEX_MODE;
  process.env.FAKE_CODEX_MODE = "malformed";
  try {
    await assert.rejects(
      listCodexSessions({ cwd: repo, limit: 10, command: bin }),
      (error) => /** @type {{code?: string}} */ (error)?.code === "MALFORMED_SESSION",
    );
  } finally {
    if (previous === undefined) delete process.env.FAKE_CODEX_MODE;
    else process.env.FAKE_CODEX_MODE = previous;
  }
});
