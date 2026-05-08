# Architecture

`assistant-burst-summary-hook` is split into a tiny shared state machine and two harness adapters.

## Shared state machine

`src/core` owns the durable behavior:

1. `recordInbound()` resets the burst when the event looks like a voice note or transcript.
2. `recordAssistant()` appends assistant messages unless the content is already a burst summary.
3. `evaluate()` returns `due: true` only when:
   - a voice boundary exists,
   - at least `threshold` unsummarized assistant messages exist,
   - the newest assistant message is older than `inactivityMs`, and
   - the same message signature has not already been summarized.
4. `markSummarized()` advances `summarizedThrough`, so a later summary needs another threshold-sized burst.

State is JSON on disk under `stateDir`, one hashed file per scope. The files contain only compact assistant-message excerpts and timestamps; no raw session JSON is copied.

## OpenClaw adapter

`src/openclaw/index.js` is an OpenClaw plugin using public plugin hooks:

- `message_received`: detects inbound voice/audio transcript boundaries.
- `message_sending`: remembers the target chat/thread before delivery.
- `message_sent`: records successful outbound assistant messages.
- `gateway_stop`: clears timers.

When a message burst is recorded, the plugin starts an in-process timer for the quiet window. On expiry it re-loads state, checks idempotency, and sends a Telegram Bot API `sendMessage` with a MarkdownV2 blockquote.

OpenClaw's native message-delivery API is intentionally not imported from internals. The adapter uses the stable public message hooks plus Telegram Bot API, resolving the token from plugin config, `TELEGRAM_BOT_TOKEN`, or the active OpenClaw Telegram channel config.

## Claude Code adapter

Claude Code does not expose a single universal “message sent” lifecycle event for every channel, so the package uses the realistic hooks available today:

- `UserPromptSubmit`: detects voice-note/transcript prompts and resets the burst.
- `PostToolUse`: observes Telegram/message tool sends when Claude uses the Telegram MCP/plugin tool.
- `Stop`: records the final natural assistant message using `last_assistant_message` when available.

Because Claude hooks are short-lived command hooks, each assistant record launches a detached `check` process. That child sleeps for the quiet window, reloads durable state, checks idempotency, and sends only if nothing newer arrived.

## Loop prevention

Summary messages are ignored if they contain the `Burst summary` header or the internal marker. The sender also marks the current message signature as summarized immediately after a successful send.

## Scope model

OpenClaw scopes include harness, channel, account, session key, and target conversation.

Claude scopes include harness, agent/persona, and session id by default. Set `scopeByChat: true` when one Claude session is expected to send to multiple Telegram chats.
