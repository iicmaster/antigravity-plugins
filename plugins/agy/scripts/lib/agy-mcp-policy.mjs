import { goDurationToMilliseconds } from "./agy-runtime.mjs";

export const FAST_OP_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_GRACE_MS = 30_000;
const DEFAULT_SMOKE_TIMEOUT = "30s";

export function setupBackstopMs({ smoke = false, timeout = null } = {}) {
  if (!smoke) {
    return FAST_OP_TIMEOUT_MS;
  }
  const smokeTimeoutMs = goDurationToMilliseconds(timeout ?? DEFAULT_SMOKE_TIMEOUT);
  return Math.max(FAST_OP_TIMEOUT_MS, smokeTimeoutMs + RUN_TIMEOUT_GRACE_MS);
}
