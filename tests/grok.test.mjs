import test from "node:test";
import assert from "node:assert/strict";
import { parseGrokSessionList, parseGrokExport } from "../plugins/resume/scripts/lib/grok.mjs";

test("parses Grok's human-readable session list defensively", () => {
  const sessions = parseGrokSessionList(
    "123e4567-e89b-42d3-a456-426614174000 | 2026-08-28T12:00:00Z | /tmp/project | Fix parser",
    10,
  );
  assert.equal(sessions[0].id, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(sessions[0].cwd, "/tmp/project");
  assert.match(sessions[0].title, /Fix parser/);
});

test("parses only user, assistant, and plan sections from a Grok export", () => {
  const result = parseGrokExport(`# Session
Title: Test
Cwd: /tmp/project

## User
Please fix it.

## Assistant
Fixed it.

## Tool output
raw secret output

## Plan
Run tests.`);
  assert.deepEqual(result.messages.map((message) => message.kind), ["message", "message", "plan"]);
  assert.equal(result.metadata.cwd, "/tmp/project");
  assert.doesNotMatch(result.messages.map((message) => message.text).join("\n"), /raw secret output/);
});
