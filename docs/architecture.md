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
  -> agy implicit non-interactive mode (no --print; prompt piped via stdin)
  -> job log/result/state
```

```text
Codex MCP tool
  -> plugins/agy/scripts/agy-mcp-server.mjs
  -> plugins/agy/scripts/agy-companion.mjs
  -> plugins/agy/scripts/lib/agy-runtime.mjs
  -> agy implicit non-interactive mode (no --print; prompt piped via stdin)
  -> job log/result/state
```

The companion script owns command parsing, prompt selection, job creation, and status/result/cancel behavior.

The runtime library owns safe `agy` argv construction, state storage, background worker launch, and cancellation helpers.

## Print-Mode Transport Decision

AGY 1.1.1 treats `--print` as a string flag that requires its prompt value. Passing a bare `--print` before other options causes the next option to be consumed as prompt text. To keep prompts out of process argv, this runtime omits `--print` and pipes prompt text through child stdin; AGY detects non-TTY stdin and enters implicit non-interactive mode.

This is not equivalent to Codex app-server. Codex app-server provides a structured JSON-RPC protocol for threads, turns, reviews, events, touched files, and command traces. AGY print mode provides process stdout/stderr and process exit semantics only. The companion may track jobs and partial results, but it must not pretend to own AGY-native thread or turn lifecycle data that AGY does not expose.

Operational guardrails:

- `setup` checks the minimum AGY version, binary availability, and expected flags.
- `setup --smoke` runs a minimal print-mode prompt to prove the local AGY session can complete a non-interactive run.
- Runtime hard-kill timeout is intentionally later than AGY `--print-timeout` so AGY can report its own timeout before the wrapper terminates the process.
- Timed-out jobs with captured stdout are marked `partial`, preserving useful output while keeping the timeout visible.

Migration trigger: if AGY exposes a stable app-server, JSON-RPC, or other structured conversation protocol, add it as a runtime transport behind the shared companion boundary instead of duplicating behavior in host adapters.

The Codex MCP server is intentionally thin: it validates structured tool arguments, converts them into companion argv arrays, and speaks newline-delimited JSON-RPC over stdio.

The Codex MCP launcher resolves the plugin root from `CODEX_PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`, a source checkout, or the local Codex plugin cache under `~/.codex/plugins/cache`. It must not contain machine-local absolute paths.

## Boundary

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| Claude adapter | Slash-command metadata, raw argument handoff, Claude-facing command copy | AGY process semantics, job state schema, prompt transport decisions |
| Codex adapter | Skill instructions, MCP tool schemas, Codex-facing safety limits, local MCP launcher | Duplicate runtime behavior or host-specific copies of job lifecycle logic |
| Shared companion/runtime | Prompt construction, normalized run options, job files, state/result/cancel behavior, implicit non-interactive AGY invocation | Host marketplace policy, host UI copy, future AGY-native plugin layout |

Current decision: keep one shared runtime core with thin Claude and Codex adapters. A host-specific adapter may differ at the command or schema boundary, but process execution and job lifecycle behavior should stay shared until there is evidence that the host contracts truly require separate implementations.

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
- User prompt text is piped through child stdin without a `--print` argv value.
- The default execution mode uses `--sandbox`; the sandbox is the security boundary.
- Sandboxed headless runs pass `--dangerously-skip-permissions` by default because print mode cannot answer permission prompts (tool calls would be auto-denied). Unsandboxed runs require the explicit flag.
- State falls outside the repository by default unless Claude Code supplies plugin data storage.
- Codex MCP tool arguments are schema-shaped and validated again inside the stdio server before reaching the companion runtime.

## MCP Decision

MCP is used as the Codex adapter because Codex can call MCP tools more reliably than it can infer plugin-local script paths from a skill.

This is still not a separate central MCP package. The local MCP server remains inside the `agy` plugin and reuses the same companion/runtime as Claude Code.

Extract a central standalone MCP server later when:

- The command set is stable.
- Result and cancellation semantics are proven.
- Multiple clients need the same state and tool contract.
- The tool schema needs versioning independent of the Claude slash-command surface.
- Sharing the in-repo runtime creates more compatibility risk than extracting a package.

Until then, keep `agy-runtime.mjs` as the shared core and keep host-specific adapters thin.
