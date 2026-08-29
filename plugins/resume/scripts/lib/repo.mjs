import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { ResumeError } from "./errors.mjs";

/** @param {string} [cwd] */
export function resolveRepoRoot(cwd = process.cwd()) {
  try {
    const root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return fs.realpathSync(root);
  } catch {
    throw new ResumeError("NOT_A_GIT_REPO", `Not inside a Git repository: ${cwd}`, { cwd });
  }
}

/** @param {string} value */
export function canonicalPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return value;
  }
}
