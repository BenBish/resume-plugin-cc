import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const RESUME_SCRIPT = fileURLToPath(new URL("../plugins/resume/scripts/resume.mjs", import.meta.url));

/** Isolated HOME/XDG so git and harness fixtures never read the user's config. */
export const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "resume-plugin-home-"));

/** @param {string} prefix */
export function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** @param {string} cwd @param {string[]} args */
export function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: TEST_HOME, XDG_CONFIG_HOME: TEST_HOME },
  });
}

export function initGitRepo() {
  const repo = mkTmpDir("resume-plugin-repo-");
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "README.md"), "# fixture\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-q", "-m", "init"]);
  return repo;
}

/** @param {"codex" | "grok"} name */
export function fakeBin(name) {
  const dir = mkTmpDir(`resume-plugin-${name}-bin-`);
  const target = fileURLToPath(new URL(`./fake-${name}.mjs`, import.meta.url));
  const shim = path.join(dir, name);
  fs.writeFileSync(shim, `#!/usr/bin/env node\nimport(${JSON.stringify(target)});\n`);
  fs.chmodSync(shim, 0o755);
  return dir;
}

/**
 * @param {string[]} args
 * @param {{cwd: string, env?: NodeJS.ProcessEnv}} options
 */
export function runResume(args, options) {
  try {
    const stdout = execFileSync(process.execPath, [RESUME_SCRIPT, ...args], {
      cwd: options.cwd,
      env: { ...process.env, HOME: TEST_HOME, XDG_CONFIG_HOME: TEST_HOME, ...options.env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: JSON.parse(stdout) };
  } catch (error) {
    const err = /** @type {{status?: number, stdout?: string}} */ (error);
    return { status: err.status ?? 1, output: JSON.parse(err.stdout ?? "{}") };
  }
}
