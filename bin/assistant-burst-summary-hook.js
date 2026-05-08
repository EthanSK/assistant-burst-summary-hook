#!/usr/bin/env node
import { runClaudeHook } from "../src/claude/hook-runner.js";

const [command = "help", ...argv] = process.argv.slice(2);

if (command === "help" || command === "--help" || command === "-h") {
  console.log(`assistant-burst-summary-hook

Commands:
  claude-user-prompt       Claude Code UserPromptSubmit hook
  claude-post-tool-use     Claude Code PostToolUse hook for Telegram/message sends
  claude-stop              Claude Code Stop hook
  check --scope <key>      Run a due summary check, optionally after --after-ms
  simulate [--json]        Run a local synthetic smoke simulation

Config:
  ASSISTANT_BURST_SUMMARY_CONFIG=/path/to/config.json
  or ~/.config/assistant-burst-summary-hook/config.json
`);
  process.exit(0);
}

try {
  const result = await runClaudeHook(command, argv);
  if (command === "simulate" || argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  }
} catch (err) {
  console.error(`[assistant-burst-summary-hook] ${err?.message || err}`);
  process.exit(1);
}
