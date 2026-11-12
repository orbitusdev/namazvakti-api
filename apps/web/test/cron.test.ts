import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRepo, type Repo } from '@namazvakti/db'
import { createTestDb } from '@namazvakti/db/testing'
import { MockDiyanetSource } from '@namazvakti/diyanet-client'
import { createPlaceCache } from '../src/server/place-cache'
import type { Context } from '../src/server/context'
import { refresh } from '../src/server/handlers/cron'
import { syncPlaces } from '../src/server/place-sync'
import { PrayerTimesService } from '../src/server/prayer-times-service'

const TUESDAY = new Date('2026-11-10T01:00:00Z')
const MONDAY = new Date('2026-11-09T01:00:00Z')
const DAY = 86_400_000
const CITY = 'tr-istanbul-kadikoy'
const AUTH = 'Bearer s3cret'

let ctx: Context
let repo: Repo
let seeded: PrayerTimesService

beforeEach(async () => {
  vi.stubEnv('CRON_SECRET', 's3cret')
  const db = await createTestDb()
  repo = createRepo(db)
  const source = new MockDiyanetSource()
  await syncPlaces(repo, source)
  ctx = { repo, placeCache: createPlaceCache(repo), source, prayerTimes: new PrayerTimesService(db, source) }
  seeded = new PrayerTimesService(db, source, { fetchAheadDays: 10 })
})
afterEach(() => vi.unstubAllEnvs())

describe('refresh', () => {
  it('rejects missing or wrong credentials', async () => {
    expect((await refresh(ctx, null, TUESDAY)).status).toBe(401)
    expect((await refresh(ctx, 'Bearer nope', TUESDAY)).status).toBe(401)
  })

  it('rejects everything when the secret is unset or empty', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await refresh(ctx, 'Bearer ', TUESDAY)).status).toBe(401)
    expect((await refresh(ctx, null, TUESDAY)).status).toBe(401)
    vi.stubEnv('CRON_SECRET', undefined as unknown as string)
    expect((await refresh(ctx, 'Bearer undefined', TUESDAY)).status).toBe(401)
  })

  it('refills a recently requested city with low coverage', async () => {
    await seeded.refillIfLow(CITY, TUESDAY)
    await repo.touchDemand(CITY, new Date(TUESDAY.getTime() - 5 * DAY))
    const r = await refresh(ctx, AUTH, TUESDAY)
    expect(r.status).toBe(200)
    expect(r.headers['Cache-Control']).toBe('no-store')
    expect(r.body).toEqual({ refilled: 1, failed: 0, placesSynced: false })
    const latest = await repo.getLatestPrayerDate(CITY)
    expect(latest! >= '2026-12-10').toBe(true)
  })

  it('skips cities not requested for 40 days', async () => {
    await seeded.refillIfLow(CITY, TUESDAY)
    await repo.touchDemand(CITY, new Date(TUESDAY.getTime() - 40 * DAY))
    const r = await refresh(ctx, AUTH, TUESDAY)
    expect(r.body).toEqual({ refilled: 0, failed: 0, placesSynced: false })
  })

  it('syncs places on Mondays (UTC)', async () => {
    const r = await refresh(ctx, AUTH, MONDAY)
    expect((r.body as { placesSynced: boolean }).placesSynced).toBe(true)
  })

  it('invalidates the place cache after a Monday places sync', async () => {
    const spy = vi.spyOn(ctx.placeCache, 'invalidate')
    await refresh(ctx, AUTH, TUESDAY)
    expect(spy).not.toHaveBeenCalled()
    await refresh(ctx, AUTH, MONDAY)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('counts failures and continues with other cities', async () => {
    await repo.touchDemand('tr-ankara-cankaya', TUESDAY)
    await repo.touchDemand(CITY, TUESDAY)
    const real = ctx.prayerTimes.refillIfLow.bind(ctx.prayerTimes)
    vi.spyOn(ctx.prayerTimes, 'refillIfLow').mockImplementation(async (id, now) => {
      if (id === 'tr-ankara-cankaya') throw new Error('boom')
      return real(id, now)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await refresh(ctx, AUTH, TUESDAY)
    expect(r.body).toEqual({ refilled: 1, failed: 1, placesSynced: false })
  })

  it('still refills when the Monday places sync fails', async () => {
    await seeded.refillIfLow(CITY, MONDAY)
    await repo.touchDemand(CITY, MONDAY)
    const failing = Object.create(ctx.source) as typeof ctx.source
    failing.getCountries = async () => {
      throw new Error('source down')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await refresh({ ...ctx, source: failing }, AUTH, MONDAY)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ refilled: 1, failed: 0, placesSynced: false })
  })
})
