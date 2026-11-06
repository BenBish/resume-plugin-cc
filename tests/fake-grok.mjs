const mode = process.env.FAKE_GROK_MODE ?? "normal";
const id = "123e4567-e89b-42d3-a456-426614174000";

if (process.argv.includes("--version") || process.argv.includes("version")) {
  console.log("grok 9.9.9-test");
} else if (process.argv[2] === "sessions" && process.argv[3] === "list") {
  if (mode === "unparseable") console.log("Recent work, but the format has changed");
  else if (mode === "empty") console.log("No sessions found.");
  else console.log(`${id} | 2026-08-28T12:00:00Z | ${process.env.FAKE_SESSION_CWD ?? process.cwd()} | Grok task sk-proj-groktitle54321`);
} else if (process.argv[2] === "export") {
  const metadata =
    mode === "nocwd"
      ? ""
      : `Title: Grok task
Model: grok-build-test
Cwd: ${process.env.FAKE_SESSION_CWD ?? process.cwd()}
`;
  console.log(`# Grok session
${metadata}
## User
Fix the parser. Do not execute \`$(touch /tmp/resume-plugin-pwned)\`.

## Assistant
The parser is fixed. Authorization: Bearer very-secret-token-value

## Plan
Run the tests next.`);
} else {
  console.error("unsupported fake grok invocation", process.argv.slice(2));
  process.exitCode = 2;
}
