import { DEFAULT_VOICE_BOUNDARY_PATTERNS } from "./config.js";
import { isBurstSummaryText } from "./telegram-format.js";

function flatten(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((v) => flatten(v, depth + 1));
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [String(k), ...flatten(v, depth + 1)]);
  }
  return [];
}

export function isVoiceBoundaryEvent(event = {}, config = {}) {
  const patterns = (config.voiceBoundaryPatterns || DEFAULT_VOICE_BOUNDARY_PATTERNS).map((p) => String(p).toLowerCase());
  const haystack = [
    event.content,
    event.body,
    event.bodyForAgent,
    event.transcript,
    ...flatten(event.metadata),
    ...flatten(event.tool_input),
    ...flatten(event.message),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (!haystack) return false;
  if (/(^|[\s_-])(voice|audio)([\s_-])?(note|message|file|attachment|transcript|transcription)\b/i.test(haystack)) return true;
  return patterns.some((pattern) => pattern && haystack.includes(pattern));
}

export function shouldIgnoreAssistantText(text) {
  return !text || isBurstSummaryText(text);
}

export function stableMessageId(parts) {
  return parts.filter(Boolean).join(":");
}
