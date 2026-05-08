import { BurstSummaryEngine, JsonStateStore, normalizeConfig } from "../core/index.js";
import { parseTelegramTarget, resolveTelegramToken, sendTelegramSummary } from "../telegram/client.js";

export function createBurstRuntime({ config, openClawConfig, logger = console, fetchImpl } = {}) {
  const timers = new Map();
  const cfg = normalizeConfig(config);
  const store = new JsonStateStore(cfg.stateDir);
  const engine = new BurstSummaryEngine({ store, config: cfg });
  const destinations = new Map();

  async function recordVoice(scopeKey, event, nowMs = Date.now()) {
    return engine.recordInbound(scopeKey, event, nowMs);
  }

  async function recordAssistant(scopeKey, event, destination, nowMs = Date.now()) {
    if (destination?.chatId) destinations.set(scopeKey, destination);
    const result = await engine.recordAssistant(scopeKey, event, nowMs);
    if (result.recorded) schedule(scopeKey, cfg.inactivityMs + 250);
    return result;
  }

  function schedule(scopeKey, delayMs = cfg.inactivityMs + 250) {
    clear(scopeKey);
    const timer = setTimeout(() => {
      void check(scopeKey).catch((err) => logger.warn?.(`[assistant-burst-summary-hook] check failed: ${err?.message || err}`));
    }, delayMs);
    timer.unref?.();
    timers.set(scopeKey, timer);
  }

  function clear(scopeKey) {
    const timer = timers.get(scopeKey);
    if (timer) clearTimeout(timer);
    timers.delete(scopeKey);
  }

  async function check(scopeKey, nowMs = Date.now(), overrideDestination) {
    const evaluation = await engine.evaluate(scopeKey, nowMs);
    if (!evaluation.due) return evaluation;
    const destination = overrideDestination || destinations.get(scopeKey) || {};
    const token = resolveTelegramToken({ config: cfg, openClawConfig, accountId: destination.accountId });
    if (!token && !cfg.dryRun) return { ...evaluation, sent: false, reason: "missing-telegram-token" };
    if (!destination.chatId && !cfg.telegramChatId) return { ...evaluation, sent: false, reason: "missing-telegram-chat-id" };
    const chat = parseTelegramTarget(destination.chatId || cfg.telegramChatId);
    const sendResult = await sendTelegramSummary({
      token: token || "dry-run-token",
      chatId: chat.chatId,
      messageThreadId: destination.messageThreadId ?? chat.messageThreadId,
      summary: evaluation.summary,
      config: cfg,
      fetchImpl,
    });
    await engine.markSummarized(scopeKey, evaluation, nowMs);
    return { ...evaluation, sent: true, sendResult };
  }

  function shutdown() {
    for (const scopeKey of timers.keys()) clear(scopeKey);
  }

  return { config: cfg, store, engine, recordVoice, recordAssistant, check, schedule, clear, shutdown, destinations };
}
