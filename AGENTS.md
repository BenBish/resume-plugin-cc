# AGENTS.md

## Structure

The consumer plugin is only `plugins/resume/`. The repository root contains
the marketplace catalog, tests, and contributor tooling.

User-facing workflows live under `plugins/resume/skills/` (`from`, `doctor`),
which both Claude Code and Devin register as `/resume:from` and
`/resume:doctor`. Do not re-add a `commands/` directory: a command and a skill
with the same name would register the slash command twice in Claude Code.
`skills/resume-runtime/` is an internal, model-only debugging skill whose
contract lives in `RUNTIME.md` beside its `SKILL.md`.

Runtime code is committed `.mjs` and must work with Node.js 20 without runtime
npm dependencies or a build step. Do not add hooks, persistent transcript
storage, source-model calls, or workspace mutations.

## Commands

```bash
npm test # serialized subprocess fixtures with the stable spec reporter
npm run lint
claude plugin validate .
claude plugin validate ./plugins/resume
```

## Safety invariants

- Spawn child processes with argv arrays; never execute transcript content.
- Redact before emitting transcript text on stdout.
- Keep Git inspection read-only and treat the current tree as authoritative.
- Tests must isolate HOME/XDG paths and use fake harness executables.
