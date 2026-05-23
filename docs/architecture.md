# Architecture

## Direction

The current product is a set of host-agent adapters that invoke the Antigravity CLI (`agy`).

It is not an Antigravity CLI plugin. The agy-native plugin idea is documented separately in `docs/future-projects/agy-native-plugin.md`.

## Runtime Flow

```text
Claude Code slash command
  -> plugins/agy/commands/*.md
  -> plugins/agy/scripts/agy-companion.mjs
  -> plugins/agy/scripts/lib/agy-runtime.mjs
  -> agy --print (prompt piped via stdin)
  -> job log/result/state
```

```text
Codex MCP tool
  -> plugins/agy/scripts/agy-mcp-server.mjs
  -> plugins/agy/scripts/agy-companion.mjs
  -> plugins/agy/scripts/lib/agy-runtime.mjs
  -> agy --print (prompt piped via stdin)
  -> job log/result/state
```

The companion script owns command parsing, prompt selection, job creation, and status/result/cancel behavior.

The runtime library owns safe `agy` argv construction, state storage, background worker launch, and cancellation helpers.

The Codex MCP server is intentionally thin: it validates structured tool arguments, converts them into companion argv arrays, and speaks newline-delimited JSON-RPC over stdio.

The Codex MCP launcher resolves the plugin root from `CODEX_PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`, a source checkout, or the local Codex plugin cache under `~/.codex/plugins/cache`. It must not contain machine-local absolute paths.

## State

When `CLAUDE_PLUGIN_DATA` is available:

```text
$CLAUDE_PLUGIN_DATA/state/
  state.json
  jobs/
    <job-id>.json
    <job-id>.log
    <job-id>.prompt.md
    <job-id>.result.md
```

Outside Claude Code, the fallback is under `/tmp/agy-companion`.

## Security

- `agy` is spawned with `shell: false`.
- User prompt text is piped through child stdin in print mode.
- `--dangerously-skip-permissions` is only added when explicitly requested.
- The default execution mode uses `--sandbox`.
- State falls outside the repository by default unless Claude Code supplies plugin data storage.
- Codex MCP tool arguments are schema-shaped and validated again inside the stdio server before reaching the companion runtime.

## MCP Decision

MCP is used as the Codex adapter because Codex can call MCP tools more reliably than it can infer plugin-local script paths from a skill.

This is still not a separate central MCP package. The local MCP server remains inside the `agy` plugin and reuses the same companion/runtime as Claude Code.

Extract a central standalone MCP server later when:

- The command set is stable.
- Result and cancellation semantics are proven.
- Multiple clients need the same state and tool contract.

Until then, keep `agy-runtime.mjs` as the shared core and keep host-specific adapters thin.
