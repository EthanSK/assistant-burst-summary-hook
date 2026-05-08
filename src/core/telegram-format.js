import { oneLine } from "./text.js";

const MDV2_SPECIAL = /[_*\[\]()~`#+\-=|{}.!]/g;

export function escapeMarkdownV2(text) {
  return String(text || "").replace(MDV2_SPECIAL, "\\$&");
}

export function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatTelegramBlockquote(summary, options = {}) {
  const parseMode = options.parseMode === "HTML" ? "HTML" : options.parseMode === "none" ? "none" : "MarkdownV2";
  const lines = String(summary || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => line.length > 0 || (index > 0 && index < arr.length - 1));

  if (parseMode === "HTML") {
    return `<blockquote>${escapeHtml(lines.join("\n"))}</blockquote>`;
  }

  if (parseMode === "none") {
    return lines.map((line) => `> ${line}`).join("\n");
  }

  return lines.map((line) => (line ? `> ${escapeMarkdownV2(line)}` : ">")) .join("\n");
}

export function formatBurstSummary(messages, config = {}) {
  const header = config.summaryHeader || "Burst summary";
  const maxChars = config.maxCharsPerMessage || 280;
  const maxMessages = config.maxMessagesInSummary || messages.length;
  const selected = messages.slice(-maxMessages);
  const bullets = selected
    .map((msg) => oneLine(msg.text, maxChars))
    .filter(Boolean)
    .map((line) => `• ${line}`);
  const omitted = messages.length > selected.length ? `• …plus ${messages.length - selected.length} earlier message(s) in this burst.` : null;
  const body = [header, ...(omitted ? [omitted] : []), ...bullets].join("\n");
  const maxSummaryChars = config.maxSummaryChars || 1800;
  return body.length <= maxSummaryChars ? body : `${body.slice(0, maxSummaryChars - 1).trimEnd()}…`;
}

export function isBurstSummaryText(text) {
  const s = String(text || "").toLowerCase();
  return s.includes("assistant-burst-summary-hook") || /^>\s*(?:burst summary|assistant burst summary)/im.test(s) || /^\s*(?:burst summary|assistant burst summary)\b/im.test(s);
}
