# Antigravity Quota Dashboard Plugin

Real-time Quota & Usage Monitor Web Dashboard for Antigravity (`agy`).

## Features

- **Primary Family First (Gemini 4 Family — Hydrogen Default)**: Dedicated hero telemetry card (`#gemini4Group`) and interactive family quick-switch bar covering **Gemini 4 Hydrogen** (`gemini-4-hydrogen-medium` / `low` / `high` / `xhigh` — Default Primary), **Gemini 4 Carbon**, **Gemini 4 Argon**, and **Orchestrator** (`Carbon` / `Argon`).
- **Real-Time Quota Tracking**: Visual status bars, burn-rate velocity, session sparklines, and reset countdown timers for the shared Gemini pool (Gemini 4 Family & Gemini 3.8 Flash) and Claude/GPT model quotas.
- **AI Premium Credits**: View remaining credits and upgrade link.
- **Account & Token Status**: Check active model, primary model status, and real-time CLI authentication.
- **RAW JSON Inspection**: One-click JSON view and copy functionality for debugging `agy` outputs.
- **MCP Integration**: Stdio MCP tools to fetch live quota and automatically launch the dashboard browser UI.

## MCP Tools

- `get_quota`: Fetch live model quota percentages, reset countdowns, credits, and active model status.
- `open_dashboard`: Ensure the web dashboard server is active (default port 3838) and optionally launch the default browser (`openBrowser: true`).

## Manual Usage

Start the dashboard server directly:

```bash
node plugins/quota-dashboard/server.js
```

Or run the shell script:

```bash
./plugins/quota-dashboard/start.sh
```

Open http://localhost:3838 in your browser.
