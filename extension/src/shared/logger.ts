/**
 * Lightweight logger — respects a global toggle so we can silence noise in
 * production without deleting the calls.
 */
const DEBUG = true;

export const log = {
  info: (...args: unknown[]) => DEBUG && console.log("[LCA]", ...args),
  warn: (...args: unknown[]) => console.warn("[LCA]", ...args),
  error: (...args: unknown[]) => console.error("[LCA]", ...args),
};
