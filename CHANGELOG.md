# Changelog

All notable changes to this project will be documented in this file.

## 0.5.0 - 2026-10-17

### Added

- **Gemini 4 Argon Primary Model Support**:
  - Dedicated primary hero quota card (`#gemini4Group`) for **Gemini 4 Argon** (`gemini-4-argon-medium` / `high` / `low`) with active flagship status indicator (`● ACTIVE`), burn-rate velocity badge, session trend sparkline, and 1-click CLI switch helper.
  - Prioritized `Gemini 4 Argon` quota metrics (`isPrimary: true`) and alert tracking (`gemini4Weekly` / `gemini45h`) in both `server.js` and `mcp-server.js`.
  - Updated default primary model fallback to `Gemini 4 Argon (Medium)` and refreshed quick-action model switch commands (`gemini-4-argon-low`, `gemini-4-argon-medium`, `gemini-3.8-flash-high`).
- **Quota Dashboard UX Redesign & Telemetry**:
  - Refactored top bar into 3 semantic control clusters (Telemetry & Auto-Sync, Utility & Theme Controls, Primary Actions).
  - Added Light / Dark Ambient theme toggle with `localStorage` persistence.
  - Added real-time CLI runtime account resolution from `agy` session logs with multi-profile Chrome avatar enrichment.
  - Added plugin version badge (`#pluginVersion`), 24-hour time formatting (`en-GB`, `hour12: false`), and custom vector `favicon.svg`.
- **Agent Plugins v1.0.0 Pre-Publish Gate**:
  - Added `scripts/check-agent-plugins.mjs` (`npm run check:spec` & `prepublishOnly` hook) and `docs/AGENT_PLUGINS_SPEC.md` enforcing `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` and `mcp.schema.json`.

## 0.4.0 - 2026-08-17

### Added

- **Quota Dashboard Multi-tier Alert & Notification System**:
  - **Web Audio Chimes**: Synthesized audio chimes (Web Audio API) for warning, critical, and recovery/reset events.
  - **Browser Push Notifications**: Native browser notifications via Notification API with automatic permission prompt.
  - **macOS Native Alerts**: Integrated `osascript` desktop notifications with system alert sounds (`Ping`, `Basso`, `Hero`).
  - **In-App Toast Container**: Real-time stackable toast alerts for immediate in-page visibility.
  - **Notification Settings Modal**: Interactive configuration modal for alert thresholds (warning/critical %), notification cooldown minutes, sound effects, browser push, and reset alerts.
  - **Interactive Notification Tester**: `/api/notifications/test` endpoint and in-UI test button for rapid verification of audio, push, and toast alerts.
- **Account Identity & Profile Display**:
  - Dedicated Google Account identity card showing account display name, email, avatar image with dynamic initials fallback, authentication method, token type, and expiration metadata.
- **Automated Test Expansion**:
  - Test suites extended to cover notification endpoints, account info extraction, modal UI bindings, and MCP server dynamic versioning.

## 0.3.0 - 2026-08-17

### Added

- **Specialized AGY Workflow Skills**:
  - `agy-diff-inspector`: Deep, 5-stage adversarial Git Diff analysis (Concurrency, Race conditions, Security boundary violations, Regressions, and missing tests).
  - `agy-task-rescue`: Autonomous task rescue, scientific debugging, and RCA in an isolated background sandbox.
  - `agy-advisor`: Independent technical advisor and architectural second-opinion consultant evaluating trade-offs, sanity checks, and blind spots.
- **Quota Telemetry Skill**:
  - `quota-guard`: Threshold monitoring, burn-rate calculation, automated protective alerting, and model downgrade recommendations.
- **Sequential Thinking (`sqthink`) Integration**:
  - Infused structured multi-stage reasoning pipelines, hypothesis falsification, adversarial Black-Hat auditing, and confidence levels into all specialized skills.

### Changed

- Reorganized skill taxonomy into laser-focused, domain-specific skills.
- Consolidated artifact and Thai prose editing into `artifact-sftp` (PR #17).

## 0.2.0 - 2026-08-17

### Added

- **Quota Dashboard Plugin**: Real-time Quota & Usage Monitor Web Dashboard for Antigravity (`agy`) featuring live quota gauges, reset countdown timers, AI Premium Credits status, active model inspection, and RAW JSON debugging viewer.
- **MCP Stdio Tools**:
  - `get_quota`: Fetch live model quota percentages, countdowns, remaining credits, and active model status.
  - `open_dashboard`: Check server health on port 3838, automatically spawn background daemon if stopped, and launch cross-platform default browser.
- **Agent Plugins Spec Compliance**: Implemented `agent-plugins.org` v1.0.0 portable package specification with `plugin.json` and `mcp.json` schemas for multi-host interoperability (Claude Code and Codex).
- **Minimal MUJI UI**: Clean, responsive, and minimalist typography/theme for the Quota Dashboard frontend.
- **Automated Tests**: Test suite coverage expanded to 57 passing tests including MCP tools validation and plugin discovery.

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
