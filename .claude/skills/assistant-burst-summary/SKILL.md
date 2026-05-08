---
name: assistant-burst-summary
description: Install, configure, validate, or explain the assistant burst summary hook for OpenClaw and Claude Code.
---

# Assistant Burst Summary Hook

Use this skill when Ethan asks about the post-voice-note burst summary hook, installing it on OpenClaw, installing the Claude Code equivalent, or rolling it out across Agent Bridge machines.

## What it does

- Treats a detected voice note / audio transcript as a burst boundary.
- Tracks assistant outbound Telegram messages after that boundary.
- After the assistant has sent `threshold` messages (default `3`) and then goes quiet for `inactivityMs` (default `300000`, five minutes), sends one Telegram blockquote summary.
- Ignores its own `Burst summary` messages so it does not loop.
- Scopes state per harness/session/chat target where the harness provides those identifiers.

## OpenClaw path

Prefer the OpenClaw plugin entry at the repo root:

```bash
openclaw plugins install /path/to/assistant-burst-summary-hook --link
openclaw plugins enable assistant-burst-summary-hook
```

Add plugin config under `plugins.entries.assistant-burst-summary-hook`, then restart/reload OpenClaw only with Ethan's approval if the active gateway does not hot-load plugin installs.

## Claude Code path

Prefer the Claude Code plugin/hook pack at the repo root:

```bash
claude plugin marketplace add /path/to/assistant-burst-summary-hook --scope user
claude plugin install assistant-burst-summary-hook@assistant-burst-summary-hook --scope user
```

Set `ASSISTANT_BURST_SUMMARY_CONFIG` or create `~/.config/assistant-burst-summary-hook/config.json` with a Telegram chat id and token env name.

## Validation

Run:

```bash
npm test
node bin/assistant-burst-summary-hook.js simulate --json
node --input-type=module -e "await import('./src/openclaw/index.js')"
claude plugin validate .
```

Do not paste raw transcript logs into chat. Summarize results and cite file paths.
