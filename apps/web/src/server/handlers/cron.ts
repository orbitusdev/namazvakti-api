import type { Context } from '../context'
import { NO_STORE, type HandlerResult } from '../http'
import { syncPlaces } from '../place-sync'

const DEMAND_WINDOW_DAYS = 30
const DAY_MS = 86_400_000

/**
 * Nightly maintenance: re-syncs places on Mondays (UTC) and tops up prayer times for cities
 * requested within the last 30 days. One failing city never stops the others.
 * Authorized with `Authorization: Bearer ${CRON_SECRET}`; an unset or empty secret always yields 401.
 */
export async function refresh(ctx: Context, authHeader: string | null, now: Date): Promise<HandlerResult> {
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    // Not part of the public contract, so this code is outside ErrorCode.
    return { status: 401, body: { error: { code: 'unauthorized', message: 'Unauthorized' } }, headers: { 'Cache-Control': NO_STORE } }
  }

  let placesSynced = false
  if (now.getUTCDay() === 1) {
    try {
      await syncPlaces(ctx.repo, ctx.source)
      placesSynced = true
    } catch (err) {
      console.error('cron places sync failed', err)
    } finally {
      ctx.placeCache.invalidate()
    }
  }

  const cityIds = await ctx.repo.listDemandedCities(new Date(now.getTime() - DEMAND_WINDOW_DAYS * DAY_MS))
  let refilled = 0
  let failed = 0
  for (const cityId of cityIds) {
    try {
      if (await ctx.prayerTimes.refillIfLow(cityId, now)) refilled++
    } catch (err) {
      failed++
      console.error(`cron refresh failed for ${cityId}`, err)
    }
  }

  return { status: 200, body: { refilled, failed, placesSynced }, headers: { 'Cache-Control': NO_STORE } }
}
