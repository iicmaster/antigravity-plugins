# Security Policy

## Supported Versions

The current `main` branch and latest tagged release receive security fixes.

## Reporting A Vulnerability

Please do not open a public issue for vulnerabilities, credential leaks, or permission-bypass bugs.

Use GitHub private vulnerability reporting when available:

```text
https://github.com/iicmaster/antigravity-plugins/security/advisories/new
```

If private reporting is not available, contact the maintainer through the GitHub repository and keep details minimal until a private channel is established.

## Security Expectations

- No hardcoded secrets.
- Spawn `agy` with argv arrays and `shell: false`; do not construct shell strings from user text.
- Omit `--print` and pipe prompt text through child stdin so it never enters process argv or the command log.
- Keep AGY sandboxing enabled by default. `--dangerously-skip-permissions` and sandbox-disable behavior must remain explicit opt-ins and must not be exposed through the Codex MCP rescue tool.
- Validate MCP input before runtime execution and validate again inside the stdio server before invoking the companion runtime.
- Keep job state and logs outside the repository by default (`CLAUDE_PLUGIN_DATA/state` when provided, otherwise the runtime fallback outside the checkout).
- Error output should not expose local secrets, credentials, or full prompt text unless the user explicitly requested that diagnostic detail.

Security fixes may be released without waiting for unrelated refactors or feature work.
