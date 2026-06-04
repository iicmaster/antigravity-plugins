# Project Instructions

## Scope
- This file governs the repository from this directory downward.

## Commands
- `npm test` - Run the Node test suite.
- `npm run validate` - Alias for `npm test`.
- `node plugins/agy/scripts/agy-companion.mjs setup` - Check local AGY runtime support.

## Architecture
- `plugins/agy/scripts/lib/agy-runtime.mjs` owns AGY process execution, safe argv construction, state, worker launch, and cancellation helpers.
- `plugins/agy/commands/` and `plugins/agy/skills/agy/` are host adapters; keep them thin and do not duplicate runtime behavior there.
- Prompt text for `agy --print` is piped through stdin, not passed as a positional argv item.

## Workflow
- Stage only intended source/docs files. Do not commit local workflow or runtime folders such as `.agent/`, `.claude/`, `.agents/skills/`, `_bmad/`, `.omx/`, `plugin-data/`, or `.agy-state/`.
- Keep Claude and Codex behavior shared through the companion/runtime unless host contracts truly require separate implementation.
- Treat command construction, permission flags, and MCP argument validation as security-sensitive.

## Verification
- Run `git diff --check` before committing.
- Run `npm test` for code, runtime, plugin metadata, or command behavior changes.
- Smoke-test Claude Code or Codex installs when changing host install flow, commands, MCP config, or setup behavior.
