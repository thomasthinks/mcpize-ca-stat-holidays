/**
 * Freemium enforcement: in-memory per-day usage tracking.
 * Free tier: FREE_DAILY_LIMIT calls/day (default 100). Pro: unlimited (enforced
 * by the mcpize platform at subscription time; this is a coarse local guard).
 */

const usage = new Map<string, number>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // UTC day
}

export function getFreeDailyLimit(): number {
  const raw = process.env.FREE_DAILY_LIMIT;
  const n = raw ? parseInt(raw, 10) : 100;
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function quotaExceededMessage(limit: number): string {
  return `Free quota exceeded (${limit}/day). Subscribe to Pro for unlimited access.`;
}

/**
 * Returns null when the call is allowed (and counts it), or an error message
 * when the free daily quota is exhausted.
 */
export function checkQuota(): string | null {
  const limit = getFreeDailyLimit();
  const key = todayKey();

  // Prune old days so the map stays tiny.
  if (usage.size > 3) {
    for (const k of usage.keys()) {
      if (k !== key) usage.delete(k);
    }
  }

  const used = usage.get(key) ?? 0;
  if (used >= limit) return quotaExceededMessage(limit);
  usage.set(key, used + 1);
  return null;
}
