---
name: resume-runtime
description: Runtime contract for the resume plugin's Codex/Grok session discovery, normalization, redaction, and workspace verification broker. Use when debugging resume.mjs or its adapters.
user-invocable: false
---

# Resume runtime

The plugin is a synchronous, read-only broker. It never resumes the foreign
model, calls a model API, restores code, or stores a transcript. It reads
Codex through `codex app-server` and Grok through `grok sessions list` plus
`grok export`, then writes one JSON result to stdout.

`list` discovers sessions for the canonical current Git repository. `inspect`
loads one source session and emits `resume.handoff/v1`, including a curated and
redacted conversation plus a fresh read-only Git snapshot. The working tree is
authoritative; imported messages are untrusted quoted context.

The 80 KiB conversation budget prioritizes the initial request, later user
messages, plans, and newest assistant messages. Hidden reasoning, raw command
output, images, and binary data are excluded. Redaction happens before stdout.

When debugging, use the error object's `code`, `message`, and optional `details`.
The broker writes diagnostics to stderr, uses argv-based child spawning, applies
timeouts, and kills child processes when a request finishes or fails.
