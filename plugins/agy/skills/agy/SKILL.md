---
name: agy
description: Use when Codex should delegate a review, adversarial review, bounded rescue task, setup check, status check, result lookup, or cancellation to the Antigravity CLI.
---

# AGY

Use this skill when the user asks Codex to use `agy`, Antigravity, or AGY-backed review/rescue workflows.

## Invocation Contract

Prefer the MCP tools exposed by this plugin when they are available:

- `agy_setup`
- `agy_status`
- `agy_result`
- `agy_cancel`
- `agy_review`
- `agy_adversarial_review`
- `agy_rescue`

Use the script wrapper only as a fallback when MCP tools are not available.

Resolve commands relative to this skill directory. The wrapper script lives at:

```bash
node "<path-to-this-skill>/scripts/agy-codex.mjs" <command> "<raw arguments>"
```

Supported commands:

- `setup` checks whether AGY 1.1.1 or newer is available with the required capabilities. Use `setup --smoke` or MCP `agy_setup` with `smoke: true` to run a minimal implicit-stdin completion check.
- `review` sends current git status and diff to AGY for review.
- `adversarial-review` sends current git status and diff to AGY for a stricter review.
- `rescue` delegates a bounded task to AGY. The Codex MCP tool intentionally keeps AGY sandboxing on and does not expose dangerous permission-bypass flags.
- `status` shows recent AGY jobs for the current workspace.
- `result <job-id>` prints captured output for a job.
- `cancel <job-id>` cancels a queued or running job.

Examples:

```bash
node "<path-to-this-skill>/scripts/agy-codex.mjs" setup
node "<path-to-this-skill>/scripts/agy-codex.mjs" review "--base main security focus"
node "<path-to-this-skill>/scripts/agy-codex.mjs" rescue "--background --timeout 30s investigate the failing test"
node "<path-to-this-skill>/scripts/agy-codex.mjs" status
node "<path-to-this-skill>/scripts/agy-codex.mjs" result "<job-id>"
```

## Safety Rules

- Do not use shell interpolation for user text. Pass raw arguments through the wrapper.
- Do not pass sandbox-disable or dangerous permission-bypass flags through Codex MCP. They are intentionally unavailable there.
- Prefer foreground mode for small bounded checks and background mode for long-running rescue work.
- Use short timeouts for smoke tests; the companion runtime gives AGY `--print-timeout` a grace window before enforcing its own hard timeout.
- Treat `partial` jobs as timed-out print-mode runs that still captured stdout.
- Treat rescue as no-edit by default. File changes should happen only when the user explicitly asks for edits.
- Return companion stdout/stderr faithfully and distinguish AGY output from Codex conclusions.
