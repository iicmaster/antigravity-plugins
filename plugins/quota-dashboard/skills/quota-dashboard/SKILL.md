---
name: quota-dashboard
description: Antigravity Quota Monitor Dashboard - Real-time web UI and status inspector for AGY model quota and credits.
---

# Quota Dashboard Skill

Use this skill when you need to inspect or display real-time Antigravity (AGY) quota usage, remaining credits, model reset timers, or run/launch the local Quota Dashboard web app.

## MCP Tools
- `get_quota`: Fetch structured real-time quota, credits, and model info.
- `open_dashboard`: Check if server is running on port 3838 (or custom port), auto-start if down, and launch browser.

## Web Dashboard Server
- Location: `plugins/quota-dashboard/`
- Start server: `node plugins/quota-dashboard/server.js` or `./plugins/quota-dashboard/start.sh`
- Access URL: `http://localhost:3838`

## API Endpoints
- `GET http://localhost:3838/api/quota`: Returns JSON payload containing:
  - `activeModel`: Active model name (defaults to primary `Gemini 4 Argon (Medium)`)
  - `primaryModel`: Primary flagship model (`Gemini 4 Argon (Medium)`)
  - `isPrimaryModelActive`: Boolean indicating whether a Gemini 4 model is currently active
  - `quotas`: Usage percentages and reset timestamps prioritized with `Gemini 4 Argon` first, followed by standard Gemini & Claude/GPT models
  - `credits`: Remaining credits and upgrade URL
  - `token`: Authentication method and token expiration
