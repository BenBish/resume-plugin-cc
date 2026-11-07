---
name: resume-runtime
description: Internal runtime contract for the resume plugin's Codex/Grok session discovery, normalization, redaction, and workspace verification broker. Use only when debugging resume.mjs or its adapters; the user-facing resume commands are /resume:from and /resume:doctor.
user-invocable: false
---

# Resume runtime

The broker's runtime contract lives in [RUNTIME.md](RUNTIME.md) in this skill
directory. Load it when debugging `scripts/resume.mjs` or its adapters.
