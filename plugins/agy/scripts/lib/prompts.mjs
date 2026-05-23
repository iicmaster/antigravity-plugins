import fs from "node:fs";
import path from "node:path";

export function loadPrompt(rootDir, name) {
  return fs.readFileSync(path.join(rootDir, "prompts", `${name}.md`), "utf8");
}

export function interpolate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => String(values[key] ?? ""));
}
