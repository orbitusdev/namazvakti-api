import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dateRange } from '@namazvakti/core'
import { createRepo, sourceCalls, type Db, type Repo } from '@namazvakti/db'
import { createTestDb } from '@namazvakti/db/testing'
import { MockDiyanetSource, SourceUnavailableError, type SourceCity } from '@namazvakti/diyanet-client'
import { ApiError } from '../src/server/errors'
import { syncPlaces } from '../src/server/place-sync'
import { PrayerTimesService } from '../src/server/prayer-times-service'

const CITY = 'tr-istanbul-sisli'
// 2026-11-11 09:00 in Istanbul.
const NOW = new Date('2026-11-11T06:00:00Z')

describe('PrayerTimesService', () => {
  let db: Db
  let repo: Repo
  let source: MockDiyanetSource

  beforeEach(async () => {
    db = await createTestDb()
    repo = createRepo(db)
    source = new MockDiyanetSource()
    await syncPlaces(repo, source)
  })

  it('getRange returns contiguous days across year end', async () => {
    const svc = new PrayerTimesService(db, source)
    const res = await svc.getRange(CITY, '2026-12-20', 30, NOW)
    expect(res.days.map((d) => d.date)).toEqual(dateRange('2026-12-20', 30))
    expect(res.city.id).toBe(CITY)
    expect(res.source).toBe('mock')
  })

  it('second getRange for the same window does not call the source', async () => {
    const spy = vi.spyOn(source, 'getPrayerTimes')
    const svc = new PrayerTimesService(db, source)
    await svc.getRange(CITY, '2026-11-11', 30, NOW)
    await svc.getRange(CITY, '2026-11-11', 30, NOW)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('fetches fetchAheadDays from `from` and logs the source call', async () => {
    const spy = vi.spyOn(source, 'getPrayerTimes')
    const svc = new PrayerTimesService(db, source, { fetchAheadDays: 40 })
    await svc.getRange(CITY, '2026-11-11', 7, NOW)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: CITY }), '2026-11-11', 40)
    expect(await repo.getLatestPrayerDate(CITY)).toBe('2026-12-20')
    const calls = await db.select().from(sourceCalls)
    expect(calls).toEqual([expect.objectContaining({ kind: 'mock', operation: 'getPrayerTimes', param: CITY, ok: true })])
  })

  it('concurrent first requests trigger one fetch', async () => {
    const spy = vi.spyOn(source, 'getPrayerTimes')
    const svc = new PrayerTimesService(db, source)
    const results = await Promise.all(
      Array.from({ length: 5 }, () => svc.getRange(CITY, '2026-11-11', 30, NOW)),
    )
    expect(spy).toHaveBeenCalledTimes(1)
    for (const r of results) expect(r.days).toHaveLength(30)
  })

  it('serves partial coverage when source fails', async () => {
    const city = (await repo.getCity(CITY))!
    await repo.upsertPrayerDays(CITY, 'mock', await source.getPrayerTimes(city, '2026-11-11', 10))
    const failing = new MockDiyanetSource({ failWith: new SourceUnavailableError() })
    const svc = new PrayerTimesService(db, failing)
    const res = await svc.getRange(CITY, '2026-11-11', 30, NOW)
    expect(res.days.map((d) => d.date)).toEqual(dateRange('2026-11-11', 10))
    const calls = await db.select().from(sourceCalls)
    expect(calls).toEqual([expect.objectContaining({ operation: 'getPrayerTimes', param: CITY, ok: false })])
  })

  it('concurrent requests during an outage trigger one source call', async () => {
    const city = (await repo.getCity(CITY))!
    await repo.upsertPrayerDays(CITY, 'mock', await source.getPrayerTimes(city, '2026-11-11', 10))
    const failing = new MockDiyanetSource({ failWith: new SourceUnavailableError() })
    const spy = vi.spyOn(failing, 'getPrayerTimes')
    const svc = new PrayerTimesService(db, failing)
    const results = await Promise.all(
      Array.from({ length: 5 }, () => svc.getRange(CITY, '2026-11-11', 30, NOW)),
    )
    expect(spy).toHaveBeenCalledTimes(1)
    for (const r of results) expect(r.days.map((d) => d.date)).toEqual(dateRange('2026-11-11', 10))
  })

  it('never serves gaps when the source returns fewer days than requested', async () => {
    class GappySource extends MockDiyanetSource {
      override async getPrayerTimes(c: SourceCity, from: string, days: number) {
        const all = await super.getPrayerTimes(c, from, days)
        return all.filter((_, i) => i !== 5) // day 6 missing
      }
    }
    const svc = new PrayerTimesService(db, new GappySource())
    const res = await svc.getRange(CITY, '2026-11-11', 30, NOW)
    expect(res.days.map((d) => d.date)).toEqual(dateRange('2026-11-11', 5))
  })

  it('throws 503 when the source returns data that does not include `from`', async () => {
    class LateSource extends MockDiyanetSource {
      override async getPrayerTimes(c: SourceCity, from: string, days: number) {
        return (await super.getPrayerTimes(c, from, days)).slice(1)
      }
    }
    const svc = new PrayerTimesService(db, new LateSource())
    await expect(svc.getRange(CITY, '2026-11-11', 30, NOW)).rejects.toMatchObject({
      status: 503,
      code: 'upstream_unavailable',
    })
  })

  it('keeps the success log when storing fetched days fails', async () => {
    class BadDataSource extends MockDiyanetSource {
      override async getPrayerTimes(c: SourceCity, from: string, days: number) {
        const [first] = await super.getPrayerTimes(c, from, 1)
        return [{ ...first!, date: 'not-a-date' }]
      }
    }
    const svc = new PrayerTimesService(db, new BadDataSource())
    const err = await svc.getRange(CITY, '2026-11-11', 30, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ApiError)
    const calls = await db.select().from(sourceCalls)
    expect(calls).toEqual([expect.objectContaining({ operation: 'getPrayerTimes', param: CITY, ok: true })])
  })

  it('throws UpstreamUnavailable when nothing cached', async () => {
    const failing = new MockDiyanetSource({ failWith: new SourceUnavailableError() })
    const svc = new PrayerTimesService(db, failing)
    const err = await svc.getRange(CITY, '2026-11-11', 30, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 503, code: 'upstream_unavailable' })
    expect(await repo.listDemandedCities(new Date(NOW.getTime() - 1))).toEqual([CITY])
  })

  it('throws 503 when the day at `from` is missing even if later days are cached', async () => {
    const city = (await repo.getCity(CITY))!
    await repo.upsertPrayerDays(CITY, 'mock', await source.getPrayerTimes(city, '2026-11-12', 10))
    const failing = new MockDiyanetSource({ failWith: new SourceUnavailableError() })
    const svc = new PrayerTimesService(db, failing)
    await expect(svc.getRange(CITY, '2026-11-11', 30, NOW)).rejects.toMatchObject({ status: 503 })
  })

  it('unknown city → 404 not_found', async () => {
    const spy = vi.spyOn(source, 'getPrayerTimes')
    const svc = new PrayerTimesService(db, source)
    const err = await svc.getRange('nope', '2026-11-11', 30, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 404, code: 'not_found' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('touches demand on every call', async () => {
    const svc = new PrayerTimesService(db, source)
    await svc.getRange(CITY, '2026-11-11', 1, NOW)
    expect(await repo.listDemandedCities(new Date(NOW.getTime() - 1))).toEqual([CITY])
  })

  describe('refillIfLow', () => {
    it('returns true and fetches after the latest stored date when coverage is low', async () => {
      const city = (await repo.getCity(CITY))!
      await repo.upsertPrayerDays(CITY, 'mock', await source.getPrayerTimes(city, '2026-11-11', 10))
      const spy = vi.spyOn(source, 'getPrayerTimes')
      const svc = new PrayerTimesService(db, source, { fetchAheadDays: 20 })
      expect(await svc.refillIfLow(CITY, NOW)).toBe(true)
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: CITY }), '2026-11-21', 20)
      expect(await repo.getLatestPrayerDate(CITY)).toBe('2026-12-10')
    })

    it('restarts at today for a stale city whose coverage ended in the past', async () => {
      const city = (await repo.getCity(CITY))!
      await repo.upsertPrayerDays(CITY, 'mock', await source.getPrayerTimes(city, '2026-10-01', 10))
      const spy = vi.spyOn(source, 'getPrayerTimes')
      const svc = new PrayerTimesService(db, source, { fetchAheadDays: 5 })
      expect(await svc.refillIfLow(CITY, NOW)).toBe(true)
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: CITY }), '2026-11-11', 5)
    })

    it('fetches from today when nothing is stored', async () => {
      const spy = vi.spyOn(source, 'getPrayerTimes')
      const svc = new PrayerTimesService(db, source, { fetchAheadDays: 5 })
      expect(await svc.refillIfLow(CITY, NOW)).toBe(true)
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: CITY }), '2026-11-11', 5)
    })

    it('returns false when coverage reaches today + refillBelowDays', async () => {
      const city = (await repo.getCity(CITY))!
      await repo.upsertPrayerDays(CITY, 'mock', await source.getPrayerTimes(city, '2026-11-11', 31))
      const spy = vi.spyOn(source, 'getPrayerTimes')
      const svc = new PrayerTimesService(db, source)
      expect(await svc.refillIfLow(CITY, NOW)).toBe(false)
      expect(spy).not.toHaveBeenCalled()
    })

    it('returns false for an unknown city', async () => {
      const svc = new PrayerTimesService(db, source)
      expect(await svc.refillIfLow('nope', NOW)).toBe(false)
    })
  })
})
