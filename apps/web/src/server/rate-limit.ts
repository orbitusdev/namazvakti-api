// Dependency-free (runs in the Edge runtime). State is per instance.
export type RateLimiter = { check(key: string, now: number): boolean }

export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>()
  return {
    check(key, now) {
      // Opportunistic cleanup keeps the map bounded.
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (now - w.start >= opts.windowMs) windows.delete(k)
      }
      const w = windows.get(key)
      if (!w || now - w.start >= opts.windowMs) {
        windows.set(key, { start: now, count: 1 })
        return true
      }
      if (w.count >= opts.limit) return false
      w.count++
      return true
    },
  }
}
