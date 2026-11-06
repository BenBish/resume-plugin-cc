import { redactText } from "./redact.mjs";
import { compareWorkspace } from "./workspace.mjs";

/** @param {string} text @param {number} maxBytes */
function truncateUtf8(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, middle), "utf8") <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, Math.max(0, low - 20)).trimEnd()}\n[TRUNCATED]`;
}

/**
 * @param {Array<{role: string, text: string, kind: string, timestamp?: number | null}>} input
 * @param {number} maxBytes
 * @param {boolean} redact
 */
export function curateMessages(input, maxBytes, redact) {
  /** @type {Record<string, number>} */
  const redactions = {};
  const messages = input
    .map((message, index) => {
      const result = redactText(message.text, redact);
      for (const [kind, count] of Object.entries(result.report.byKind)) {
        redactions[kind] = (redactions[kind] ?? 0) + count;
      }
      return { ...message, text: result.text, index };
    })
    .filter((message) => message.text.trim());

  const firstUser = messages.find((message) => message.role === "user") ?? null;
  const ranked = messages
    .filter((message) => message !== firstUser)
    .map((message) => ({
      message,
      priority:
        (message.role === "user" ? 3000 : message.kind === "plan" ? 2000 : 1000) + message.index,
    }))
    .sort((a, b) => b.priority - a.priority);

  /** @type {typeof messages} */
  const selected = [];
  let used = 0;
  /** @param {(typeof messages)[number]} message */
  const add = (message) => {
    const base = { role: message.role, kind: message.kind, text: message.text, timestamp: message.timestamp ?? null };
    const overhead = Buffer.byteLength(JSON.stringify({ ...base, text: "" }), "utf8");
    const remaining = maxBytes - used - overhead;
    if (remaining <= 40) return false;
    const text = truncateUtf8(base.text, remaining);
    const size = Buffer.byteLength(JSON.stringify({ ...base, text }), "utf8");
    if (size > maxBytes - used) return false;
    selected.push({ ...base, text, index: message.index });
    used += size;
    return true;
  };

  if (firstUser) add(firstUser);
  for (const candidate of ranked) add(candidate.message);
  selected.sort((a, b) => a.index - b.index);
  return {
    messages: selected.map(({ index: _index, ...message }) => message),
    contentBytes: used,
    maxBytes,
    truncated: selected.length < messages.length || selected.some((message) => message.text.endsWith("[TRUNCATED]")),
    omittedMessages: Math.max(0, messages.length - selected.length),
    redaction: {
      enabled: redact,
      total: Object.values(redactions).reduce((sum, count) => sum + count, 0),
      byKind: redactions,
    },
  };
}

/**
 * @param {{source: any, messages: any[], commands: any[], fileChanges: any[], partial: boolean}} raw
 * @param {ReturnType<import("./workspace.mjs").snapshotWorkspace>} workspace
 * @param {{maxBytes: number, redact: boolean}} options
 */
export function buildHandoff(raw, workspace, options) {
  const conversation = curateMessages(raw.messages, options.maxBytes, options.redact);
  /** @type {Record<string, number>} */
  const allRedactions = { ...conversation.redaction.byKind };
  /** @param {string | null | undefined} value */
  const redactValue = (value) => {
    if (!value) return value ?? null;
    const result = redactText(value, options.redact);
    for (const [kind, count] of Object.entries(result.report.byKind)) {
      allRedactions[kind] = (allRedactions[kind] ?? 0) + count;
    }
    return result.text;
  };
  const source = {
    ...raw.source,
    title: redactValue(raw.source.title),
    model: redactValue(raw.source.model),
  };
  const sourceObservations = {
    commands: raw.commands.slice(-20).map((command) => ({
      ...command,
      command: redactValue(String(command.command ?? "")),
    })),
    fileChanges: Array.from(
      new Map(raw.fileChanges.map((change) => [`${change.kind}:${change.path}`, change])).values(),
    ).slice(-100),
  };
  conversation.redaction = {
    enabled: options.redact,
    total: Object.values(allRedactions).reduce((sum, count) => sum + count, 0),
    byKind: allRedactions,
  };
  const warnings = compareWorkspace(source, workspace);
  if (raw.partial) warnings.push("The source session appears active, interrupted, or incomplete.");
  if (conversation.truncated) {
    warnings.push(`Conversation was curated to ${options.maxBytes} bytes; ${conversation.omittedMessages} messages were omitted.`);
  }
  if (conversation.redaction.total) {
    warnings.push(`${conversation.redaction.total} likely secret value(s) were redacted before import.`);
  }
  return {
    schema: "resume.handoff/v1",
    generatedAt: new Date().toISOString(),
    source,
    conversation,
    sourceObservations,
    currentWorkspace: workspace,
    warnings,
    trust: {
      transcriptIsUntrusted: true,
      currentWorkspaceIsAuthoritative: true,
      sourceModelInvoked: false,
      persistedByPlugin: false,
    },
  };
}
