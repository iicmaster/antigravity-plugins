import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MAX_UNTRACKED_FILES = 20;
const MAX_UNTRACKED_BYTES_PER_FILE = 20_000;
const MAX_UNTRACKED_TOTAL_BYTES = 100_000;

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function splitNulList(value) {
  return value.split("\0").filter(Boolean);
}

function isProbablyBinary(buffer) {
  return buffer.includes(0);
}

function safeUntrackedPath(cwd, relativePath) {
  const absolutePath = path.resolve(cwd, relativePath);
  const relativeFromCwd = path.relative(cwd, absolutePath);
  if (relativeFromCwd.startsWith("..") || path.isAbsolute(relativeFromCwd)) {
    return null;
  }
  return absolutePath;
}

function collectUntrackedFileContext(cwd) {
  const listed = runGit(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (!listed.ok) {
    return "## untracked file contents\n(unable to list untracked files)";
  }

  const files = splitNulList(listed.stdout).slice(0, MAX_UNTRACKED_FILES);
  if (files.length === 0) {
    return "## untracked file contents\n(no untracked files)";
  }

  let totalBytes = 0;
  const sections = ["## untracked file contents"];
  for (const relativePath of files) {
    const absolutePath = safeUntrackedPath(cwd, relativePath);
    if (!absolutePath) {
      sections.push(`### ${relativePath}`, "(skipped: path resolves outside workspace)");
      continue;
    }

    let stat;
    try {
      stat = fs.statSync(absolutePath);
    } catch (error) {
      sections.push(`### ${relativePath}`, `(skipped: ${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    if (!stat.isFile()) {
      sections.push(`### ${relativePath}`, "(skipped: not a regular file)");
      continue;
    }

    if (totalBytes >= MAX_UNTRACKED_TOTAL_BYTES) {
      sections.push(`### ${relativePath}`, "(skipped: untracked file context budget exhausted)");
      continue;
    }

    const readLimit = Math.min(stat.size, MAX_UNTRACKED_BYTES_PER_FILE, MAX_UNTRACKED_TOTAL_BYTES - totalBytes);
    const fd = fs.openSync(absolutePath, "r");
    try {
      const buffer = Buffer.alloc(readLimit);
      const bytesRead = fs.readSync(fd, buffer, 0, readLimit, 0);
      const contentBuffer = buffer.subarray(0, bytesRead);
      if (isProbablyBinary(contentBuffer)) {
        sections.push(`### ${relativePath}`, `(skipped: binary file, ${stat.size} bytes)`);
        continue;
      }

      totalBytes += bytesRead;
      const suffix = stat.size > bytesRead ? `\n\n(truncated after ${bytesRead} of ${stat.size} bytes)` : "";
      sections.push(`### ${relativePath}`, "```", `${contentBuffer.toString("utf8")}${suffix}`, "```");
    } finally {
      fs.closeSync(fd);
    }
  }

  const remaining = splitNulList(listed.stdout).length - files.length;
  if (remaining > 0) {
    sections.push(`(${remaining} additional untracked file(s) omitted)`);
  }

  return sections.join("\n");
}

export function collectGitReviewContext(cwd, options = {}) {
  const base = options.base ?? null;
  const isRepo = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (!isRepo.ok) {
    return {
      targetLabel: "workspace without git metadata",
      content: "This workspace is not a git repository. Ask the caller for explicit files or context before making review claims."
    };
  }

  const status = runGit(cwd, ["status", "--short", "--untracked-files=all"]);
  const diffArgs = base ? ["diff", `${base}...HEAD`] : ["diff", "--cached"];
  const stagedDiff = runGit(cwd, diffArgs);
  const unstagedDiff = base ? { stdout: "", stderr: "" } : runGit(cwd, ["diff"]);
  const untrackedFiles = base ? "" : collectUntrackedFileContext(cwd);

  return {
    targetLabel: base ? `branch diff ${base}...HEAD` : "working tree",
    content: [
      "## git status --short --untracked-files=all",
      status.stdout || "(clean)",
      "",
      base ? `## git diff ${base}...HEAD` : "## git diff --cached",
      stagedDiff.stdout || "(no diff)",
      "",
      base ? "" : "## git diff",
      base ? "" : unstagedDiff.stdout || "(no diff)",
      base ? "" : "",
      untrackedFiles
    ].filter(Boolean).join("\n")
  };
}
