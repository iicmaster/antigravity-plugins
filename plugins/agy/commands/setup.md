---
description: Check whether the Antigravity CLI is installed and ready for Claude Code delegation
argument-hint: "[--json] [--smoke] [--timeout <duration>]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(agy:*)
---

Check the local `agy` runtime through the shared companion script.

Use `--smoke` when you need to verify that print mode can complete a minimal run. Without `--smoke`, setup checks binary availability and required flags only.

Raw slash-command arguments:
`$ARGUMENTS`

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" setup "$ARGUMENTS"
```

Return stdout verbatim. Do not paraphrase or add commentary.
