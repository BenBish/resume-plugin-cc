import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { ResumeError } from "./errors.mjs";

const execFileAsync = promisify(execFile);

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd?: string, timeoutMs?: number, env?: NodeJS.ProcessEnv, maxBuffer?: number}} [options]
 */
export async function runFile(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 15_000,
      maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
      encoding: "utf8",
      windowsHide: true,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = /** @type {NodeJS.ErrnoException & {killed?: boolean, signal?: string, stderr?: string}} */ (error);
    if (err.code === "ENOENT") {
      throw new ResumeError("CLI_NOT_FOUND", `${command} was not found on PATH.`, { command });
    }
    if (err.killed || err.signal === "SIGTERM") {
      throw new ResumeError("SOURCE_TIMEOUT", `${command} timed out.`, { command });
    }
    throw new ResumeError("SOURCE_COMMAND_FAILED", `${command} exited unsuccessfully.`, {
      command,
      stderr: String(err.stderr ?? "").trim().slice(0, 2000),
    });
  }
}

/** @param {string} command */
export async function commandVersion(command) {
  try {
    const { stdout, stderr } = await runFile(command, ["--version"], { timeoutMs: 10_000 });
    return { available: true, version: (stdout || stderr).trim().split("\n")[0] || null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, version: null, error: message };
  }
}

export { spawn };
