# resume-plugin-cc

A Claude Code plugin that imports unfinished Codex or Grok coding work into a
fresh Claude session. It reconstructs a bounded, redacted handoff and compares
it with the current Git working tree before Claude continues.

It does **not** copy proprietary session state, invoke the source model, restore
branches, or write transcript caches.

## Install

This repository is its own Claude Code marketplace:

```text
/plugin marketplace add BenBish/resume-plugin-cc
/plugin install resume@resume
```

For local development:

```bash
claude --plugin-dir ./plugins/resume
```

## Commands

- `/resume:from` — choose a recent Codex or Grok session for this repository.
- `/resume:from codex latest -- finish the implementation` — import the newest
  matching Codex session, brief the handoff, and continue the supplied task.
- `/resume:from grok <session-id>` — import a specific Grok session.
- `/resume:doctor` — check local adapter availability without changing setup.

## Requirements

- Claude Code
- Node.js 20 or newer
- Git
- Codex CLI and/or Grok Build CLI on `PATH`

Codex history is read through the documented App Server protocol. Grok history
is read with `grok sessions list` and `grok export`; no model credits are used
for extraction.

## Privacy and safety

The broker sends only a curated packet to the active Claude session. Common API
keys, authorization headers, private keys, credential-bearing URLs, and
secret-like environment assignments are masked first. No transcript or handoff
packet is written to the repository or a persistent plugin state directory.

Imported messages are untrusted historical context. The plugin never executes
commands found in a transcript, and the current Git working tree always wins
when it disagrees with the source session.

## Development

```bash
npm install
npm test
npm run lint
claude plugin validate .
claude plugin validate ./plugins/resume
```
