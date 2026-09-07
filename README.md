# assistant-burst-summary-hook

Cross-harness hooks for Ethan-style Telegram voice workflows.

After a voice note, if the assistant sends **3+** Telegram messages and then goes quiet for **5 minutes**, this package sends one Telegram blockquote summary of that burst.

It includes:

- a shared deterministic burst-summary state machine,
- an OpenClaw plugin using `message_received` / `message_sending` / `message_sent`,
- a Claude Code plugin/hook pack using `UserPromptSubmit` / `PostToolUse` / `Stop`,
- install notes for Agent Bridge rollouts,
- synthetic tests proving threshold, quiet-window, voice-boundary, and no-loop behavior.

## Default behavior

- `threshold`: `3` assistant messages.
- `inactivityMs`: `300000` (5 minutes).
- summary format: one Telegram MarkdownV2 blockquote.
- summary messages do **not** count toward the next burst.
- after a summary, another summary requires another `threshold` unsummarized assistant messages.

## Install: OpenClaw

From a local checkout:

```bash
openclaw plugins install /Users/ethansk/Projects/assistant-burst-summary-hook --link
openclaw plugins enable assistant-burst-summary-hook
```

Config lives under `plugins.entries.assistant-burst-summary-hook`. Minimal example:

```json5
{
  plugins: {
    entries: {
      "assistant-burst-summary-hook": {
        enabled: true,
        threshold: 3,
        inactivityMs: 300000,
        telegramBotTokenEnv: "TELEGRAM_BOT_TOKEN",
        telegramParseMode: "MarkdownV2"
      }
    }
  }
}
```

The OpenClaw adapter resolves the Telegram bot token from, in order:

1. plugin config `telegramBotToken`,
2. env var named by `telegramBotTokenEnv`, default `TELEGRAM_BOT_TOKEN`,
3. active OpenClaw Telegram channel config.

It uses the outgoing OpenClaw message target as the Telegram chat id, so a separate `telegramChatId` is usually not needed for OpenClaw.

## Install: Claude Code

Claude Code hooks need a chat id because command hooks do not have OpenClaw's channel delivery context.

```bash
claude plugin marketplace add /Users/ethansk/Projects/assistant-burst-summary-hook --scope user
claude plugin install assistant-burst-summary-hook@assistant-burst-summary-hook --scope user
```

Create `~/.config/assistant-burst-summary-hook/config.json`:

```json
{
  "threshold": 3,
  "inactivityMs": 300000,
  "telegramBotTokenEnv": "TELEGRAM_BOT_TOKEN",
  "telegramChatId": "6164541473",
  "telegramParseMode": "MarkdownV2"
}
```

Or point Claude hooks at another file:

```bash
export ASSISTANT_BURST_SUMMARY_CONFIG=/path/to/config.json
```

## Config reference

See `examples/config.json` for a full example.

Common fields:

- `enabled`: boolean, default `true`.
- `threshold`: number of unsummarized assistant messages required, default `3`.
- `inactivityMs`: quiet window after newest assistant message, default `300000`.
- `maxMessagesInSummary`: cap on messages included in one summary, default `8`.
- `stateDir`: durable JSON state directory.
- `telegramBotTokenEnv`: env var containing the bot token.
- `telegramBotToken`: direct token override; avoid committing this.
- `telegramChatId`: required for Claude Code unless PostToolUse extracts a chat id.
- `telegramParseMode`: `MarkdownV2`, `HTML`, or `none`.
- `voiceBoundaryPatterns`: extra strings that identify a voice-note transcript.
- `dryRun`: evaluate/send without calling Telegram.

## Validation

```bash
npm test
node bin/assistant-burst-summary-hook.js simulate --json
node --input-type=module -e "await import('./src/openclaw/index.js')"
claude plugin validate .
```

## Security and privacy

- No secrets are committed.
- Tests use synthetic transcripts only.
- State files contain compact assistant-message excerpts, not raw session JSONL.
- The Telegram Bot API call only sends the generated summary to the configured/observed chat target.
- Public repo contents are safe to publish; machine-local config files are intentionally excluded.

## Agent Bridge rollout

See [`docs/agent-bridge-rollout.md`](docs/agent-bridge-rollout.md).

## Weekly skill update checks

The bundled skills include an agent-led weekly check against this public repository. A small Python 3 helper coordinates dates and leases; it starts no background process. The agent reviews updates, preserves local edits, uses the appropriate installer or plugin host, and tells you after a verified update. Users can opt out; copied skills without a trustworthy baseline require reconciliation before updating. This updates skill files only, without starting domain actions or restarting running services. See [the update procedure](skills/assistant-burst-summary/references/public-updates.md).

## Weekly skill update checks

The agent checks the skill's configured public source on first use when a week has passed. When an update is available, it explains the changes and asks if you want it first. It installs only after you agree, preserves local edits and respects opt-outs. Declining or ignoring the offer leaves your installed skill unchanged. The date and shared lease stay local; no background process is added. See [the update procedure](skills/assistant-burst-summary/references/public-updates.md).
