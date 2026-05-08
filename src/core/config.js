import os from "node:os";
import path from "node:path";

export const DEFAULT_VOICE_BOUNDARY_PATTERNS = [
  "voice note",
  "voice message",
  "audio message",
  "audio transcription",
  "transcript:",
  "transcription:",
  "full transcript quote footer",
  "tools.media.audio",
];

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  threshold: 3,
  inactivityMs: 5 * 60 * 1000,
  maxMessagesInSummary: 8,
  maxCharsPerMessage: 280,
  maxSummaryChars: 1800,
  channels: ["telegram"],
  stateDir: "~/.local/state/assistant-burst-summary-hook",
  telegramBotTokenEnv: "TELEGRAM_BOT_TOKEN",
  telegramParseMode: "MarkdownV2",
  summaryHeader: "Burst summary",
  dryRun: false,
  voiceBoundaryPatterns: DEFAULT_VOICE_BOUNDARY_PATTERNS,
});

export function expandHome(input) {
  if (!input || typeof input !== "string") return input;
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function normalizeConfig(...configs) {
  const merged = { ...DEFAULT_CONFIG };
  for (const cfg of configs) {
    if (!cfg || typeof cfg !== "object") continue;
    for (const [key, value] of Object.entries(cfg)) {
      if (value !== undefined && value !== null) merged[key] = value;
    }
  }
  merged.threshold = Math.max(1, Number.parseInt(String(merged.threshold), 10) || DEFAULT_CONFIG.threshold);
  merged.inactivityMs = Math.max(1000, Number.parseInt(String(merged.inactivityMs), 10) || DEFAULT_CONFIG.inactivityMs);
  merged.maxMessagesInSummary = Math.max(1, Number.parseInt(String(merged.maxMessagesInSummary), 10) || DEFAULT_CONFIG.maxMessagesInSummary);
  merged.maxCharsPerMessage = Math.max(80, Number.parseInt(String(merged.maxCharsPerMessage), 10) || DEFAULT_CONFIG.maxCharsPerMessage);
  merged.maxSummaryChars = Math.max(240, Number.parseInt(String(merged.maxSummaryChars), 10) || DEFAULT_CONFIG.maxSummaryChars);
  if (!Array.isArray(merged.channels) || merged.channels.length === 0) merged.channels = ["telegram"];
  if (!Array.isArray(merged.voiceBoundaryPatterns) || merged.voiceBoundaryPatterns.length === 0) {
    merged.voiceBoundaryPatterns = DEFAULT_VOICE_BOUNDARY_PATTERNS;
  }
  merged.stateDir = expandHome(String(merged.stateDir || DEFAULT_CONFIG.stateDir));
  merged.enabled = ![false, "false", "0", 0, "off", "no"].includes(merged.enabled);
  merged.dryRun = [true, "true", "1", 1, "on", "yes"].includes(merged.dryRun);
  return merged;
}

export function selectPluginConfig(openClawConfig, pluginId = "assistant-burst-summary-hook") {
  const entry = openClawConfig?.plugins?.entries?.[pluginId];
  if (!entry || typeof entry !== "object") return {};
  return entry.config && typeof entry.config === "object" ? entry.config : entry;
}
