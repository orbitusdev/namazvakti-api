import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../src/server/rate-limit'

describe('createRateLimiter', () => {
  it('allows 120 per window, blocks the 121st, resets after the window', () => {
    const rl = createRateLimiter({ limit: 120, windowMs: 60_000 })
    for (let i = 0; i < 120; i++) expect(rl.check('a', 1000)).toBe(true)
    expect(rl.check('a', 1000)).toBe(false)
    expect(rl.check('b', 1000)).toBe(true)
    expect(rl.check('a', 1000 + 60_000)).toBe(true)
  })
})
