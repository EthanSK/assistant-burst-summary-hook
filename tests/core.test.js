import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BurstSummaryEngine, JsonStateStore, normalizeConfig, isBurstSummaryText } from "../src/core/index.js";
import { createBurstRuntime } from "../src/runtime/burst-runtime.js";

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "assistant-burst-summary-test-"));
  return { dir, store: new JsonStateStore(dir) };
}

test("requires 3 assistant messages after a voice boundary by default", async () => {
  const { store } = await tempStore();
  const config = normalizeConfig({ stateDir: "/tmp/unused", inactivityMs: 300000 });
  const engine = new BurstSummaryEngine({ store, config });
  const scope = "openclaw:telegram:default:session:chat";
  const t0 = 1_000_000;

  await engine.recordInbound(scope, { content: "Transcript: please keep me updated" }, t0);
  await engine.recordAssistant(scope, { text: "First update" }, t0 + 1000);
  await engine.recordAssistant(scope, { text: "Second update" }, t0 + 2000);

  assert.equal((await engine.evaluate(scope, t0 + 600000)).due, false);
  assert.equal((await engine.evaluate(scope, t0 + 600000)).reason, "below-threshold");

  await engine.recordAssistant(scope, { text: "Third update" }, t0 + 3000);
  assert.equal((await engine.evaluate(scope, t0 + 120000)).due, false);
  const due = await engine.evaluate(scope, t0 + 304000);
  assert.equal(due.due, true);
  assert.match(due.summary, /First update/);
  assert.match(due.summary, /Third update/);
});

test("summary markers do not count as assistant messages", async () => {
  const { store } = await tempStore();
  const config = normalizeConfig({ inactivityMs: 1000 });
  const engine = new BurstSummaryEngine({ store, config });
  const scope = "claude-code:default:session";
  const t0 = 2_000_000;

  await engine.recordInbound(scope, { content: "voice note transcript" }, t0);
  await engine.recordAssistant(scope, { text: "> Burst summary\n> • old" }, t0 + 1);
  await engine.recordAssistant(scope, { text: "One" }, t0 + 2);
  await engine.recordAssistant(scope, { text: "Two" }, t0 + 3);

  const state = await store.load(scope);
  assert.equal(state.messages.length, 2);
  assert.equal(isBurstSummaryText("> Burst summary\n> • old"), true);
});

test("markSummarized prevents repeated sends until another threshold-sized burst", async () => {
  const { store } = await tempStore();
  const config = normalizeConfig({ inactivityMs: 1000, threshold: 3 });
  const engine = new BurstSummaryEngine({ store, config });
  const scope = "scope";
  const t0 = 3_000_000;

  await engine.recordInbound(scope, { content: "audio transcription: go" }, t0);
  for (const text of ["A", "B", "C"]) await engine.recordAssistant(scope, { text }, t0 + 10);
  const due = await engine.evaluate(scope, t0 + 2000);
  assert.equal(due.due, true);
  await engine.markSummarized(scope, due, t0 + 2000);
  assert.equal((await engine.evaluate(scope, t0 + 3000)).reason, "below-threshold");

  await engine.recordAssistant(scope, { text: "D" }, t0 + 4000);
  assert.equal((await engine.evaluate(scope, t0 + 6000)).reason, "below-threshold");

  await engine.recordAssistant(scope, { text: "E" }, t0 + 7000);
  await engine.recordAssistant(scope, { text: "F" }, t0 + 8000);
  assert.equal((await engine.evaluate(scope, t0 + 10000)).due, true);
});

test("new voice note resets the burst", async () => {
  const { store } = await tempStore();
  const config = normalizeConfig({ inactivityMs: 1000, threshold: 3 });
  const engine = new BurstSummaryEngine({ store, config });
  const scope = "scope";
  const t0 = 4_000_000;

  await engine.recordInbound(scope, { content: "voice message: first" }, t0);
  for (const text of ["A", "B"]) await engine.recordAssistant(scope, { text }, t0 + 10);
  await engine.recordInbound(scope, { content: "Transcript: second" }, t0 + 20);
  await engine.recordAssistant(scope, { text: "C" }, t0 + 30);

  const state = await store.load(scope);
  assert.deepEqual(state.messages.map((m) => m.text), ["C"]);
});

test("runtime sends a Telegram blockquote when due", async () => {
  const sent = [];
  const fakeFetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "assistant-burst-summary-runtime-"));
  const runtime = createBurstRuntime({
    config: { stateDir: dir, inactivityMs: 1000, threshold: 3, telegramBotToken: "123:abc", dryRun: false },
    fetchImpl: fakeFetch,
  });
  const scope = "scope";
  const t0 = 5_000_000;
  await runtime.recordVoice(scope, { content: "voice note" }, t0);
  await runtime.recordAssistant(scope, { text: "One" }, { chatId: "6164541473" }, t0 + 1);
  await runtime.recordAssistant(scope, { text: "Two" }, { chatId: "6164541473" }, t0 + 2);
  await runtime.recordAssistant(scope, { text: "Three" }, { chatId: "6164541473" }, t0 + 3);
  const result = await runtime.check(scope, t0 + 2000, { chatId: "6164541473" });
  runtime.shutdown();

  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, "6164541473");
  assert.equal(sent[0].parse_mode, "MarkdownV2");
  assert.match(sent[0].text, /^> Burst summary/m);
});
