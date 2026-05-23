---
description: Ask Antigravity CLI to review the current git work from Claude Code
argument-hint: "[--wait|--background] [--base <ref>] [--timeout <duration>] [--no-sandbox] [focus text]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git:*), AskUserQuestion
---

Run an `agy` review through the shared companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraints:
- This command is review-only.
- Do not fix issues, apply patches, or suggest that you are about to make changes.
- Return the companion stdout verbatim to the user.

Foreground flow:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" review "$ARGUMENTS"
```

Background flow:

```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" review "$ARGUMENTS" --background`,
  description: "agy review",
  run_in_background: true
})
```

If neither `--wait` nor `--background` is present, prefer foreground for small diffs and background for broad or unclear diffs.
