---
name: doctor
description: Check whether Codex and Grok session handoff adapters are available. Use for /resume:doctor or to diagnose why a resume import failed.
---

# Resume doctor

Run `node "<plugin-root>/scripts/resume.mjs" doctor` and explain the reported
capabilities and remediation. Resolve `<plugin-root>` the same way as the
`from` skill: `${CLAUDE_PLUGIN_ROOT}` in Claude Code, or the directory two
levels above this file (`<plugin-root>/skills/doctor/SKILL.md`) in other hosts
such as Devin — the base directory is shown by `devin skills show resume:doctor`.
Do not install, update, authenticate, or modify either harness. Report the
broker output faithfully.
