import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { normalizeConfig, selectPluginConfig } from "../core/config.js";
import { isBurstSummaryText } from "../core/telegram-format.js";
import { createBurstRuntime } from "../runtime/burst-runtime.js";
import { parseTelegramTarget } from "../telegram/client.js";

const PLUGIN_ID = "assistant-burst-summary-hook";

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Assistant Burst Summary Hook",
  description: "Sends one Telegram blockquote summary after a post-voice-note assistant burst goes quiet.",
  configSchema: () => ({
    type: "object",
    additionalProperties: true,
    properties: {
      enabled: { type: "boolean", default: true },
      threshold: { type: "integer", minimum: 1, default: 3 },
      inactivityMs: { type: "integer", minimum: 1000, default: 300000 },
      maxMessagesInSummary: { type: "integer", minimum: 1, default: 8 },
      channels: { type: "array", items: { type: "string" }, default: ["telegram"] },
      stateDir: { type: "string" },
      telegramBotTokenEnv: { type: "string", default: "TELEGRAM_BOT_TOKEN" },
      telegramBotToken: { type: "string" },
      telegramParseMode: { type: "string", enum: ["MarkdownV2", "HTML", "none"], default: "MarkdownV2" },
      summaryHeader: { type: "string", default: "Burst summary" },
      dryRun: { type: "boolean", default: false },
    },
  }),
  register(api) {
    const cfgSnapshot = getRuntimeConfig(api);
    const pluginConfig = normalizeConfig(selectPluginConfig(cfgSnapshot, PLUGIN_ID));
    const runtime = createBurstRuntime({
      config: pluginConfig,
      openClawConfig: cfgSnapshot,
      logger: console,
    });
    const pendingDestinations = new Map();

    api.on("message_received", async (event, ctx) => {
      const cfg = runtime.config;
      if (!isEnabledForChannel(cfg, ctx?.channelId)) return;
      const scopeKey = openClawScopeKey(ctx, event, "inbound");
      await runtime.recordVoice(scopeKey, { ...event, metadata: event?.metadata, id: event?.messageId }, event?.timestamp || Date.now());
    });

    api.on("message_sending", (event, ctx) => {
      const cfg = runtime.config;
      if (!isEnabledForChannel(cfg, ctx?.channelId)) return;
      const scopeKey = openClawScopeKey(ctx, event, "outbound");
      const target = parseTelegramTarget(event?.to);
      pendingDestinations.set(scopeKey, {
        chatId: target.chatId,
        messageThreadId: event?.threadId ?? target.messageThreadId,
        accountId: ctx?.accountId,
      });
      return undefined;
    });

    api.on("message_sent", async (event, ctx) => {
      const cfg = runtime.config;
      if (!event?.success || !isEnabledForChannel(cfg, ctx?.channelId)) return;
      if (isBurstSummaryText(event?.content)) return;
      const scopeKey = openClawScopeKey(ctx, event, "outbound");
      const target = parseTelegramTarget(event?.to);
      const destination = pendingDestinations.get(scopeKey) || {
        chatId: target.chatId,
        messageThreadId: target.messageThreadId,
        accountId: ctx?.accountId,
      };
      await runtime.recordAssistant(
        scopeKey,
        { content: event?.content, id: event?.messageId, sessionKey: event?.sessionKey || ctx?.sessionKey, runId: event?.runId || ctx?.runId, meta: { source: "openclaw-message-sent" } },
        destination,
        Date.now(),
      );
    });

    api.on("gateway_stop", () => {
      runtime.shutdown();
    });
  },
});

function getRuntimeConfig(api) {
  try {
    return api?.runtime?.config?.current?.() || api?.config || {};
  } catch {
    return api?.config || {};
  }
}

function isEnabledForChannel(config, channelId) {
  if (!config.enabled) return false;
  const wanted = new Set((config.channels || ["telegram"]).map((c) => String(c).toLowerCase()));
  return wanted.has(String(channelId || "").toLowerCase());
}

function openClawScopeKey(ctx = {}, event = {}, direction = "outbound") {
  const target =
    direction === "inbound"
      ? ctx.conversationId || event?.metadata?.chatId || event?.metadata?.chat_id || event?.to || event?.from || "unknown"
      : event?.to || ctx.conversationId || "unknown";
  const session = ctx.sessionKey || event?.sessionKey || "unknown-session";
  const account = ctx.accountId || "default";
  const channel = ctx.channelId || "unknown-channel";
  return `openclaw:${channel}:${account}:${session}:${target}`;
}
