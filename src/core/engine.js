import crypto from "node:crypto";
import { isVoiceBoundaryEvent, shouldIgnoreAssistantText, stableMessageId } from "./detect.js";
import { formatBurstSummary } from "./telegram-format.js";
import { oneLine } from "./text.js";

export class BurstSummaryEngine {
  constructor({ store, config }) {
    if (!store) throw new Error("BurstSummaryEngine requires a state store");
    this.store = store;
    this.config = config;
  }

  async recordInbound(scopeKey, event = {}, nowMs = Date.now()) {
    if (!isVoiceBoundaryEvent(event, this.config)) return { voiceBoundary: false };
    const boundaryId = event.id || event.messageId || stableMessageId([event.sessionKey, event.runId, String(nowMs)]);
    const state = await this.store.update(scopeKey, (current) => {
      current.lastVoiceNoteAtMs = nowMs;
      current.lastVoiceBoundaryId = String(boundaryId);
      current.messages = [];
      current.summarizedThrough = 0;
      current.lastSummarySignature = "";
      current.updatedAtMs = nowMs;
      return current;
    });
    return { voiceBoundary: true, state };
  }

  async recordAssistant(scopeKey, event = {}, nowMs = Date.now()) {
    const text = event.text ?? event.content ?? event.message ?? "";
    if (shouldIgnoreAssistantText(text)) return { recorded: false, reason: "ignored-summary-or-empty" };
    const clean = oneLine(text, Math.max(this.config.maxCharsPerMessage || 280, 2800));
    if (!clean) return { recorded: false, reason: "empty-after-clean" };
    const id = String(event.id || event.messageId || stableMessageId([event.sessionKey, event.runId, event.toolUseId, crypto.createHash("sha1").update(`${nowMs}:${clean}`).digest("hex").slice(0, 12)]));
    const state = await this.store.update(scopeKey, (current) => {
      if (!current.lastVoiceNoteAtMs && this.config.requireVoiceBoundary !== false) {
        current.updatedAtMs = nowMs;
        return current;
      }
      if (!current.messages.some((msg) => msg.id === id)) {
        current.messages.push({ id, text: clean, sentAtMs: nowMs, meta: event.meta || undefined });
      }
      const maxStored = Math.max(this.config.maxStoredMessages || 50, this.config.maxMessagesInSummary || 8);
      if (current.messages.length > maxStored) {
        const drop = current.messages.length - maxStored;
        current.messages = current.messages.slice(drop);
        current.summarizedThrough = Math.max(0, current.summarizedThrough - drop);
      }
      current.lastAssistantSentAtMs = nowMs;
      current.updatedAtMs = nowMs;
      return current;
    });
    const recorded = state.messages.some((msg) => msg.id === id);
    return { recorded, state, messageId: id };
  }

  async evaluate(scopeKey, nowMs = Date.now()) {
    const state = await this.store.load(scopeKey);
    return evaluateState(state, this.config, nowMs);
  }

  async markSummarized(scopeKey, evaluation, nowMs = Date.now()) {
    const state = await this.store.update(scopeKey, (current) => {
      const count = current.messages.length;
      current.summarizedThrough = count;
      current.lastSummaryAtMs = nowMs;
      current.lastSummarySignature = evaluation?.signature || buildSignature(current.messages);
      current.updatedAtMs = nowMs;
      return current;
    });
    return state;
  }
}

export function evaluateState(state, config, nowMs = Date.now()) {
  const threshold = config.threshold || 3;
  if (!config.enabled) return { due: false, reason: "disabled", state };
  if (!state?.lastVoiceNoteAtMs && config.requireVoiceBoundary !== false) return { due: false, reason: "no-voice-boundary", state };
  const unsummarized = state.messages.slice(state.summarizedThrough || 0);
  if (unsummarized.length < threshold) return { due: false, reason: "below-threshold", state, unsummarized };
  if (!state.lastAssistantSentAtMs) return { due: false, reason: "no-assistant-message", state, unsummarized };
  const quietForMs = nowMs - Number(state.lastAssistantSentAtMs);
  if (quietForMs < (config.inactivityMs || 300000)) return { due: false, reason: "not-quiet", state, unsummarized, quietForMs };
  const signature = buildSignature(unsummarized);
  if (signature && signature === state.lastSummarySignature) return { due: false, reason: "already-summarized", state, unsummarized, quietForMs, signature };
  return {
    due: true,
    reason: "due",
    state,
    unsummarized,
    quietForMs,
    signature,
    summary: formatBurstSummary(unsummarized, config),
  };
}

export function buildSignature(messages) {
  return crypto
    .createHash("sha256")
    .update(messages.map((msg) => `${msg.id || ""}:${msg.sentAtMs || ""}:${msg.text || ""}`).join("\n---\n"))
    .digest("hex")
    .slice(0, 24);
}
