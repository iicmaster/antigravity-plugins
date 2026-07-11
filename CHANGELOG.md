# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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
