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
- No command construction from untrusted shell strings.
- No default use of `--dangerously-skip-permissions`.
- MCP input must be validated before runtime execution.
- Error output should not expose local secrets or credentials.

Security fixes may be released without waiting for unrelated refactors or feature work.
