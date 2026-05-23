# Future Project: AGY-Native Plugin Layer

This is not the current implementation scope.

The current project provides Claude Code and Codex adapters that invoke the Antigravity CLI (`agy`), similar in spirit to how `openai/codex-plugin-cc` lets Claude Code invoke Codex.

Later, build a separate Antigravity CLI plugin project with an agy-native layout:

```text
plugin.json
mcp_config.json
hooks.json
skills/
agents/
rules/
```

Do not mix this future plugin layout into the current host-agent adapter plugin unless the project explicitly changes direction.
