import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { setupBackstopMs } from "../plugins/agy/scripts/lib/agy-mcp-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "plugins", "agy", "scripts", "agy-mcp-server.mjs");

function writeFakeAgy(binDir) {
  const fakeAgy = path.join(binDir, "agy");
  fs.writeFileSync(
    fakeAgy,
    `#!/usr/bin/env node
if (process.argv.includes("--version")) {
  console.log("1.1.1");
  process.exit(0);
}
if (process.argv.includes("--help")) {
  console.log("--print --sandbox --add-dir --print-timeout --continue --conversation");
  process.exit(0);
}
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  if (stdin.includes("AGY_SMOKE_OK")) {
    console.log("AGY_SMOKE_OK");
    return;
  }
  console.log("FAKE_AGY:" + JSON.stringify({ argv: process.argv.slice(2), stdin }));
});
`,
    "utf8"
  );
  fs.chmodSync(fakeAgy, 0o755);
}

function createMcpClient(env) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-mcp-"));
  const child = spawn(process.execPath, [SERVER], {
    cwd,
    // Pin plugin state to the temp dir so tests never write into (or fail on)
    // a real CLAUDE_PLUGIN_DATA inherited from the host session.
    env: { ...env, CLAUDE_PLUGIN_DATA: path.join(cwd, "plugin-data") },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false
  });
  let nextId = 1;
  let buffer = "";
  const pending = new Map();
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        break;
      }
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) {
        continue;
      }
      const message = JSON.parse(line);
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        entry.resolve(message);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  function request(method, params = {}) {
    const id = nextId;
    nextId += 1;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}. stderr: ${stderr}`));
      }, 2000);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        }
      });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return promise;
  }

  function close() {
    child.kill("SIGTERM");
  }

  return { request, close };
}

function fakeAgyInvocation(response) {
  const text = response.result.content[0].text;
  const line = text.split("\n").find((entry) => entry.startsWith("FAKE_AGY:"));
  assert.ok(line, `expected fake AGY invocation in response: ${text}`);
  return JSON.parse(line.slice("FAKE_AGY:".length));
}

test("AGY MCP setup backstop outlives the requested smoke timeout", () => {
  assert.equal(setupBackstopMs({ smoke: true, timeout: "61s" }), 91_000);
  assert.equal(setupBackstopMs({ smoke: true }), 60_000);
  assert.equal(setupBackstopMs({ smoke: false, timeout: "61s" }), 60_000);
});

test("AGY MCP server exposes setup as a callable tool", async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-bin-"));
  writeFakeAgy(binDir);
  const client = createMcpClient({
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`
  });

  try {
    const init = await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" }
    });
    assert.equal(init.result.serverInfo.name, "agy");

    const tools = await client.request("tools/list");
    assert.ok(tools.result.tools.some((tool) => tool.name === "agy_setup"));

    const setup = await client.request("tools/call", {
      name: "agy_setup",
      arguments: {}
    });
    assert.match(setup.result.content[0].text, /AGY ready: yes/);
  } finally {
    client.close();
  }
});

test("AGY MCP rescue does not expose dangerous sandbox bypass flags", async () => {
  const client = createMcpClient(process.env);

  try {
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" }
    });

    const tools = await client.request("tools/list");
    const rescue = tools.result.tools.find((tool) => tool.name === "agy_rescue");
    assert.ok(rescue);
    assert.ok(!Object.hasOwn(rescue.inputSchema.properties, "noSandbox"));
    assert.ok(!Object.hasOwn(rescue.inputSchema.properties, "dangerouslySkipPermissions"));

    const rejected = await client.request("tools/call", {
      name: "agy_rescue",
      arguments: { task: "inspect safely", dangerouslySkipPermissions: true }
    });
    assert.match(rejected.error.message, /unknown argument: dangerouslySkipPermissions/);
  } finally {
    client.close();
  }
});

test("AGY MCP keeps flag-shaped rescue tasks and review focus as prompt text", async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-bin-"));
  writeFakeAgy(binDir);
  const client = createMcpClient({
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`
  });
  const flagShapedText = "--no-sandbox --dangerously-skip-permissions inspect";

  try {
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" }
    });

    const calls = [
      { name: "agy_rescue", arguments: { task: flagShapedText } },
      { name: "agy_review", arguments: { focus: flagShapedText } }
    ];

    for (const tool of calls) {
      const response = await client.request("tools/call", tool);
      const invocation = fakeAgyInvocation(response);

      assert.ok(invocation.argv.includes("--sandbox"), `${tool.name} should keep sandboxing enabled`);
      assert.ok(!invocation.argv.includes("--no-sandbox"), `${tool.name} must not inject --no-sandbox`);
      // Sandboxed headless runs skip permission prompts by policy (exactly
      // once); the flag-shaped user text must stay wholly on stdin.
      assert.equal(
        invocation.argv.filter((arg) => arg === "--dangerously-skip-permissions").length,
        1,
        `${tool.name} should apply the sandboxed permission policy exactly once`
      );
      assert.match(invocation.stdin, /--no-sandbox --dangerously-skip-permissions inspect/);
    }
  } finally {
    client.close();
  }
});

test("AGY MCP setup can run print-mode smoke check", async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-bin-"));
  writeFakeAgy(binDir);
  const client = createMcpClient({
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`
  });

  try {
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" }
    });

    const tools = await client.request("tools/list");
    const setup = tools.result.tools.find((tool) => tool.name === "agy_setup");
    assert.ok(setup);
    assert.ok(Object.hasOwn(setup.inputSchema.properties, "smoke"));
    assert.ok(Object.hasOwn(setup.inputSchema.properties, "timeout"));

    const result = await client.request("tools/call", {
      name: "agy_setup",
      arguments: { smoke: true, timeout: "300ms" }
    });
    assert.match(result.result.content[0].text, /print smoke: pass/i);
  } finally {
    client.close();
  }
});
