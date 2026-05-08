# Agent Bridge rollout notes

This repo is safe to roll out via Agent Bridge because it contains only source, hooks, docs, and tests. It does not contain Telegram tokens or private transcript fixtures.

Recommended rollout sequence per machine:

1. Clone or pull the public repo under `~/Projects/assistant-burst-summary-hook`.
2. Run `npm test` and `node bin/assistant-burst-summary-hook.js simulate --json`.
3. Install OpenClaw plugin locally with `openclaw plugins install ~/Projects/assistant-burst-summary-hook --link`.
4. Install Claude Code plugin from the local marketplace:
   ```bash
   claude plugin marketplace add ~/Projects/assistant-burst-summary-hook --scope user
   claude plugin install assistant-burst-summary-hook@assistant-burst-summary-hook --scope user
   ```
5. Create a machine-local config file at `~/.config/assistant-burst-summary-hook/config.json` or set `ASSISTANT_BURST_SUMMARY_CONFIG`.
6. Restart/reload OpenClaw or Claude Code sessions only when the operator approves that lifecycle action.

Example Agent Bridge command pattern from an already paired controller:

```bash
# Diagnostic/utility shell only; do not spawn fresh agents via bridge_run_command.
bridge_run_command MacBookPro 'cd ~/Projects/assistant-burst-summary-hook && git pull --ff-only && npm test'
```

Do not send Telegram bot-to-bot messages for rollout. Use Agent Bridge, SSH utility commands, or a human-approved OpenClaw/Claude restart path.
