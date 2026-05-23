---
name: agy-cli-runtime
description: Internal helper contract for invoking Antigravity CLI from Claude Code and Codex plugin adapters
user-invocable: false
---

# AGY Runtime

Use the shared companion from plugin adapters:

```bash
node "<plugin-root>/scripts/agy-companion.mjs" <command> "<raw arguments>"
```

Safety rules:
- Call `agy` through Node `spawn` argv arrays, not shell-interpolated strings.
- Use `agy --print <prompt>` for MVP non-interactive runs.
- Add `--dangerously-skip-permissions` only when explicitly requested.
- Keep logs and state under `CLAUDE_PLUGIN_DATA` when available.
