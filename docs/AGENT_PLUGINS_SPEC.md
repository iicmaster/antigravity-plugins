# Agent Plugins Specification (v1.0.0)

This document specifies the **Agent Plugins v1.0.0** standard ([agent-plugins.org](https://agent-plugins.org)) as implemented and enforced in this repository.

The Agent Plugins standard defines a portable, open packaging format for extending AI coding agents (such as Claude Code, Codex, and Antigravity CLI) with modular skills, Model Context Protocol (MCP) servers, slash commands, and companion runtime scripts.

---

## 1. Core Specification Principles

The Agent Plugins v1.0.0 specification is built on four core principles:

1. **Portability**: A single plugin package can be installed and executed across multiple agent client hosts without duplicating core skill prompts or runtime logic.
2. **Declarative Manifests**: Plugin metadata, permissions, capability requirements, and entry points are declared in standard JSON manifests.
3. **Open Standards Alignment**: Tooling integration leverages the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) and standard Agent Skill specifications (`SKILL.md`).
4. **Reverse-Domain Client Extensions**: Host-specific behaviors (such as host slash commands or custom UI capabilities) use vendor namespaces (`.claude-plugin/`, `.codex-plugin/`) so client-native features do not break cross-client compatibility.

---

## 2. Portable Package Structure

A standard v1.0.0 portable Agent Plugin package follows a clean directory structure separating portable assets from vendor/client extensions.

### Directory Layout

```text
plugins/<plugin-name>/
├── plugin.json                 # Standard Agent Plugin Manifest (v1.0.0)
├── skills/                     # Portable Agent Skills directory
│   └── <skill-name>/
│       └── SKILL.md            # Skill specification & prompt instructions
├── mcp.json (or .mcp.json)     # Portable MCP server launcher configuration
├── .claude-plugin/             # Reverse-domain extension for Claude Code
│   └── plugin.json             # Claude Code host manifest
├── .codex-plugin/              # Reverse-domain extension for OpenAI Codex
│   └── plugin.json             # Codex host manifest
├── commands/                   # Slash command templates (e.g. Claude Code)
├── prompts/                    # Shared prompt templates
└── scripts/                    # Shared companion runtime scripts & workers
```

---

## 3. Specification Components

### 3.1. Standard Plugin Manifest (`plugin.json`)

The standard manifest `plugin.json` declares the baseline plugin metadata, versioning, author information, and entry points for skills and MCP servers.

#### JSON Schema Example (`plugin.json`)

```json
{
  "name": "agy",
  "version": "0.1.4",
  "description": "Delegate review and rescue workflows to the Antigravity CLI (agy).",
  "author": {
    "name": "IIC Master"
  },
  "license": "MIT",
  "keywords": [
    "agy",
    "antigravity",
    "review",
    "rescue",
    "mcp"
  ],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "AGY Plugin",
    "shortDescription": "Antigravity CLI adapter",
    "category": "Coding",
    "capabilities": [
      "Interactive",
      "Read",
      "Write"
    ]
  }
}
```

#### Field Specifications

| Field | Type | Description |
| --- | --- | --- |
| `name` | String | **Required.** Unique slug identifier for the plugin (e.g., `agy`, `quota-dashboard`). |
| `version` | String | **Required.** SemVer version matching the root repository package version. |
| `description` | String | **Required.** Summary of the plugin's capabilities. |
| `author` | Object / String | Author name and metadata. |
| `license` | String | Open-source license (e.g., `MIT`). |
| `keywords` | Array of Strings | Search and discovery tags. |
| `skills` | String | Relative path to the skills directory (e.g., `./skills/`). |
| `mcpServers` | String / Object | Relative path to the MCP configuration file or inline config. |
| `interface` | Object | Display metadata for graphical or terminal host UIs. |

---

### 3.2. Portable Agent Skills (`skills/`)

Skills provide high-level contextual instructions and workflows to the agent host.

- Each skill is placed in `skills/<skill-name>/SKILL.md`.
- `SKILL.md` contains YAML frontmatter followed by markdown instructions.

#### Example `SKILL.md`

```markdown
---
name: agy
description: Delegate code review or rescue tasks to the Antigravity CLI (agy).
---

# AGY Integration Skill

When the user asks to review changes or delegate a rescue task to AGY, run the local wrapper script:

```bash
node plugins/agy/skills/agy/scripts/agy-codex.mjs review
```
```

---

### 3.3. Portable MCP Configuration (`mcp.json` / `.mcp.json`)

Model Context Protocol (MCP) servers allow agent hosts to call structured tools over stdio or HTTP/SSE transports.

#### Example `.mcp.json`

```json
{
  "mcpServers": {
    "agy": {
      "command": "bash",
      "args": [
        "-lc",
        "node \"${CLAUDE_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-$HOME/.codex/plugins/cache/antigravity-plugins/plugins/agy}}/scripts/agy-mcp-server.mjs\""
      ]
    }
  }
}
```

---

### 3.4. Reverse-Domain Client Extensions

Agent hosts often have vendor-specific feature sets (such as Claude Code slash commands or Codex capability flags). The v1.0.0 specification uses **reverse-domain directory namespaces** to isolate client extensions while keeping the core package portable.

#### Supported Client Extensions in this Repository

1. **Claude Code Extension (`.claude-plugin/`)**
   - Manifest: `.claude-plugin/plugin.json`
   - Custom features: Slash commands defined in `commands/*.md`.
2. **Codex Extension (`.codex-plugin/`)**
   - Manifest: `.codex-plugin/plugin.json`
   - Custom features: Capability policies (`Interactive`, `Read`, `Write`), branding elements (`brandColor`), and default prompts.

#### Manifest Resolution Hierarchy

When an agent host loads a plugin directory, it applies the following fallback chain:

```text
1. Search client-specific namespace directory (e.g., `.<client>-plugin/plugin.json`)
2. If found, load client-specific configuration.
3. Fall back to standard root `plugin.json`.
4. Load portable `skills/` and `mcp.json`.
```

---

## 4. Guide for Plugin Authors

To build a new compliant Agent Plugin in this repository:

### Step 1: Create the Plugin Directory
Create `plugins/<plugin-name>` with the standard structure:

```bash
mkdir -p plugins/my-plugin/skills/my-skill
mkdir -p plugins/my-plugin/.claude-plugin
mkdir -p plugins/my-plugin/.codex-plugin
```

### Step 2: Create Standard `plugin.json`
Write `plugins/my-plugin/plugin.json` containing compliant metadata, SemVer version matching `package.json`, and pointers to `./skills/`.

### Step 3: Author Portable Skills
Create `plugins/my-plugin/skills/my-skill/SKILL.md` with clean YAML frontmatter and clear instructions for the host agent.

### Step 4: Configure MCP Tools (Optional)
If your plugin exposes MCP tools, create `plugins/my-plugin/.mcp.json` and reference it from `plugin.json` (`"mcpServers": "./.mcp.json"`).

### Step 5: Add Reverse-Domain Client Extensions
- Create `plugins/my-plugin/.claude-plugin/plugin.json` for Claude Code.
- Create `plugins/my-plugin/.codex-plugin/plugin.json` for Codex.
- Register your plugin in `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.

### Step 6: Validate Packaging
Run the validation test suite to confirm structural compliance:

```bash
npm test
```

---

## 5. Guide for Client Implementers

For AI agent host environments (Claude Code, Codex, Custom AGY hosts) implementing support for Agent Plugins v1.0.0:

### 1. Marketplace Index Resolution
Client implementers read marketplace indexes:
- Claude Code marketplace: `.claude-plugin/marketplace.json`
- Codex marketplace: `.agents/plugins/marketplace.json`

Plugins are referenced via local relative paths (e.g., `./plugins/agy`).

### 2. Manifest Loading & Schema Parsing
- Check for host extension manifests matching `.<client-id>-plugin/plugin.json`.
- If present, merge with or override standard properties from `plugin.json`.
- Validate SemVer compatibility against host engines.

### 3. Skill & MCP Registration
- Scan the directory resolved by `"skills"` (default `./skills/`) for `SKILL.md` files.
- Launch MCP servers defined in `"mcpServers"` using stdio JSON-RPC transport.

### 4. Sandbox & Runtime Safety
- Client implementations must pass plugin root context via environment variables (`CLAUDE_PLUGIN_ROOT`, `CODEX_PLUGIN_ROOT`).
- Commands launched by plugins must execute with non-interactive, safe process isolation (`shell: false`).

---

## 6. Repository Compliance Matrix

This repository fully complies with Agent Plugins v1.0.0 ([agent-plugins.org](https://agent-plugins.org)):

| Requirement | Implementation in Repository | Verification |
| --- | --- | --- |
| Standard Manifest Structure | `plugins/agy/.claude-plugin/plugin.json`, `plugins/agy/.codex-plugin/plugin.json`, `plugins/quota-dashboard` manifests | `tests/plugin-structure.test.mjs` |
| Portable `skills/` | `plugins/agy/skills/agy/SKILL.md`, `plugins/quota-dashboard/skills/` | Automated test suite |
| Portable MCP Config | `plugins/agy/.mcp.json` | `tests/agy-mcp-server.test.mjs` |
| Reverse-Domain Extensions | `.claude-plugin/` and `.codex-plugin/` per plugin | Marketplace test suite |
| Version Synchronization | Synced across `package.json`, marketplaces, and plugin manifests | `every version-bearing manifest matches the package version` test |
