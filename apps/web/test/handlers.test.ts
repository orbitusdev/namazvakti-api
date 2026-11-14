import { beforeAll, describe, expect, it, vi } from 'vitest'
import { validateResponse } from '@namazvakti/api-contract'
import { createRepo } from '@namazvakti/db'
import { createTestDb } from '@namazvakti/db/testing'
import { EzanVaktiSource, MockDiyanetSource } from '@namazvakti/diyanet-client'
import { createPlaceCache } from '../src/server/place-cache'
import type { Context } from '../src/server/context'
import { listCities, listCountries, listStates } from '../src/server/handlers/places'
import { locate } from '../src/server/handlers/locate'
import { getAbout } from '../src/server/handlers/about'
import { listAnnouncements } from '../src/server/handlers/announcements'
import { getPrayerTimes } from '../src/server/handlers/prayer-times'
import { syncPlaces } from '../src/server/place-sync'
import { PrayerTimesService } from '../src/server/prayer-times-service'
import { toResponse, withContext, type HandlerResult } from '../src/server/http'

const CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800'
const CACHE_SHORT = 'public, s-maxage=600, stale-while-revalidate=3600'
const NOW = new Date('2026-11-11T21:30:00Z')
const url = (qs = '') => new URL(`http://localhost/x${qs}`)

let ctx: Context

function check(op: string, r: HandlerResult) {
  const v = validateResponse(op, r.status, r.body)
  expect(v, JSON.stringify(r.body)).toEqual({ ok: true })
}

beforeAll(async () => {
  const db = await createTestDb()
  const repo = createRepo(db)
  const source = new MockDiyanetSource()
  await syncPlaces(repo, source)
  ctx = { repo, placeCache: createPlaceCache(repo), source, prayerTimes: new PrayerTimesService(db, source) }
})

describe('places handlers', () => {
  it('lists countries', async () => {
    const r = await listCountries(ctx)
    expect(r.status).toBe(200)
    expect(r.headers['Cache-Control']).toBe(CACHE)
    check('listCountries', r)
  })

  it('lists 81 states of tr and 404s unknown country', async () => {
    const r = await listStates(ctx, 'tr')
    expect(r.status).toBe(200)
    expect((r.body as { states: unknown[] }).states).toHaveLength(81)
    expect(r.headers['Cache-Control']).toBe(CACHE)
    check('listStates', r)
    const nf = await listStates(ctx, 'xx')
    expect(nf.status).toBe(404)
    expect(nf.headers['Cache-Control']).toBe('no-store')
    check('listStates', nf)
  })

  it('lists cities and 404s unknown state', async () => {
    const r = await listCities(ctx, 'tr-istanbul')
    expect(r.status).toBe(200)
    check('listCities', r)
    const nf = await listCities(ctx, 'nope')
    expect(nf.status).toBe(404)
    check('listCities', nf)
  })
})

describe('getPrayerTimes', () => {
  it('defaults from to today in the city timezone and days to 30', async () => {
    const r = await getPrayerTimes(ctx, 'tr-istanbul-kadikoy', url(), NOW)
    expect(r.status).toBe(200)
    const body = r.body as { days: { date: string }[]; source: string; timezone: string }
    expect(body.days[0]!.date).toBe('2026-11-12')
    expect(body.days).toHaveLength(30)
    expect(body.source).toBe('mock')
    expect(body.timezone).toBe('Europe/Istanbul')
    expect(r.headers['Cache-Control']).toBe(CACHE_SHORT)
    check('getPrayerTimes', r)
  })

  it('honours from and days', async () => {
    const r = await getPrayerTimes(ctx, 'tr-istanbul-kadikoy', url('?from=2026-12-30&days=5'), NOW)
    expect((r.body as { days: { date: string }[] }).days.map((d) => d.date)).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ])
    expect(r.headers['Cache-Control']).toBe(CACHE)
  })

  it.each(['days=0', 'days=61', 'days=abc', 'days=1.5', 'days=', 'from=2026-13-01', 'from=nope'])(
    'rejects %s with 400',
    async (qs) => {
      const r = await getPrayerTimes(ctx, 'tr-istanbul-kadikoy', url(`?${qs}`), NOW)
      expect(r.status).toBe(400)
      expect((r.body as { error: { code: string } }).error.code).toBe('invalid_request')
      expect(r.headers['Cache-Control']).toBe('no-store')
      check('getPrayerTimes', r)
    },
  )

  it.each([['2026-11-11', 200], ['2026-11-13', 200], ['2027-11-12', 200]] as const)(
    'accepts from=%s (Istanbul today is 2026-11-12)',
    async (from, status) => {
      const r = await getPrayerTimes(ctx, 'tr-istanbul-kadikoy', url(`?from=${from}&days=1`), NOW)
      expect(r.status).toBe(status)
    },
  )

  it.each(['2026-11-10', '2027-11-13', '9999-12-20'])('rejects out-of-range from=%s with 400', async (from) => {
    const r = await getPrayerTimes(ctx, 'tr-istanbul-kadikoy', url(`?from=${from}&days=1`), NOW)
    expect(r.status).toBe(400)
    const err = (r.body as { error: { code: string; message: string } }).error
    expect(err.code).toBe('invalid_request')
    expect(err.message).toContain('2026-11-11')
    expect(err.message).toContain('2027-11-12')
    expect(r.headers['Cache-Control']).toBe('no-store')
    check('getPrayerTimes', r)
  })

  it('uses the short cache when fewer days than requested are returned', async () => {
    const city = await ctx.repo.getCity('tr-istanbul-kadikoy')
    const short = {
      ...ctx,
      prayerTimes: { getRange: async () => ({ city: city!, source: 'mock', days: [] }) },
    } as unknown as Context
    const r = await getPrayerTimes(short, 'tr-istanbul-kadikoy', url('?from=2026-12-01&days=3'), NOW)
    expect(r.status).toBe(200)
    expect(r.headers['Cache-Control']).toBe(CACHE_SHORT)
  })

  it('404s an unknown city', async () => {
    const r = await getPrayerTimes(ctx, 'tr-nowhere', url(), NOW)
    expect(r.status).toBe(404)
    check('getPrayerTimes', r)
  })

  it('maps unexpected errors to a logged 500', async () => {
    const boom = { ...ctx, prayerTimes: { getRange: async () => { throw new Error('db down') } } } as unknown as Context
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await getPrayerTimes(boom, 'tr-istanbul-kadikoy', url('?from=2026-11-11'), NOW)
    expect(r.status).toBe(500)
    expect(r.body).toEqual({ error: { code: 'internal', message: 'Internal server error' } })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    check('getPrayerTimes', r)
  })
})

describe('locate', () => {
  it('resolves Kadikoy by names', async () => {
    const r = await locate(ctx, url('?lat=40.99&lng=29.03&state=%C4%B0stanbul&city=Kad%C4%B1k%C3%B6y'))
    expect(r.status).toBe(200)
    expect((r.body as { city: { id: string } }).city.id).toBe('tr-istanbul-kadikoy')
    expect(r.headers['Cache-Control']).toBe('no-store')
    check('locate', r)
  })

  it.each(['?lat=91&lng=29', '?lat=40', '?lat=40&lng=', '?lat=abc&lng=29', '?lat=40&lng=181', '?lat=NaN&lng=29'])(
    'rejects %s with 400',
    async (qs) => {
      const r = await locate(ctx, url(qs))
      expect(r.status).toBe(400)
      expect(r.headers['Cache-Control']).toBe('no-store')
      check('locate', r)
    },
  )

  it('Berlin is out of coverage', async () => {
    const r = await locate(ctx, url('?lat=52.52&lng=13.4'))
    expect(r.status).toBe(404)
    expect((r.body as { error: { code: string } }).error.code).toBe('out_of_coverage')
    expect(r.headers['Cache-Control']).toBe('no-store')
    check('locate', r)
  })
})

describe('toResponse', () => {
  it('serialises status, headers and JSON body', async () => {
    const res = toResponse({ status: 200, body: { a: 1 }, headers: { 'Cache-Control': 'no-store' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(await res.json()).toEqual({ a: 1 })
  })
})

describe('withContext', () => {
  it('returns the JSON internal error when the context factory throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await withContext(
      () => { throw new Error('bad config') },
      async () => ({ status: 200, body: {}, headers: {} }),
    )
    expect(res.status).toBe(500)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: { code: 'internal', message: 'Internal server error' } })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('passes the context through on success', async () => {
    const res = await withContext(() => 5, async (n) => ({ status: 200, body: { n }, headers: {} }))
    expect(await res.json()).toEqual({ n: 5 })
  })
})

describe('about handler', () => {
  it('reports test data without a provider for the mock source', async () => {
    const r = await getAbout(ctx)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ source: 'mock' })
    expect(r.headers['Cache-Control']).toBe(CACHE_SHORT)
    check('getAbout', r)
  })

  it('credits the Ezan Vakti API for Diyanet data relayed through it', async () => {
    const r = await getAbout({ ...ctx, source: new EzanVaktiSource({ fetch: vi.fn() }) })
    expect(r.body).toEqual({ source: 'diyanet', provider: { name: 'Ezan Vakti API', url: 'https://ezanvakti.emushaf.net' } })
    check('getAbout', r)
  })
})

describe('announcements handler', () => {
  const tr = (s: string) => ({ tr: s, en: `${s} (en)` })
  beforeAll(async () => {
    await ctx.repo.insertAnnouncement({
      slug: 'welcome', title: tr('Hoş geldiniz'), body: tr('Yeni uygulama'), startsAt: new Date('2026-11-10T00:00:00Z'),
      linkUrl: 'https://namazvakti.app', linkTitle: tr('Siteye git'),
    })
    await ctx.repo.insertAnnouncement({
      slug: 'ended', title: tr('Bitti'), body: tr('Eski'), startsAt: new Date('2026-11-01T00:00:00Z'),
      endsAt: new Date('2026-11-05T00:00:00Z'), platforms: ['ios'],
    })
  })

  it('lists announcements for the platform with the contract shape', async () => {
    const r = await listAnnouncements(ctx, url('?platform=ios&build=12'), NOW)
    expect(r.status).toBe(200)
    expect(r.headers['Cache-Control']).toBe(CACHE_SHORT)
    expect(r.body).toEqual({
      announcements: [
        {
          id: 'welcome', title: tr('Hoş geldiniz'), body: tr('Yeni uygulama'),
          link: { url: 'https://namazvakti.app', title: tr('Siteye git') },
          startsAt: '2026-11-10T00:00:00Z', active: true,
        },
        { id: 'ended', title: tr('Bitti'), body: tr('Eski'), startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-05T00:00:00Z', active: false },
      ],
    })
    check('listAnnouncements', r)
  })

  it('filters by platform', async () => {
    const r = await listAnnouncements(ctx, url('?platform=macos'), NOW)
    expect((r.body as { announcements: { id: string }[] }).announcements.map((a) => a.id)).toEqual(['welcome'])
    check('listAnnouncements', r)
  })

  it('rejects a bad platform or build', async () => {
    for (const qs of ['', '?platform=android', '?platform=ios&build=x', '?platform=ios&build=-1']) {
      const r = await listAnnouncements(ctx, url(qs), NOW)
      expect(r.status, qs).toBe(400)
      check('listAnnouncements', r)
    }
  })
})
