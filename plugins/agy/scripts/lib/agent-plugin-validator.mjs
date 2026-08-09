import fs from "node:fs";
import path from "node:path";

const REVERSE_DOMAIN_REGEX = /^[a-z0-9]+(?:\.[a-z0-9-]+)+$/i;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const PLUGIN_NAME_REGEX = /^[a-z0-9-_]+$/i;

/**
 * Parses YAML frontmatter from a SKILL.md file content.
 *
 * @param {string} content - Markdown file content
 * @returns {{ valid: boolean, attributes?: Object, body?: string, error?: string }}
 */
export function parseSkillFrontmatter(content) {
  if (typeof content !== "string") {
    return { valid: false, error: "Content must be a string" };
  }

  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) {
    return { valid: false, error: "SKILL.md must begin with '---' frontmatter delimiter" };
  }

  const endIdx = normalized.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { valid: false, error: "SKILL.md frontmatter missing closing '---' delimiter" };
  }

  const yamlBlock = normalized.slice(4, endIdx).trim();
  const body = normalized.slice(endIdx + 4).trim();

  const attributes = {};
  const lines = yamlBlock.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    attributes[key] = value;
  }

  return {
    valid: true,
    attributes,
    body
  };
}

/**
 * Validates an Agent Plugin directory according to agent-plugins.org v1.0.0 specification.
 *
 * @param {string} pluginDir - Path to the plugin root directory.
 * @param {Object} [options] - Validation options.
 * @returns {{ valid: boolean, errors: string[], warnings: string[], details: Object }}
 */
export function validateAgentPlugin(pluginDir, options = {}) {
  const errors = [];
  const warnings = [];
  const details = {
    plugin: null,
    skills: [],
    mcpServers: [],
    clientExtensions: []
  };

  if (!fs.existsSync(pluginDir)) {
    return {
      valid: false,
      errors: [`Plugin directory does not exist: ${pluginDir}`],
      warnings: [],
      details
    };
  }

  const stat = fs.statSync(pluginDir);
  if (!stat.isDirectory()) {
    return {
      valid: false,
      errors: [`Specified path is not a directory: ${pluginDir}`],
      warnings: [],
      details
    };
  }

  // 1. Validate plugin.json
  const manifestPath = path.join(pluginDir, "plugin.json");
  let manifest = null;

  if (!fs.existsSync(manifestPath)) {
    errors.push("Missing required manifest: plugin.json");
  } else {
    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      manifest = JSON.parse(raw);
      details.plugin = manifest;
    } catch (err) {
      errors.push(`Invalid JSON format in plugin.json: ${err.message}`);
    }
  }

  let skillsRelPath = null;
  let mcpRelPath = null;

  if (manifest) {
    // Check required fields
    if (!manifest.name || typeof manifest.name !== "string" || !manifest.name.trim()) {
      errors.push("plugin.json: 'name' field is required and must be a non-empty string");
    } else if (!PLUGIN_NAME_REGEX.test(manifest.name)) {
      errors.push("plugin.json: 'name' field contains invalid characters (must be alphanumeric, hyphens, or underscores)");
    }

    if (!manifest.version || typeof manifest.version !== "string") {
      errors.push("plugin.json: 'version' field is required");
    } else if (!SEMVER_REGEX.test(manifest.version)) {
      errors.push("plugin.json: 'version' must be a valid semver string (e.g. 1.0.0)");
    }

    if (!manifest.description || typeof manifest.description !== "string" || !manifest.description.trim()) {
      errors.push("plugin.json: 'description' field is required and must be a non-empty string");
    }

    // Skills path validation
    if (!manifest.skills || typeof manifest.skills !== "string") {
      errors.push("plugin.json: 'skills' field is required and must be a relative path string");
    } else {
      skillsRelPath = manifest.skills;
      const resolvedSkillsPath = path.resolve(pluginDir, skillsRelPath);
      if (!fs.existsSync(resolvedSkillsPath)) {
        errors.push(`plugin.json: Specified skills path does not exist: ${skillsRelPath}`);
        skillsRelPath = null;
      } else if (!fs.statSync(resolvedSkillsPath).isDirectory()) {
        errors.push(`plugin.json: Specified skills path is not a directory: ${skillsRelPath}`);
        skillsRelPath = null;
      }
    }

    // MCP path validation
    const mcpField = manifest.mcpServers || manifest.mcp || manifest.mcpPath;
    if (!mcpField || typeof mcpField !== "string") {
      errors.push("plugin.json: 'mcp' or 'mcpServers' field is required and must be a relative path string");
    } else {
      mcpRelPath = mcpField;
      const resolvedMcpPath = path.resolve(pluginDir, mcpRelPath);
      if (!fs.existsSync(resolvedMcpPath)) {
        errors.push(`plugin.json: Specified MCP path does not exist: ${mcpRelPath}`);
        mcpRelPath = null;
      } else if (!fs.statSync(resolvedMcpPath).isFile()) {
        errors.push(`plugin.json: Specified MCP path is not a file: ${mcpRelPath}`);
        mcpRelPath = null;
      }
    }
  }

  // 2. Validate skills structure (skills/*/SKILL.md)
  if (skillsRelPath) {
    const resolvedSkillsDir = path.resolve(pluginDir, skillsRelPath);
    const entries = fs.readdirSync(resolvedSkillsDir, { withFileTypes: true });
    const skillSubdirs = entries.filter((entry) => entry.isDirectory());

    if (skillSubdirs.length === 0) {
      warnings.push(`Skills directory is empty: ${skillsRelPath}`);
    }

    for (const subdir of skillSubdirs) {
      const skillName = subdir.name;
      const skillFilePath = path.join(resolvedSkillsDir, skillName, "SKILL.md");

      if (!fs.existsSync(skillFilePath)) {
        errors.push(`Skill '${skillName}': Missing required SKILL.md file`);
        continue;
      }

      const content = fs.readFileSync(skillFilePath, "utf8");
      const parsed = parseSkillFrontmatter(content);

      if (!parsed.valid) {
        errors.push(`Skill '${skillName}/SKILL.md': ${parsed.error}`);
        continue;
      }

      const { attributes, body } = parsed;
      if (!attributes.name || typeof attributes.name !== "string" || !attributes.name.trim()) {
        errors.push(`Skill '${skillName}/SKILL.md': Frontmatter missing required 'name' field`);
      }
      if (!attributes.description || typeof attributes.description !== "string" || !attributes.description.trim()) {
        errors.push(`Skill '${skillName}/SKILL.md': Frontmatter missing required 'description' field`);
      }

      if (!body || !body.trim()) {
        warnings.push(`Skill '${skillName}/SKILL.md': Body content is empty`);
      }

      details.skills.push({
        name: skillName,
        path: path.relative(pluginDir, skillFilePath),
        attributes,
        hasBody: Boolean(body && body.trim())
      });
    }
  }

  // 3. Validate mcp.json format
  if (mcpRelPath) {
    const resolvedMcpPath = path.resolve(pluginDir, mcpRelPath);
    let mcpConfig = null;
    try {
      const raw = fs.readFileSync(resolvedMcpPath, "utf8");
      mcpConfig = JSON.parse(raw);
    } catch (err) {
      errors.push(`MCP config '${mcpRelPath}': Invalid JSON format: ${err.message}`);
    }

    if (mcpConfig) {
      const servers = mcpConfig.mcpServers && typeof mcpConfig.mcpServers === "object"
        ? mcpConfig.mcpServers
        : (typeof mcpConfig === "object" ? mcpConfig : null);

      if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
        errors.push(`MCP config '${mcpRelPath}': Root object must contain an 'mcpServers' object or server map`);
      } else {
        const serverEntries = Object.entries(servers);
        if (serverEntries.length === 0) {
          warnings.push(`MCP config '${mcpRelPath}': No MCP servers defined`);
        }

        for (const [serverName, serverCfg] of serverEntries) {
          if (!serverCfg || typeof serverCfg !== "object" || Array.isArray(serverCfg)) {
            errors.push(`MCP server '${serverName}': Configuration must be an object`);
            continue;
          }

          const transportType = serverCfg.type
            ? String(serverCfg.type).toLowerCase()
            : (serverCfg.command ? "stdio" : (serverCfg.url ? "streamable-http" : "unknown"));

          let transportValid = false;

          if (transportType === "stdio") {
            if (!serverCfg.command || typeof serverCfg.command !== "string" || !serverCfg.command.trim()) {
              errors.push(`MCP server '${serverName}': stdio transport requires a non-empty 'command' string`);
            } else {
              transportValid = true;
            }

            if (serverCfg.args !== undefined && !Array.isArray(serverCfg.args)) {
              errors.push(`MCP server '${serverName}': 'args' must be an array of strings`);
            } else if (Array.isArray(serverCfg.args)) {
              for (const arg of serverCfg.args) {
                if (typeof arg !== "string") {
                  errors.push(`MCP server '${serverName}': All items in 'args' array must be strings`);
                  break;
                }
              }
            }

            if (serverCfg.env !== undefined && (typeof serverCfg.env !== "object" || serverCfg.env === null || Array.isArray(serverCfg.env))) {
              errors.push(`MCP server '${serverName}': 'env' must be a key-value object`);
            }
          } else if (transportType === "streamable-http" || transportType === "streamable_http" || transportType === "http") {
            if (!serverCfg.url || typeof serverCfg.url !== "string" || !/^https?:\/\//i.test(serverCfg.url)) {
              errors.push(`MCP server '${serverName}': Streamable HTTP transport requires a valid 'url' starting with http:// or https://`);
            } else {
              transportValid = true;
            }

            if (serverCfg.headers !== undefined && (typeof serverCfg.headers !== "object" || serverCfg.headers === null || Array.isArray(serverCfg.headers))) {
              errors.push(`MCP server '${serverName}': 'headers' must be a key-value object`);
            }
          } else if (transportType === "sse") {
            if (!serverCfg.url || typeof serverCfg.url !== "string" || !/^https?:\/\//i.test(serverCfg.url)) {
              errors.push(`MCP server '${serverName}': SSE transport requires a valid 'url' starting with http:// or https://`);
            } else {
              transportValid = true;
            }

            if (serverCfg.headers !== undefined && (typeof serverCfg.headers !== "object" || serverCfg.headers === null || Array.isArray(serverCfg.headers))) {
              errors.push(`MCP server '${serverName}': 'headers' must be a key-value object`);
            }
          } else {
            errors.push(`MCP server '${serverName}': Unsupported or invalid transport configuration. Must specify 'command' (stdio) or 'url' (streamable HTTP / SSE)`);
          }

          if (transportValid) {
            details.mcpServers.push({
              name: serverName,
              type: transportType,
              config: serverCfg
            });
          }
        }
      }
    }
  }

  // 4. Validate reverse-domain client extension folders (e.g. com.example.client/)
  const rootEntries = fs.readdirSync(pluginDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;

    // Skip standard directories
    if (["skills", "node_modules", ".git", ".agents", ".claude-plugin", ".codex-plugin"].includes(dirName)) {
      continue;
    }

    // Check if folder is intended as reverse-domain client extension or has dots / .client suffix
    const isDomainLike = dirName.includes(".") || dirName.endsWith("client");
    if (isDomainLike) {
      if (!REVERSE_DOMAIN_REGEX.test(dirName)) {
        errors.push(`Client extension folder '${dirName}' has invalid reverse-domain name format (expected e.g. com.example.client)`);
      } else {
        // Validate internal JSON files if present
        const extDirPath = path.join(pluginDir, dirName);
        const extFiles = fs.readdirSync(extDirPath);
        for (const file of extFiles) {
          if (file.endsWith(".json")) {
            const filePath = path.join(extDirPath, file);
            try {
              JSON.parse(fs.readFileSync(filePath, "utf8"));
            } catch (err) {
              errors.push(`Client extension '${dirName}': File '${file}' contains invalid JSON: ${err.message}`);
            }
          }
        }
        details.clientExtensions.push({
          name: dirName,
          path: dirName
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    details
  };
}
