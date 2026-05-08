import { formatTelegramBlockquote } from "../core/telegram-format.js";

export function parseTelegramTarget(target) {
  if (!target && target !== 0) return {};
  const raw = String(target);
  const topicMatch = raw.match(/^(.*?)(?::topic:|\/)(\d+)$/);
  if (topicMatch && /^-?\d+$/.test(topicMatch[1])) {
    return { chatId: topicMatch[1], messageThreadId: Number(topicMatch[2]) };
  }
  return { chatId: raw };
}

export function resolveTelegramToken({ config = {}, openClawConfig = {}, accountId } = {}) {
  if (config.telegramBotToken) return config.telegramBotToken;
  const envName = config.telegramBotTokenEnv || "TELEGRAM_BOT_TOKEN";
  if (envName && process.env[envName]) return process.env[envName];
  const telegramCfg = openClawConfig?.channels?.telegram;
  const accountToken = accountId && telegramCfg?.accounts?.[accountId]?.botToken;
  if (typeof accountToken === "string") return accountToken;
  if (typeof telegramCfg?.botToken === "string") return telegramCfg.botToken;
  return undefined;
}

export async function sendTelegramSummary({ token, chatId, messageThreadId, summary, config = {}, fetchImpl = fetch }) {
  if (!token) throw new Error("Telegram bot token is not configured");
  if (!chatId) throw new Error("Telegram chat id is not configured");
  const parseMode = config.telegramParseMode || "MarkdownV2";
  const text = formatTelegramBlockquote(summary, { parseMode });
  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (messageThreadId !== undefined && messageThreadId !== null && Number.isFinite(Number(messageThreadId))) {
    payload.message_thread_id = Number(messageThreadId);
  }
  if (parseMode && parseMode !== "none") payload.parse_mode = parseMode;

  if (config.dryRun) {
    return { ok: true, dryRun: true, payload: { ...payload, chat_id: String(chatId) } };
  }

  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(async () => ({ ok: false, description: await response.text().catch(() => "") }));
  if (!response.ok || body?.ok === false) {
    // Telegram MarkdownV2 is picky. If formatting fails, preserve the visible
    // blockquote marker and retry as plain text rather than losing the summary.
    if (parseMode === "MarkdownV2" && /parse/i.test(String(body?.description || ""))) {
      return sendTelegramSummary({ token, chatId, messageThreadId, summary, config: { ...config, telegramParseMode: "none" }, fetchImpl });
    }
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body?.description || response.statusText}`);
  }
  return body;
}
