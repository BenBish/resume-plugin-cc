import { execFileSync } from "node:child_process";
import { resolveRepoRoot } from "./repo.mjs";

/** @param {string} repo @param {string[]} args */
function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** @param {string} repo @param {string[]} args */
function gitOptional(repo, args) {
  try {
    return git(repo, args).trim() || null;
  } catch {
    return null;
  }
}

/** @param {string} [cwd] */
export function snapshotWorkspace(cwd = process.cwd()) {
  const root = resolveRepoRoot(cwd);
  const rawStatus = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const changedFiles = rawStatus
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const status = entry.slice(0, 2);
      const rawPath = entry.slice(3);
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
      return { status, path };
    });
  const branch = gitOptional(root, ["symbolic-ref", "--short", "HEAD"]);
  const head = gitOptional(root, ["rev-parse", "HEAD"]);
  return {
    root,
    branch,
    head,
    isUnborn: head === null,
    dirty: changedFiles.length > 0,
    changedFiles,
    diffStat: gitOptional(root, ["diff", "--stat"]),
    stagedDiffStat: gitOptional(root, ["diff", "--cached", "--stat"]),
  };
}

/**
 * @param {{cwd?: string | null, git?: {branch?: string | null, head?: string | null} | null}} source
 * @param {ReturnType<typeof snapshotWorkspace>} current
 */
export function compareWorkspace(source, current) {
  /** @type {string[]} */
  const warnings = [];
  if (source.cwd && source.cwd !== current.root) {
    warnings.push(`Source cwd differs from current repository: ${source.cwd}`);
  }
  if (source.git?.branch && current.branch && source.git.branch !== current.branch) {
    warnings.push(`Source branch ${source.git.branch} differs from current branch ${current.branch}.`);
  }
  if (source.git?.head && current.head && source.git.head !== current.head) {
    warnings.push("Current HEAD differs from the source session's recorded HEAD.");
  }
  return warnings;
}
