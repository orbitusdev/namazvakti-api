import { addDays, isIsoDate, todayIn } from '@namazvakti/core'
import { ApiError } from '../errors'
import type { Context } from '../context'
import { CACHE_PUBLIC, CACHE_PUBLIC_SHORT, ok, toErrorResult, type HandlerResult } from '../http'
import { toCityResponse } from './city'

const DEFAULT_DAYS = 30

function parseDays(raw: string | null): number {
  if (raw === null) return DEFAULT_DAYS
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(n) || n < 1 || n > 60) {
    throw new ApiError(400, 'invalid_request', 'Query parameter "days" must be an integer between 1 and 60')
  }
  return n
}

export async function getPrayerTimes(ctx: Context, cityId: string, url: URL, now: Date): Promise<HandlerResult> {
  try {
    const days = parseDays(url.searchParams.get('days'))
    const fromParam = url.searchParams.get('from')
    if (fromParam !== null && !isIsoDate(fromParam)) {
      throw new ApiError(400, 'invalid_request', 'Query parameter "from" must be a valid date (YYYY-MM-DD)')
    }
    // The city timezone defines "today", so the city is resolved before range-checking `from`.
    const city = await ctx.repo.getCity(cityId)
    if (!city) throw new ApiError(404, 'not_found', 'City not found')
    const today = todayIn(city.timezone, now)
    const min = addDays(today, -1)
    const max = addDays(today, 365)
    const from = fromParam ?? today
    if (from < min || from > max) {
      throw new ApiError(400, 'invalid_request', `Query parameter "from" must be between ${min} and ${max}`)
    }
    const res = await ctx.prayerTimes.getRange(cityId, from, days, now)
    return ok(
      { city: toCityResponse(res.city), timezone: res.city.timezone, source: res.source, days: res.days },
      // Today-relative or truncated responses must not be cached for a day.
      fromParam === null || res.days.length < days ? CACHE_PUBLIC_SHORT : CACHE_PUBLIC,
    )
  } catch (e) {
    return toErrorResult(e)
  }
}
