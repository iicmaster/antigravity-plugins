# AGY Review

You are reviewing code changes from a Claude Code session.

Target: {{TARGET_LABEL}}

User focus:
{{USER_FOCUS}}

Review rules:
- Stay read-only.
- Prioritize correctness bugs, regressions, security issues, data loss, and missing tests.
- Cite concrete files or diff hunks when possible.
- If there are no substantive findings, say that clearly and mention residual risk.

Review input:

```text
{{REVIEW_INPUT}}
```
