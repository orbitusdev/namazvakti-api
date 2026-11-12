import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from './src/server/rate-limit'

// Per-instance limiter; see rate-limit.ts.
const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 })

export function middleware(req: NextRequest) {
  // Trusts the first x-forwarded-for entry (fine behind Vercel or a trusted proxy); requests
  // without the header all share the single 'anon' bucket.
  const key = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon'
  if (!limiter.check(key, Date.now())) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'Too many requests' } },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
    )
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/v1/:path*' }
