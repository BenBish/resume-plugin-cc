const RULES = [
  {
    kind: "private_key",
    pattern: /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/g,
  },
  {
    kind: "authorization",
    pattern: /\b(authorization\s*[:=]\s*(?:bearer|basic)\s+)[^\s"']+/gi,
    replacement: "$1[REDACTED]",
  },
  {
    kind: "provider_key",
    pattern: /\b(?:sk-(?:proj-)?|xai-|ghp_|github_pat_|glpat-|AIza)[A-Za-z0-9._-]{12,}\b/g,
  },
  {
    kind: "credential_url",
    pattern: /\b(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi,
    replacement: "$1[REDACTED]@",
  },
  {
    kind: "secret_assignment",
    pattern: /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*)[^\s"']+/g,
    replacement: "$1[REDACTED]",
  },
];

/** @param {string} text @param {boolean} [enabled] */
export function redactText(text, enabled = true) {
  if (!enabled) return { text, report: { enabled: false, total: 0, byKind: {} } };
  let output = text;
  /** @type {Record<string, number>} */
  const byKind = {};
  for (const rule of RULES) {
    let count = 0;
    output = output.replace(rule.pattern, (...args) => {
      count += 1;
      if (rule.replacement) {
        return rule.replacement.replace("$1", String(args[1] ?? ""));
      }
      return `[REDACTED:${rule.kind}]`;
    });
    if (count) byKind[rule.kind] = count;
  }
  return {
    text: output,
    report: { enabled: true, total: Object.values(byKind).reduce((sum, value) => sum + value, 0), byKind },
  };
}
