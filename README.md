# AGY Agent Plugins

Open-source Claude Code and Codex plugin adapters that delegate review and rescue workflows to the Antigravity CLI (`agy`).

This repository does not implement Antigravity itself. It wraps a locally installed `agy` binary so another coding agent can ask Antigravity for a second review, adversarial pass, or bounded rescue task.

## What Is Included

- Claude Code plugin marketplace metadata in `.claude-plugin/`.
- Codex plugin marketplace metadata in `.agents/plugins/`.
- One plugin, `plugins/agy`, with Claude slash commands and a Codex MCP server.
- Shared Node.js runtime scripts for launching, tracking, reading, and cancelling AGY jobs.
- A focused Node test suite for runtime safety, plugin structure, and MCP behavior.

## Requirements

- Node.js 18.18 or newer.
- Git.
- A working Antigravity CLI named `agy` on your `PATH`.
- Claude Code or Codex, depending on which adapter you want to use.

On some `agy` installs, print mode may report `no active conversation` until an Antigravity conversation has been opened or resumed once. `setup` verifies the binary and required flags; actual delegation still depends on the local `agy` session state.

## Install In Claude Code

Add this repository as a Claude Code plugin marketplace, then install the `agy` plugin from it:

```text
/plugin marketplace add https://github.com/iicmaster/antigravity-plugins
/plugin install agy@claude-code-agy
/reload-plugins
/agy:setup
```

For local development, replace the GitHub URL with your local checkout path.

### Claude Commands

- `/agy:setup` checks whether `agy` is installed and exposes the flags this plugin needs.
- `/agy:review` sends the current git context to `agy` for read-only review.
- `/agy:adversarial-review` sends a stricter review prompt focused on hidden risks.
- `/agy:rescue` delegates a bounded investigation or fix request to `agy`.
- `/agy:status`, `/agy:result`, and `/agy:cancel` manage jobs launched by the companion runtime.

## Install In Codex

Add this repository as a Codex plugin marketplace, install the `agy` plugin, then confirm the MCP server is visible:

```bash
codex plugin marketplace add https://github.com/iicmaster/antigravity-plugins
codex plugin add agy@antigravity-plugins
codex mcp list
```

For interactive Codex sessions, ask Codex to use an AGY MCP tool such as `agy_setup`, `agy_review`, or `agy_rescue`. A safe install smoke test is:

```bash
codex exec -C <repo-path> --ephemeral \
  'Use the AGY MCP tool agy_setup. Do not modify files. Reply with the exact tool output.'
```

If your non-interactive Codex policy cannot approve MCP tools, verify the local runtime directly instead of disabling sandbox protections just for installation testing:

```bash
node plugins/agy/scripts/agy-companion.mjs setup
```

## Repository Layout

```text
.agents/plugins/               Codex marketplace metadata
.claude-plugin/                Claude Code marketplace metadata
docs/                          Architecture and future project notes
plugins/agy/                   The AGY plugin
plugins/agy/commands/          Claude Code slash commands
plugins/agy/skills/agy/        Codex-facing skill instructions
plugins/agy/scripts/           Shared companion, worker, and MCP runtime
tests/                         Node.js test suite
```

Local BMAD, Claude, and agent skill installs are intentionally ignored by git. They are development workflow files, not part of the public plugin contract.

## Development

```bash
npm test
node plugins/agy/scripts/agy-companion.mjs setup
node plugins/agy/scripts/agy-companion.mjs setup --json
node plugins/agy/scripts/agy-mcp-server.mjs
```

The runtime stores job state under `CLAUDE_PLUGIN_DATA/state` when Claude Code provides that environment variable. Outside Claude Code it falls back to `/tmp/agy-companion/<workspace-hash>/`.

## Security Model

- `agy` is spawned with `shell: false` from runtime code.
- User prompt text is passed as argv data, not shell-interpolated command text.
- `--dangerously-skip-permissions` is never enabled unless explicitly requested.
- The default AGY execution mode uses `--sandbox`.
- Codex MCP arguments are validated before reaching the companion runtime, and the MCP rescue tool does not expose sandbox-disable or dangerous permission-bypass flags.
- Job state is written outside the repository by default.

## Limitations

- This is a wrapper around a local `agy` binary. It does not provide hosted Antigravity access.
- AGY authentication, availability, and model behavior are controlled by the user's local Antigravity installation.
- The Codex MCP adapter is local to this plugin. A standalone shared MCP package may be extracted later if the tool contract stabilizes.
- The current release targets Unix-like shells for the Codex MCP launcher.

## License

MIT. See [LICENSE](LICENSE).
