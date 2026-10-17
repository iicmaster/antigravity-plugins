#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateAgentPlugin,
  validateAllAgentPlugins,
  AGENT_PLUGIN_SCHEMA_URL,
  AGENT_PLUGIN_MCP_SCHEMA_URL
} from "../plugins/agy/scripts/lib/agent-plugin-validator.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, "..");

export function runPrePublishGate(rootDir = DEFAULT_ROOT, options = {}) {
  const isQuiet = options.quiet === true;
  const log = (...args) => {
    if (!isQuiet) console.log(...args);
  };

  log("================================================================");
  log("   Agent Plugins v1.0.0 Pre-Publish Specification Gate");
  log("   Standard: https://agent-plugins.org (v1.0.0)");
  log("================================================================");
  log(`Repository root: ${rootDir}\n`);

  const errors = [];
  const warnings = [];

  // 1. Validate root package.json
  const pkgPath = path.join(rootDir, "package.json");
  let pkg = null;
  if (!fs.existsSync(pkgPath)) {
    errors.push("Missing root package.json");
  } else {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      log(`[✓] package.json found: ${pkg.name}@${pkg.version}`);
      if (!pkg.version || !/^\d+\.\d+\.\d+/.test(pkg.version)) {
        errors.push("package.json: Invalid semver version");
      }
      if (!pkg.license) {
        errors.push("package.json: Missing license");
      }
    } catch (e) {
      errors.push(`package.json: Parse error: ${e.message}`);
    }
  }

  const pkgVersion = pkg?.version || "1.0.0";

  // 2. Validate Marketplace Catalogs
  const claudeMarketplacePath = path.join(rootDir, ".claude-plugin", "marketplace.json");
  if (fs.existsSync(claudeMarketplacePath)) {
    try {
      const claudeMarketplace = JSON.parse(fs.readFileSync(claudeMarketplacePath, "utf8"));
      if (claudeMarketplace.metadata?.version !== pkgVersion) {
        errors.push(
          `.claude-plugin/marketplace.json metadata.version (${claudeMarketplace.metadata?.version}) does not match package.json (${pkgVersion})`
        );
      }
      for (const p of claudeMarketplace.plugins || []) {
        if (p.version !== pkgVersion) {
          errors.push(
            `.claude-plugin/marketplace.json plugin '${p.name}' version (${p.version}) does not match package.json (${pkgVersion})`
          );
        }
      }
      log(`[✓] .claude-plugin/marketplace.json verified (${(claudeMarketplace.plugins || []).length} plugins)`);
    } catch (e) {
      errors.push(`.claude-plugin/marketplace.json: Parse error: ${e.message}`);
    }
  }

  const codexMarketplacePath = path.join(rootDir, ".agents", "plugins", "marketplace.json");
  if (fs.existsSync(codexMarketplacePath)) {
    try {
      const codexMarketplace = JSON.parse(fs.readFileSync(codexMarketplacePath, "utf8"));
      log(`[✓] .agents/plugins/marketplace.json verified (${(codexMarketplace.plugins || []).length} plugins)`);
    } catch (e) {
      errors.push(`.agents/plugins/marketplace.json: Parse error: ${e.message}`);
    }
  }

  // 3. Validate all plugins in plugins/
  const pluginsDir = path.join(rootDir, "plugins");
  const pluginsResult = validateAllAgentPlugins(pluginsDir, {
    requireSchema: true
  });

  log("\nChecking plugin packages against agent-plugins.org v1.0.0:");
  for (const plugin of pluginsResult.plugins) {
    const status = plugin.valid ? "[PASS]" : "[FAIL]";
    log(`  ${status} ${plugin.name} (dir: ${path.relative(rootDir, plugin.dir)})`);

    if (plugin.details.plugin?.$schema) {
      log(`         $schema: ${plugin.details.plugin.$schema}`);
    }
    if (plugin.details.skills?.length > 0) {
      log(`         Skills: ${plugin.details.skills.map((s) => s.name).join(", ")}`);
    }
    if (plugin.details.mcpServers?.length > 0) {
      log(`         MCP Servers: ${plugin.details.mcpServers.map((s) => `${s.name} (${s.type})`).join(", ")}`);
    }

    if (!plugin.valid) {
      for (const err of plugin.errors) {
        errors.push(`Plugin '${plugin.name}': ${err}`);
        log(`         ✖ Error: ${err}`);
      }
    }
    for (const warn of plugin.warnings) {
      warnings.push(`Plugin '${plugin.name}': ${warn}`);
      log(`         ▲ Warning: ${warn}`);
    }

    // Check host extensions
    const claudeExt = path.join(plugin.dir, ".claude-plugin", "plugin.json");
    if (fs.existsSync(claudeExt)) {
      try {
        const cManifest = JSON.parse(fs.readFileSync(claudeExt, "utf8"));
        if (cManifest.version && cManifest.version !== pkgVersion && plugin.name !== "sample-agent-plugin") {
          errors.push(`Plugin '${plugin.name}' .claude-plugin/plugin.json version (${cManifest.version}) != package.json (${pkgVersion})`);
        }
      } catch (e) {
        errors.push(`Plugin '${plugin.name}' .claude-plugin/plugin.json invalid: ${e.message}`);
      }
    }

    const codexExt = path.join(plugin.dir, ".codex-plugin", "plugin.json");
    if (fs.existsSync(codexExt)) {
      try {
        const cxManifest = JSON.parse(fs.readFileSync(codexExt, "utf8"));
        if (cxManifest.version && cxManifest.version !== pkgVersion && plugin.name !== "sample-agent-plugin") {
          errors.push(`Plugin '${plugin.name}' .codex-plugin/plugin.json version (${cxManifest.version}) != package.json (${pkgVersion})`);
        }
      } catch (e) {
        errors.push(`Plugin '${plugin.name}' .codex-plugin/plugin.json invalid: ${e.message}`);
      }
    }
  }

  // 4. Summary & Exit Gate
  log("\n----------------------------------------------------------------");
  const passed = errors.length === 0 && pluginsResult.valid;

  if (passed) {
    log(`✨ PRE-PUBLISH GATE PASSED: All ${pluginsResult.plugins.length} plugins fully comply with agent-plugins.org v1.0.0`);
    if (warnings.length > 0) {
      log(`   (${warnings.length} warning(s) detected)`);
    }
    return {
      success: true,
      pluginCount: pluginsResult.plugins.length,
      errors: [],
      warnings
    };
  } else {
    log(`❌ PRE-PUBLISH GATE FAILED: Found ${errors.length} error(s)`);
    for (const err of errors) {
      log(`   - ${err}`);
    }
    return {
      success: false,
      pluginCount: pluginsResult.plugins.length,
      errors,
      warnings
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const rootArgIdx = process.argv.indexOf("--root");
  const rootDir = rootArgIdx !== -1 && process.argv[rootArgIdx + 1] ? process.argv[rootArgIdx + 1] : DEFAULT_ROOT;
  const isQuiet = process.argv.includes("--quiet");

  const result = runPrePublishGate(rootDir, { quiet: isQuiet });
  if (!result.success) {
    process.exit(1);
  }
  process.exit(0);
}
