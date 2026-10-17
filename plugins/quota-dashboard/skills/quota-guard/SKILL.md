---
name: quota-guard
description: Quota Threshold & Budget Guard - Employs Sequential Thinking (sqthink) to monitor AGY model quota budgets, evaluate rolling-window consumption rates, and trigger protective fallback actions.
---

# Quota Guard Skill (`quota-guard`)

Use this skill to inspect, protect, and proactively manage your Antigravity (AGY) model quota budgets and remaining AI Premium credits using a **Sequential Thinking (`sqthink`)** decision pipeline.

---

## 🧠 The Sequential Thinking (`sqthink`) Quota Governance Flow

```mermaid
flowchart LR
    S1["1. Metric Ingest (get_quota)"] --> S2["2. Rolling Consumption Projection"]
    S2 --> S3["3. Threat Level Triage"]
    S3 --> S4["4. Autonomous Protection Action"]
```

### 1. Metric Ingestion & Invariant Inspection
- Invoke `get_quota` MCP tool to fetch structured percentages and reset countdowns for:
  - **Gemini 4 Argon (Primary Flagship Model):** Dedicated `Gemini 4 Argon Weekly Limit` (and 5-Hour limit if applicable)
  - Gemini Models (`Gemini 3.8 Flash` & standard): 5-Hour rolling limit & Weekly limit
  - Claude and GPT Models (`Claude 5.5 Opus/Sonnet`, `GPT-OSS 120B`): 5-Hour rolling limit & Weekly limit
  - AI Premium Credits balance

### 2. Rolling Consumption Rate Projection
- Compare remaining percentage against time remaining until the next reset window:
  - *Burn Rate Index:* Is the quota depleting faster than the reset timer recovery?

### 3. Threat Level Triage
- 🟢 **Level 0 (Normal - >35% remaining):** Safe for primary flagship reasoning (`Gemini 4 Argon (Medium/High)`).
- 🟡 **Level 1 (Warning - 15% - 35% remaining):** Recommend prompt token compression or switching to `Gemini 4 Argon (Low)` / `Gemini 3.8 Flash`.
- 🔴 **Level 2 (Critical - <15% remaining):** Proactively trigger fallback (`agy --model gemini-4-argon-low` or `agy --model gemini-3.8-flash-high`) and launch dashboard UI.

### 4. Autonomous Protection Actions
- Automatically invoke `open_dashboard` MCP tool to open the live monitor at `http://localhost:3838`.
- Alert the user with actionable next steps (Switch effort to `Gemini 4 Argon (Low)` or fallback to `Gemini 3.8 Flash`, upgrade credits, or pause automated cron tasks).

---

## 🚀 Invocation

```bash
# Check quota status via MCP
get_quota

# Open live dashboard UI
open_dashboard
```
