# AGY Rescue

Claude Code is delegating a bounded task to Antigravity CLI.

Task:
{{USER_TASK}}

Workspace context:
{{WORKSPACE_CONTEXT}}

Rules:
- Work within the provided workspace.
- Do not modify files unless the task explicitly asks for file changes.
- Use the smallest safe change only when edits are explicitly requested.
- Run relevant verification when feasible.
- Report changed files and verification results.
