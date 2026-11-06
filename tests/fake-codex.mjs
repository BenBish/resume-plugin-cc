import readline from "node:readline";

if (process.argv.includes("--version")) {
  console.log("codex-cli 9.9.9-test");
  process.exit(0);
}

const mode = process.env.FAKE_CODEX_MODE ?? "normal";
const cwd = process.env.FAKE_SESSION_CWD ?? process.cwd();
const id = "01912345-6789-7abc-8def-0123456789ab";
const thread = {
  id,
  sessionId: id,
  preview: "Implement the handoff sk-proj-fakepreview999888",
  name: null,
  modelProvider: "openai",
  createdAt: 1700000000,
  updatedAt: 1700000100,
  cwd,
  status: { type: mode === "active" ? "active" : "notLoaded", activeFlags: [] },
  gitInfo: { branch: "main", sha: "deadbeef", originUrl: null },
  turns: [
    {
      id: "turn-1",
      status: "completed",
      startedAt: 1700000000,
      completedAt: 1700000001,
      items: [
        { type: "userMessage", content: [{ type: "text", text: "Build the resume plugin", text_elements: [] }] },
        { type: "reasoning", summary: ["secret thoughts"], content: ["never expose"] },
        { type: "plan", text: "Implement adapters and tests." },
        { type: "commandExecution", command: "npm test", status: "completed", exitCode: 0 },
        { type: "fileChange", changes: [{ path: "src/index.mjs", kind: { type: "add", move_path: null }, diff: "+secret" }] },
        { type: "agentMessage", text: "Adapters are implemented. token=sk-proj-abcdefghijklmnop" },
      ],
    },
  ],
};

if (mode === "malformed") {
  process.stdout.write("not-json\n");
  setTimeout(() => process.exit(0), 20);
} else {
  const lines = readline.createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      console.log(JSON.stringify({ id: message.id, result: { userAgent: "fake" } }));
    } else if (message.method === "thread/list") {
      if (mode === "loopcursor") {
        console.log(JSON.stringify({ id: message.id, result: { data: [], nextCursor: "same-cursor" } }));
      } else {
        console.log(JSON.stringify({ id: message.id, result: { data: [{ ...thread, turns: [] }], nextCursor: null } }));
      }
    } else if (message.method === "thread/read") {
      console.log(JSON.stringify({ id: message.id, result: { thread } }));
    }
  });
}
