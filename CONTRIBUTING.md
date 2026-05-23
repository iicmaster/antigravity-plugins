# Contributing

Thanks for helping improve AGY Agent Plugins.

## Development Setup

1. Install Node.js 18.18 or newer.
2. Install the Antigravity CLI and make sure `agy` is on your `PATH`.
3. Clone the repository.
4. Run the test suite:

```bash
npm test
```

## Local Plugin Testing

Claude Code:

```text
/plugin marketplace add <repo-path>
/plugin install agy@claude-code-agy
/reload-plugins
/agy:setup
```

Codex:

```bash
codex plugin marketplace add <repo-path>
codex plugin add agy@antigravity-plugins
codex mcp list
```

## Pull Requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Update docs when installation, commands, MCP tools, or safety behavior changes.
- Run `npm test` before opening a PR.
- Do not commit local workflow folders such as `.agent/`, `.claude/`, `.agents/skills/`, or `_bmad/`.

## Security-Sensitive Changes

This plugin starts local processes and passes user prompts to another CLI. Treat command construction, path handling, and permission flags as security-sensitive code.

- Keep child process execution on `shell: false` unless there is a documented launcher-only exception.
- Never enable dangerous permission bypass flags by default.
- Validate all MCP tool arguments before they reach runtime code.
- Do not add telemetry, network calls, or credential handling without an explicit design discussion.
