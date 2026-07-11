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
- Omit `--print` for non-interactive runs and pipe the prompt through child stdin; AGY 1.1.1 detects non-TTY stdin automatically.
- Do not pass the prompt in argv or command logs.
- Treat print mode as a CLI transport, not Codex app-server parity. If a timed-out job captured stdout, report it as partial output instead of hiding it behind a generic failure.
- Use `setup --smoke` when flag availability is not enough and you need to verify that the local AGY session can complete print mode.
- Add `--dangerously-skip-permissions` only when explicitly requested.
- Keep logs and state under `CLAUDE_PLUGIN_DATA` when available; otherwise use the runtime fallback outside the source checkout.
- Keep host adapters thin and share process execution behavior through the companion/runtime.
