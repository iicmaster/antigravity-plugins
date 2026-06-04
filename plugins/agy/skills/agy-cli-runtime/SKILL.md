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
- Use `agy --print` for non-interactive runs and pipe the prompt through child stdin.
- Do not pass the prompt as a positional argv item; AGY print mode reads the prompt from stdin.
- Add `--dangerously-skip-permissions` only when explicitly requested.
- Keep logs and state under `CLAUDE_PLUGIN_DATA` when available; otherwise use the runtime fallback outside the source checkout.
- Keep host adapters thin and share process execution behavior through the companion/runtime.
