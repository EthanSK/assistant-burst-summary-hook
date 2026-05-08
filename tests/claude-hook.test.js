import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { claudeScopeKey, extractTelegramToolSend, runClaudeHook } from "../src/claude/hook-runner.js";

test("extracts Telegram PostToolUse sends", () => {
  const extracted = extractTelegramToolSend({
    tool_name: "mcp__telegram__send_message",
    tool_input: { chat_id: "123", text: "hello", message_thread_id: 9 },
  });
  assert.deepEqual(extracted, { chatId: "123", text: "hello", messageThreadId: 9 });
});

test("Claude scope defaults to session/persona, not cross-session global", () => {
  assert.equal(claudeScopeKey({ session_id: "abc" }, { telegramChatId: "123" }), "claude-code:default:abc:session");
  assert.equal(claudeScopeKey({ session_id: "abc", agent_type: "yolo" }, { scopeByChat: true, telegramChatId: "123" }), "claude-code:yolo:abc:123");
});

test("claude-user-prompt records a voice boundary from stdin-shaped JSON", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "assistant-burst-summary-claude-"));
  const configPath = path.join(dir, "config.json");
  await fs.writeFile(configPath, JSON.stringify({ stateDir: dir, disableDetachedScheduler: true }), "utf8");
  const input = JSON.stringify({ session_id: "s1", prompt: "Transcript: this is a voice note" });
  const result = await runClaudeHook("claude-user-prompt", ["--config", configPath], input);
  assert.equal(result.ok, true);

  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json") && f !== "config.json");
  assert.equal(files.length, 1);
  const state = JSON.parse(await fs.readFile(path.join(dir, files[0]), "utf8"));
  assert.equal(state.lastVoiceBoundaryId.includes("s1") || Boolean(state.lastVoiceNoteAtMs), true);
});
