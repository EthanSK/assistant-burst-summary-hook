const MODEL_FOOTER_RE = /^\s*(?:openai|anthropic|google|mistral|groq|xai|openrouter|claude|gemini|codex)[\w./:-]+\s*\[[^\]]+\]\s*$/gim;
const SUMMARY_BLOCK_RE = /(?:^|\n)Summary:\s*\n(?:>.*(?:\n|$))+/gi;
const TRANSCRIPT_BLOCK_RE = /(?:^|\n)Transcript:\s*\n(?:>.*(?:\n|$))+/gi;
const HTML_COMMENT_RE = /<!--\s*assistant-burst-summary-hook\s*-->/i;

export function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripAssistantBoilerplate(text) {
  let out = String(text || "");
  out = out.replace(HTML_COMMENT_RE, "");
  out = out.replace(SUMMARY_BLOCK_RE, "");
  out = out.replace(TRANSCRIPT_BLOCK_RE, "");
  out = out.replace(MODEL_FOOTER_RE, "");
  return normalizeWhitespace(out);
}

export function oneLine(text, maxChars = 280) {
  const clean = stripAssistantBoilerplate(text)
    .replace(/^>\s?/gm, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function isMeaningfulText(text) {
  return oneLine(text, 40).length > 0;
}
