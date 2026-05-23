---
description: Delegate investigation or a bounded fix request from Claude Code to Antigravity CLI
argument-hint: "[--wait|--background] [--timeout <duration>] [--no-sandbox] [--dangerously-skip-permissions] [task]"
allowed-tools: Bash(node:*), Agent, AskUserQuestion
---

Delegate the user request to the `agy` companion runtime.

Raw user request:
`$ARGUMENTS`

Rules:
- Preserve the user task text.
- Leave `--dangerously-skip-permissions` unset unless the user explicitly requested it.
- Prefer foreground for small bounded tasks and background for long-running rescue work.
- Return the companion stdout verbatim.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" rescue "$ARGUMENTS"
```
