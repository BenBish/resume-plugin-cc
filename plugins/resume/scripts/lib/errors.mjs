export class ResumeError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ResumeError";
    this.code = code;
    this.details = details;
  }
}

/** @param {unknown} error */
export function errorResult(error) {
  if (error instanceof ResumeError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: { code: "INTERNAL_ERROR", message } };
}
