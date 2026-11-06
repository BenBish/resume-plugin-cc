import test from "node:test";
import assert from "node:assert/strict";
import { curateMessages, buildHandoff } from "../plugins/resume/scripts/lib/normalize.mjs";

test("curation keeps the initial request and newest content under its byte budget", () => {
  const messages = [
    { role: "user", kind: "message", text: "initial goal" },
    ...Array.from({ length: 20 }, (_, index) => ({ role: "assistant", kind: "message", text: `old ${index} ${"x".repeat(100)}` })),
    { role: "user", kind: "message", text: "important correction" },
    { role: "assistant", kind: "plan", text: "latest plan" },
  ];
  const result = curateMessages(messages, 700, true);
  assert.equal(result.messages[0].text, "initial goal");
  assert.ok(result.messages.some((message) => message.text === "important correction"));
  assert.ok(result.messages.some((message) => message.text === "latest plan"));
  assert.equal(result.truncated, true);
  assert.ok(result.contentBytes <= 700);
});

test("handoff redacts secrets and marks transcript trust", () => {
  const raw = {
    source: { harness: "codex", id: "s1", title: "task", model: "openai", cwd: "/repo", git: null },
    messages: [{ role: "user", kind: "message", text: "Use sk-proj-abcdefghijklmnop and TOKEN=secret-value and password=lower-secret-123" }],
    commands: [{ command: "curl -H 'Authorization: Bearer secret-value'", status: "completed", exitCode: 0 }],
    fileChanges: [],
    partial: false,
  };
  const workspace = {
    root: "/repo",
    branch: "main",
    head: "abc",
    isUnborn: false,
    dirty: false,
    changedFiles: [],
    diffStat: null,
    stagedDiffStat: null,
  };
  const packet = buildHandoff(raw, workspace, { maxBytes: 10_000, redact: true });
  const serialized = JSON.stringify(packet);
  assert.doesNotMatch(serialized, /abcdefghijklmnop|secret-value|lower-secret-123/);
  assert.equal(packet.trust.transcriptIsUntrusted, true);
  assert.equal(packet.trust.persistedByPlugin, false);
});

test("handoff warns when the source exposes no workspace identity", () => {
  const raw = {
    source: { harness: "grok", id: "s2", title: "task", model: null, cwd: null, git: null },
    messages: [{ role: "user", kind: "message", text: "do a thing" }],
    commands: [],
    fileChanges: [],
    partial: false,
  };
  const workspace = {
    root: "/repo",
    branch: "main",
    head: "abc",
    isUnborn: false,
    dirty: false,
    changedFiles: [],
    diffStat: null,
    stagedDiffStat: null,
  };
  const packet = buildHandoff(raw, workspace, { maxBytes: 10_000, redact: true });
  assert.ok(packet.warnings.some((warning) => /workspace identity/.test(warning)));
});
