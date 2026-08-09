# Antigravity Quota Dashboard Plugin

Real-time Quota & Usage Monitor Web Dashboard for Antigravity (`agy`).

## Features

- **Real-Time Quota Tracking**: Visual status bars and reset countdown timers for Gemini and Claude/GPT model quotas.
- **AI Premium Credits**: View remaining credits and upgrade link.
- **Account & Token Status**: Check active model and authentication method.
- **RAW JSON Inspection**: One-click JSON view and copy functionality for debugging `agy` outputs.

## Usage

Start the dashboard server:

```bash
node plugins/quota-dashboard/server.js
```

Or run the shell script:

```bash
./plugins/quota-dashboard/start.sh
```

Open http://localhost:3838 in your browser.
