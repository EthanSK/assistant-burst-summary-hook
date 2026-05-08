import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBurstRuntime } from "../runtime/burst-runtime.js";
import { expandHome, normalizeConfig } from "../core/config.js";
import { isVoiceBoundaryEvent } from "../core/detect.js";
import { parseTelegramTarget } from "../telegram/client.js";

const DEFAULT_CONFIG_PATHS = [
  "~/.config/assistant-burst-summary-hook/config.json",
  "~/.assistant-burst-summary-hook.json",
];

export async function runClaudeHook(command, argv = process.argv.slice(3), stdinText) {
  const input = stdinText !== undefined ? parseJson(stdinText) : await readStdinJson();
  const config = await loadConfig(argv);
  const runtime = createBurstRuntime({ config, logger: quietLogger() });
  const nowMs = Date.now();

  if (command === "claude-user-prompt") {
    const prompt = extractUserPrompt(input);
    const scopeKey = claudeScopeKey(input, config);
    if (isVoiceBoundaryEvent({ content: prompt, metadata: input }, config)) {
      await runtime.recordVoice(scopeKey, { content: prompt, metadata: input, id: input?.message_id || input?.uuid || nowMs }, nowMs);
    }
    return { ok: true, command, scopeKey };
  }

  if (command === "claude-post-tool-use") {
    const extracted = extractTelegramToolSend(input);
    if (!extracted) return { ok: true, command, skipped: "not-telegram-send" };
    const scopeKey = claudeScopeKey(input, config, extracted.chatId);
    await runtime.recordAssistant(
      scopeKey,
      { text: extracted.text, id: input?.tool_use_id || input?.toolUseId || `${nowMs}:tool`, meta: { source: "claude-post-tool-use", toolName: input?.tool_name } },
      { chatId: extracted.chatId || config.telegramChatId, messageThreadId: extracted.messageThreadId },
      nowMs,
    );
    scheduleDetachedCheck({ argv, scopeKey, chatId: extracted.chatId || config.telegramChatId, messageThreadId: extracted.messageThreadId, config });
    return { ok: true, command, scopeKey, recorded: true };
  }

  if (command === "claude-stop" || command === "stop") {
    const scopeKey = claudeScopeKey(input, config);
    await maybeBackfillVoiceBoundaryFromTranscript(runtime, scopeKey, input, config, nowMs);
    const text = extractAssistantText(input);
    if (text) {
      await runtime.recordAssistant(
        scopeKey,
        { text, id: input?.message_id || input?.stop_id || `${nowMs}:stop`, meta: { source: "claude-stop" } },
        { chatId: config.telegramChatId, messageThreadId: config.telegramMessageThreadId },
        nowMs,
      );
      scheduleDetachedCheck({ argv, scopeKey, chatId: config.telegramChatId, messageThreadId: config.telegramMessageThreadId, config });
    }
    return { ok: true, command, scopeKey, recorded: Boolean(text) };
  }

  if (command === "check") {
    const args = parseArgs(argv);
    const scopeKey = args.scope;
    if (!scopeKey) throw new Error("check requires --scope <scopeKey>");
    const afterMs = Number(args.afterMs || args["after-ms"] || 0);
    if (afterMs > 0) await delay(afterMs);
    const target = parseTelegramTarget(args.chatId || args["chat-id"] || config.telegramChatId);
    const result = await runtime.check(scopeKey, Date.now(), {
      chatId: target.chatId,
      messageThreadId: args.messageThreadId || args["message-thread-id"] || target.messageThreadId || config.telegramMessageThreadId,
    });
    return result;
  }

  if (command === "simulate") {
    const scopeKey = "simulate:claude:telegram:demo";
    await runtime.recordVoice(scopeKey, { content: "Voice note transcript: please keep going" }, nowMs - 360000);
    await runtime.recordAssistant(scopeKey, { text: "First update: inspected OpenClaw hooks." }, { chatId: config.telegramChatId || "12345" }, nowMs - 340000);
    await runtime.recordAssistant(scopeKey, { text: "Second update: inspected Claude Code hooks." }, { chatId: config.telegramChatId || "12345" }, nowMs - 330000);
    await runtime.recordAssistant(scopeKey, { text: "Third update: implemented a shared scheduler." }, { chatId: config.telegramChatId || "12345" }, nowMs - 320000);
    return runtime.check(scopeKey, nowMs, { chatId: config.telegramChatId || "12345" });
  }

  throw new Error(`Unknown command: ${command}`);
}

export async function loadConfig(argv = []) {
  const args = parseArgs(argv);
  const explicit = args.config || process.env.ASSISTANT_BURST_SUMMARY_CONFIG;
  const paths = explicit ? [explicit] : DEFAULT_CONFIG_PATHS;
  for (const p of paths) {
    const full = expandHome(p);
    try {
      const raw = await fs.readFile(full, "utf8");
      return normalizeConfig(JSON.parse(raw));
    } catch (err) {
      if (err?.code !== "ENOENT") throw new Error(`Failed to read ${full}: ${err.message}`);
    }
  }
  return normalizeConfig(envConfig());
}

function envConfig() {
  return {
    telegramBotTokenEnv: process.env.ASSISTANT_BURST_SUMMARY_TELEGRAM_TOKEN_ENV || process.env.TELEGRAM_BOT_TOKEN_ENV || "TELEGRAM_BOT_TOKEN",
    telegramChatId: process.env.ASSISTANT_BURST_SUMMARY_TELEGRAM_CHAT_ID,
    telegramMessageThreadId: process.env.ASSISTANT_BURST_SUMMARY_TELEGRAM_THREAD_ID,
    threshold: process.env.ASSISTANT_BURST_SUMMARY_THRESHOLD,
    inactivityMs: process.env.ASSISTANT_BURST_SUMMARY_INACTIVITY_MS,
    dryRun: process.env.ASSISTANT_BURST_SUMMARY_DRY_RUN,
  };
}

export function claudeScopeKey(input = {}, config = {}, chatId) {
  const sessionId = input.session_id || input.sessionId || input.conversation_id || input.cwd || "unknown-session";
  const agent = input.agent_type || input.agentType || process.env.AGENT_BRIDGE_PERSONA || "default";
  const chat = config.scopeByChat ? (chatId || config.telegramChatId || "default-chat") : "session";
  return `claude-code:${agent}:${sessionId}:${chat}`;
}

export function extractUserPrompt(input = {}) {
  return String(input.prompt || input.user_prompt || input.message || input.content || input.body || "");
}

export function extractAssistantText(input = {}) {
  if (typeof input.last_assistant_message === "string") return input.last_assistant_message;
  if (typeof input.lastAssistantMessage === "string") return input.lastAssistantMessage;
  if (typeof input.response === "string") return input.response;
  if (typeof input.message === "string" && input.hook_event_name === "Stop") return input.message;
  return "";
}

export function extractTelegramToolSend(input = {}) {
  const toolName = String(input.tool_name || input.toolName || "").toLowerCase();
  const toolInput = input.tool_input || input.toolInput || input.input || {};
  const maybeTelegram = toolName.includes("telegram") || toolName.includes("message") || String(toolInput.channel || "").toLowerCase() === "telegram";
  if (!maybeTelegram || !toolInput || typeof toolInput !== "object") return null;
  const text = toolInput.text || toolInput.message || toolInput.content || toolInput.caption;
  if (!text || typeof text !== "string") return null;
  const chatId = toolInput.chat_id || toolInput.chatId || toolInput.target || toolInput.to || toolInput.recipient;
  const thread = toolInput.message_thread_id || toolInput.messageThreadId || toolInput.thread_id || toolInput.threadId;
  return { text, chatId: chatId ? String(chatId) : undefined, messageThreadId: thread === undefined ? undefined : Number(thread) };
}

async function maybeBackfillVoiceBoundaryFromTranscript(runtime, scopeKey, input, config, nowMs) {
  if (!input?.transcript_path && !input?.transcriptPath) return;
  const transcriptPath = input.transcript_path || input.transcriptPath;
  let raw;
  try {
    raw = await fs.readFile(transcriptPath, "utf8");
  } catch {
    return;
  }
  const lines = raw.trim().split(/\n+/).slice(-120);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const obj = parseJson(lines[i]);
    const text = extractTranscriptText(obj);
    const role = obj?.message?.role || obj?.role || obj?.type;
    if (role === "user" && isVoiceBoundaryEvent({ content: text, metadata: obj }, config)) {
      await runtime.recordVoice(scopeKey, { content: text, metadata: obj, id: obj?.uuid || `${nowMs}:transcript` }, Number(obj?.timestamp_ms || nowMs));
      return;
    }
    if (role === "user" && text && !isVoiceBoundaryEvent({ content: text, metadata: obj }, config)) return;
  }
}

function extractTranscriptText(obj) {
  const content = obj?.message?.content ?? obj?.content ?? "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || part?.content || "")).join("\n");
  }
  return "";
}

function scheduleDetachedCheck({ argv, scopeKey, chatId, messageThreadId, config }) {
  if (config.disableDetachedScheduler) return;
  const binPath = fileURLToPath(new URL("../../bin/assistant-burst-summary-hook.js", import.meta.url));
  const args = [binPath, "check", "--scope", scopeKey, "--after-ms", String((config.inactivityMs || 300000) + 250)];
  const parsed = parseArgs(argv);
  if (parsed.config) args.push("--config", String(parsed.config));
  if (chatId) args.push("--chat-id", String(chatId));
  if (messageThreadId !== undefined && messageThreadId !== null) args.push("--message-thread-id", String(messageThreadId));
  const child = spawn(process.execPath, args, { detached: true, stdio: "ignore", env: process.env });
  child.unref();
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return parseJson(raw) || {};
}

function parseJson(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function parseArgs(argv = []) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quietLogger() {
  return { warn: () => {}, info: () => {}, error: () => {} };
}

export function defaultConfigPath() {
  return path.join(os.homedir(), ".config", "assistant-burst-summary-hook", "config.json");
}
