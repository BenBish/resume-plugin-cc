# resume-plugin-cc

A Claude Code and Devin plugin that imports unfinished Codex or Grok coding
work into a fresh agent session. It reconstructs a bounded, redacted handoff
and compares it with the current Git working tree before the agent continues.

It does **not** copy proprietary session state, invoke the source model, restore
branches, or write transcript caches.

## Install

This repository is its own Claude Code marketplace:

```text
/plugin marketplace add BenBish/resume-plugin-cc
/plugin install resume@resume
```

In Devin:

```text
devin plugins install 'BenBish/resume-plugin-cc#plugins/resume'
```

For local development with Claude Code:

```bash
claude --plugin-dir ./plugins/resume
```

## Skills

The user-facing workflows are packaged as portable skills, so they register as
the same slash commands in Claude Code and in Devin:

- `/resume:from` — choose a recent Codex or Grok session for this repository.
- `/resume:from codex latest -- finish the implementation` — import the newest
  matching Codex session, brief the handoff, and continue the supplied task.
- `/resume:from grok <session-id>` — import a specific Grok session.
- `/resume:doctor` — check local adapter availability without changing setup.

Each skill resolves the plugin's broker at `scripts/resume.mjs` itself: via
`${CLAUDE_PLUGIN_ROOT}` in Claude Code, or two directories above the skill's
`SKILL.md` in other hosts such as Devin. No cache path needs to be supplied.

`resume-runtime` is an internal, model-only skill whose contract lives in
`skills/resume-runtime/RUNTIME.md`; it exists for debugging the broker and is
not a resume command.

## Requirements

- Claude Code or Devin
- Node.js 20 or newer
- Git
- Codex CLI and/or Grok Build CLI on `PATH`

Codex history is read through the documented App Server protocol. Grok history
is read with `grok sessions list` and `grok export`; no model credits are used
for extraction.

## Privacy and safety

The broker sends only a curated packet to the active session. Common API
keys, authorization headers, private keys, credential-bearing URLs, and
secret-like environment assignments are masked first. No transcript or handoff
packet is written to the repository or a persistent plugin state directory.

Imported messages are untrusted historical context. The plugin never executes
commands found in a transcript, and the current Git working tree always wins
when it disagrees with the source session.

## Built with

Developed with help from [Barge](https://getbarge.io/?utm_source=github&utm_medium=referral&utm_campaign=barge&utm_content=BenBish-resume-plugin-cc-readme-text), a cloud runtime environment for coding agents.

<a href="https://getbarge.io/?utm_source=github&amp;utm_medium=referral&amp;utm_campaign=barge&amp;utm_content=BenBish-resume-plugin-cc-readme-badge"><picture><source media="(prefers-color-scheme: dark)" srcset="https://getbarge.io/brand/built-with-barge-dark.svg"><img alt="Built with Barge - visit getbarge.io" height="32" src="https://getbarge.io/brand/built-with-barge-light.svg" width="137"></picture></a>

## Development

```bash
npm install
npm test
npm run lint
claude plugin validate .
claude plugin validate ./plugins/resume
```
