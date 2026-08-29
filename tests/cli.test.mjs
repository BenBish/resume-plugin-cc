import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fakeBin, initGitRepo, runResume } from "./helpers.mjs";

/** @param {string} repo */
function harnessEnv(repo) {
  const codexDir = fakeBin("codex");
  const grokDir = fakeBin("grok");
  return {
    PATH: `${codexDir}${path.delimiter}${grokDir}${path.delimiter}${process.env.PATH}`,
    FAKE_SESSION_CWD: repo,
  };
}

test("list merges current-repo Codex and Grok sessions", () => {
  const repo = initGitRepo();
  const result = runResume(["list", "--cwd", repo], { cwd: repo, env: harnessEnv(repo) });
  assert.equal(result.status, 0);
  assert.deepEqual(
    new Set(result.output.sessions.map((/** @type {{source: string}} */ session) => session.source)),
    new Set(["codex", "grok"]),
  );
});

test("inspect emits a redacted, workspace-grounded Grok handoff without executing transcript text", () => {
  const repo = initGitRepo();
  const marker = "/tmp/resume-plugin-pwned";
  try {
    fs.unlinkSync(marker);
  } catch {}
  const result = runResume(
    ["inspect", "--source", "grok", "--id", "123e4567-e89b-42d3-a456-426614174000", "--cwd", repo],
    { cwd: repo, env: harnessEnv(repo) },
  );
  assert.equal(result.status, 0);
  assert.equal(result.output.handoff.schema, "resume.handoff/v1");
  assert.equal(result.output.handoff.currentWorkspace.root, repo);
  assert.doesNotMatch(JSON.stringify(result.output), /very-secret-token-value/);
  assert.equal(fs.existsSync(marker), false);
});

test("inspect marks dirty workspace state and can explicitly disable redaction", () => {
  const repo = initGitRepo();
  fs.appendFileSync(path.join(repo, "README.md"), "dirty\n");
  const result = runResume(
    [
      "inspect",
      "--source",
      "grok",
      "--id",
      "123e4567-e89b-42d3-a456-426614174000",
      "--cwd",
      repo,
      "--no-redact",
    ],
    { cwd: repo, env: harnessEnv(repo) },
  );
  assert.equal(result.status, 0);
  assert.equal(result.output.handoff.currentWorkspace.dirty, true);
  assert.deepEqual(result.output.handoff.currentWorkspace.changedFiles, [{ status: " M", path: "README.md" }]);
  assert.match(JSON.stringify(result.output), /very-secret-token-value/);
  assert.equal(result.output.handoff.conversation.redaction.enabled, false);
});

test("an active Codex session is imported with an explicit warning", () => {
  const repo = initGitRepo();
  const result = runResume(
    ["inspect", "--source", "codex", "--id", "01912345-6789-7abc-8def-0123456789ab", "--cwd", repo],
    { cwd: repo, env: { ...harnessEnv(repo), FAKE_CODEX_MODE: "active" } },
  );
  assert.equal(result.status, 0);
  assert.ok(
    result.output.handoff.warnings.some((/** @type {string} */ warning) =>
      /active, interrupted, or incomplete/.test(warning),
    ),
  );
});

test("missing source CLI errors are structured", () => {
  const repo = initGitRepo();
  const result = runResume(
    ["inspect", "--source", "codex", "--id", "01912345-6789-7abc-8def-0123456789ab", "--cwd", repo],
    { cwd: repo, env: { ...harnessEnv(repo), RESUME_CODEX_BIN: "/definitely/missing/codex" } },
  );
  assert.notEqual(result.status, 0);
  assert.equal(result.output.error.code, "CLI_NOT_FOUND");
});

test("a source failure is structured and nonzero", () => {
  const repo = initGitRepo();
  const result = runResume(["list", "--source", "grok", "--cwd", repo], {
    cwd: repo,
    env: { ...harnessEnv(repo), FAKE_GROK_MODE: "unparseable" },
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.output.error.code, "GROK_LIST_UNPARSEABLE");
});

test("doctor is read-only and reports both fake harnesses", () => {
  const repo = initGitRepo();
  const result = runResume(["doctor"], { cwd: repo, env: harnessEnv(repo) });
  assert.equal(result.status, 0);
  assert.equal(result.output.ready, true);
  assert.equal(result.output.codex.available, true);
  assert.equal(result.output.grok.available, true);
});
