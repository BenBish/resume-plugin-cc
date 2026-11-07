import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fakeBin, git, initGitRepo, mkTmpDir, runResume, RESUME_SCRIPT, TEST_HOME } from "./helpers.mjs";

/** @param {string} repo */
function harnessEnv(repo) {
  const codexDir = fakeBin("codex");
  const grokDir = fakeBin("grok");
  return {
    PATH: `${codexDir}${path.delimiter}${grokDir}${path.delimiter}${process.env.PATH}`,
    FAKE_SESSION_CWD: repo,
  };
}

test("list merges current-repo Codex and Grok sessions and redacts session titles", () => {
  const repo = initGitRepo();
  const result = runResume(["list", "--cwd", repo], { cwd: repo, env: harnessEnv(repo) });
  assert.equal(result.status, 0);
  assert.deepEqual(
    new Set(result.output.sessions.map((/** @type {{source: string}} */ session) => session.source)),
    new Set(["codex", "grok"]),
  );
  const serialized = JSON.stringify(result.output);
  assert.doesNotMatch(serialized, /sk-proj-fakepreview999888|sk-proj-groktitle54321/);
  assert.match(serialized, /\[REDACTED/);
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

test("a staged rename does not produce a phantom changed-file entry", () => {
  const repo = initGitRepo();
  git(repo, ["mv", "README.md", "RENAMED.md"]);
  const result = runResume(
    ["inspect", "--source", "grok", "--id", "123e4567-e89b-42d3-a456-426614174000", "--cwd", repo],
    { cwd: repo, env: harnessEnv(repo) },
  );
  assert.equal(result.status, 0);
  assert.deepEqual(result.output.handoff.currentWorkspace.changedFiles, [{ status: "R ", path: "RENAMED.md" }]);
});

test("the broker runs when the plugin path contains spaces", () => {
  const spaced = path.join(mkTmpDir("resume plugin spaced-"), "plugins", "resume");
  fs.cpSync(path.join(path.dirname(RESUME_SCRIPT), ".."), spaced, { recursive: true });
  const repo = initGitRepo();
  const stdout = execFileSync(process.execPath, [path.join(spaced, "scripts", "resume.mjs"), "doctor"], {
    cwd: repo,
    env: { ...process.env, HOME: TEST_HOME, XDG_CONFIG_HOME: TEST_HOME, ...harnessEnv(repo) },
    encoding: "utf8",
  });
  assert.equal(JSON.parse(stdout).ok, true);
});

test("the broker runs when the plugin path traverses a symlink", () => {
  const linkRoot = path.join(mkTmpDir("resume-plugin-link-"), "linked-plugin");
  fs.symlinkSync(path.dirname(path.dirname(RESUME_SCRIPT)), linkRoot, "dir");
  const repo = initGitRepo();
  const stdout = execFileSync(process.execPath, [path.join(linkRoot, "scripts", "resume.mjs"), "doctor"], {
    cwd: repo,
    env: { ...process.env, HOME: TEST_HOME, XDG_CONFIG_HOME: TEST_HOME, ...harnessEnv(repo) },
    encoding: "utf8",
  });
  assert.equal(JSON.parse(stdout).ok, true);
});

test("a Grok import without export metadata recovers workspace identity from the session store", () => {
  const repo = initGitRepo();
  const grokHome = mkTmpDir("resume-plugin-grok-home-");
  const sessionDir = path.join(grokHome, "sessions", encodeURIComponent(repo), "123e4567-e89b-42d3-a456-426614174000");
  fs.mkdirSync(sessionDir, { recursive: true });
  const result = runResume(
    ["inspect", "--source", "grok", "--id", "123e4567-e89b-42d3-a456-426614174000", "--cwd", repo],
    { cwd: repo, env: { ...harnessEnv(repo), FAKE_GROK_MODE: "nocwd", GROK_HOME: grokHome } },
  );
  assert.equal(result.status, 0);
  assert.equal(result.output.handoff.source.cwd, repo);
  assert.equal(
    result.output.handoff.warnings.some((/** @type {string} */ warning) =>
      /workspace identity|cwd differs/.test(warning),
    ),
    false,
  );
});

test("a Grok session with no recoverable workspace identity is imported with an explicit warning", () => {
  const repo = initGitRepo();
  const grokHome = mkTmpDir("resume-plugin-grok-home-");
  const result = runResume(
    ["inspect", "--source", "grok", "--id", "123e4567-e89b-42d3-a456-426614174000", "--cwd", repo],
    { cwd: repo, env: { ...harnessEnv(repo), FAKE_GROK_MODE: "nocwd", GROK_HOME: grokHome } },
  );
  assert.equal(result.status, 0);
  assert.equal(result.output.handoff.source.cwd, null);
  assert.ok(
    result.output.handoff.warnings.some((/** @type {string} */ warning) => /workspace identity/.test(warning)),
  );
});

test("--id latest imports the newest session scoped to the broker's --cwd", () => {
  const repo = initGitRepo();
  const { FAKE_SESSION_CWD: _ignored, ...env } = harnessEnv(repo);
  const result = runResume(["inspect", "--source", "grok", "--id", "latest", "--cwd", repo], {
    cwd: repo,
    env,
  });
  assert.equal(result.status, 0);
  assert.equal(result.output.handoff.source.id, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(result.output.handoff.source.cwd, repo);
});

test("--id latest does not pick a session recorded for a different repository", () => {
  const repo = initGitRepo();
  const otherRepo = initGitRepo();
  const result = runResume(["inspect", "--source", "grok", "--id", "latest", "--cwd", repo], {
    cwd: repo,
    env: { ...harnessEnv(otherRepo) },
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.output.error.code, "NO_SESSIONS");
});
