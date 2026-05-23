#!/usr/bin/env node

import process from "node:process";

import { runJobFile } from "./lib/agy-runtime.mjs";

const jobFile = process.argv[2];

if (!jobFile) {
  console.error("Usage: agy-worker.mjs <job-file>");
  process.exit(2);
}

try {
  const result = await runJobFile(jobFile);
  process.exit(result.status === "succeeded" ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
