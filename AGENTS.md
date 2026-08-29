# AGENTS.md

## Structure

The consumer plugin is only `plugins/resume/`. The repository root contains
the marketplace catalog, tests, and contributor tooling.

Runtime code is committed `.mjs` and must work with Node.js 20 without runtime
npm dependencies or a build step. Do not add hooks, persistent transcript
storage, source-model calls, or workspace mutations.

## Commands

```bash
npm test # serialized subprocess fixtures with the stable spec reporter
npm run lint
claude plugin validate --strict .
claude plugin validate --strict ./plugins/resume
```

## Safety invariants

- Spawn child processes with argv arrays; never execute transcript content.
- Redact before emitting transcript text on stdout.
- Keep Git inspection read-only and treat the current tree as authoritative.
- Tests must isolate HOME/XDG paths and use fake harness executables.
