# Changelog

All notable changes to this project will be documented in this file.

## 0.1.4 - 2026-07-17

### Fixed

- The Codex plugin manifest (`.codex-plugin/plugin.json`) now carries the real version; it had been stuck at 0.1.0, so Codex hosts kept a stale-named cache. A structure test now enforces version parity across every manifest.
- The MCP `serverInfo` version is read from the plugin manifest instead of a hardcoded string.
- The headless-denial error message no longer suggests enabling a sandbox that is already on; denial detection also tolerates indented banner lines.

## 0.1.3 - 2026-07-17

### Fixed

- Headless-denial detection is line-anchored and scoped to empty-stdout runs, so leading log noise on stderr cannot hide the banner and real partial output is never misclassified as a denial.
- MCP server tests pin `CLAUDE_PLUGIN_DATA` to a temp directory instead of writing job state into the host session's real plugin data dir.

## 0.1.2 - 2026-07-17

### Fixed

- Sandboxed headless runs now pass `--dangerously-skip-permissions` by default so review/rescue tool calls are no longer auto-denied in print mode (#5). Unsandboxed runs still require the explicit flag.
- Jobs whose only output is the headless permission auto-denial banner are now reported as `failed` with an actionable error instead of `succeeded` with no usable result.
- The setup print smoke check mirrors the real job invocation shape, including the sandboxed permission policy.

## 0.1.1 - 2026-07-17

### Fixed

- Bump the plugin version so Claude Code invalidates the stale `0.1.0` cache; the cached build still sent a bare `--print` flag, which AGY 1.1.x parses as `--print <prompt>` — consuming `--print-timeout` as the prompt text, ignoring the real prompt on stdin (surfacing as EPIPE), and answering about the flag instead of the task.

### Added

- AI-assisted installation guidance for Claude Code and Codex users.
- Codex project instructions in `AGENTS.md` for shared-runtime boundaries, local state hygiene, and verification commands.
- Developer Preview status, troubleshooting guidance, and a verification matrix for public onboarding.
- `.npmignore` rules so repository guidance and local workflow state do not ship in the npm tarball.

### Changed

- Expanded architecture and security docs to reflect stdin prompt transport, thin host adapters, and shared companion/runtime ownership.
- Clarified local workflow folders such as `.omx/` should stay out of commits.
- Require AGY 1.1.1 or newer and use implicit non-interactive stdin mode without a bare `--print` flag.

## 0.1.0 - 2026-05-23

### Added

- Initial AGY plugin for Claude Code slash commands.
- Initial AGY plugin for Codex through a local MCP stdio server.
- Shared companion runtime for setup, review, adversarial review, rescue, status, result, and cancel workflows.
- Tests for runtime safety, plugin structure, and MCP setup behavior.
- Public open-source documentation and project templates.
