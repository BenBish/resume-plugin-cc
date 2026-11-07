import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = fileURLToPath(new URL("../plugins/resume", import.meta.url));
const MARKETPLACE = fileURLToPath(new URL("../.claude-plugin/marketplace.json", import.meta.url));

/** @param {string} skillName */
function readSkill(skillName) {
  const file = path.join(PLUGIN_ROOT, "skills", skillName, "SKILL.md");
  assert.ok(fs.existsSync(file), `expected ${file} to exist`);
  const text = fs.readFileSync(file, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(match, `${file} must start with a frontmatter block`);
  /** @type {Record<string, string>} */
  const frontmatter = {};
  for (const line of match[1].split("\n")) {
    const entry = /^([a-z-]+):\s*(.*)$/.exec(line.trim());
    if (entry) frontmatter[entry[1]] = entry[2].replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: match[2] };
}

test("the plugin exposes from and doctor as user-invocable skills named after their directories", () => {
  for (const name of ["from", "doctor"]) {
    const { frontmatter } = readSkill(name);
    assert.equal(frontmatter.name ?? name, name);
    assert.ok(frontmatter.description, `${name} needs a description for discovery`);
    assert.notEqual(frontmatter["user-invocable"], "false", `${name} must stay user-invocable`);
  }
});

test("no legacy commands/ directory duplicates the skill registrations", () => {
  const commandsDir = path.join(PLUGIN_ROOT, "commands");
  if (fs.existsSync(commandsDir)) {
    const commands = fs.readdirSync(commandsDir).map((file) => path.basename(file, path.extname(file)));
    const skills = fs.readdirSync(path.join(PLUGIN_ROOT, "skills"));
    assert.deepEqual(
      commands.filter((command) => skills.includes(command)),
      [],
      "a command and skill with the same name would register twice",
    );
  }
});

test("the public skills resolve the broker through supported plugin-root conventions", () => {
  for (const name of ["from", "doctor"]) {
    const { body } = readSkill(name);
    assert.match(body, /scripts\/resume\.mjs/);
    assert.match(body, /\$\{CLAUDE_PLUGIN_ROOT\}/, `${name} must document the Claude Code convention`);
    assert.match(body, /skills\/(from|doctor)\/SKILL\.md/, `${name} must document the skill-relative fallback`);
    assert.doesNotMatch(body, /plugins\/cache|\.claude\/plugins/i, `${name} must not hardcode a cache path`);
  }
});

test("from supports source selection, explicit ids, latest, and continuation instructions", () => {
  const { frontmatter, body } = readSkill("from");
  assert.match(frontmatter["argument-hint"] ?? "", /codex\|grok/);
  assert.match(frontmatter["argument-hint"] ?? "", /latest/);
  assert.match(body, /--source codex|--source grok/);
  assert.match(body, /--id <id>/);
  assert.match(body, /`latest`/);
  assert.match(body, /continuation text after `--`/);
  assert.match(body, /untrusted/i);
});

test("from selects through the host's supported question interface", () => {
  const { body } = readSkill("from");
  assert.match(body, /AskUserQuestion/);
  assert.match(body, /ask_user_question/);
});

test("doctor invokes only read-only adapter diagnostics", () => {
  const { body } = readSkill("doctor");
  assert.match(body, /resume\.mjs" doctor/);
  assert.match(body, /Do not install, update, authenticate, or modify/);
});

test("the runtime contract remains available as internal debugging guidance", () => {
  const { frontmatter, body } = readSkill("resume-runtime");
  assert.equal(frontmatter["user-invocable"], "false", "resume-runtime must not be a user command");
  assert.match(body, /RUNTIME\.md/);
  const contract = fs.readFileSync(path.join(PLUGIN_ROOT, "skills", "resume-runtime", "RUNTIME.md"), "utf8");
  assert.match(contract, /read-only broker/);
  assert.match(contract, /untrusted/i);
  const fromBody = readSkill("from").body;
  assert.match(fromBody, /resume-runtime\/RUNTIME\.md/);
});

test("manifests keep the resume plugin and marketplace names", () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE, "utf8"));
  assert.equal(plugin.name, "resume");
  assert.equal(marketplace.name, "resume");
  assert.deepEqual(marketplace.plugins.map((/** @type {{name: string}} */ entry) => entry.name), ["resume"]);
});
