import { describe, expect, it, vi } from 'vitest'
import ids from '../data/tr-diyanet-ids.json'
import places from '../data/tr-places.json'
import { EzanVaktiSource } from '../src/ezanvakti/source'
import { parseVakitler } from '../src/ezanvakti/parse'
import { SourceUnavailableError, type SourceCity } from '../src/source'
import fixture from './fixtures/vakitler-9541.json'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })

async function city(source: EzanVaktiSource, stateId: string, id: string): Promise<SourceCity> {
  const c = (await source.getCities(stateId)).find((x) => x.id === id)
  if (!c) throw new Error(`${id} missing`)
  return c
}

describe('parseVakitler', () => {
  it('maps the API days to DayTimes with ISO Gregorian and Hijri dates', () => {
    const days = parseVakitler(fixture)
    expect(days).toHaveLength(3)
    expect(days[0]).toEqual({
      date: '2026-11-08',
      imsak: '06:09',
      gunes: '07:36',
      ogle: '12:53',
      ikindi: '15:34',
      aksam: '18:00',
      yatsi: '19:21',
      hijriDate: '1448-05-28',
    })
    expect(days.map((d) => d.date)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10'])
  })

  it('drops malformed days and tolerates non-arrays', () => {
    const good = fixture[0]!
    expect(parseVakitler([{ ...good, Ogle: '25:00' }, { ...good, MiladiTarihKisa: '2026-11-08' }, null, 3])).toEqual([])
    expect(parseVakitler({ detail: 'x' })).toEqual([])
    expect(parseVakitler([{ ...good, HicriTarihKisa: undefined }])[0]?.hijriDate).toBeNull()
  })
})

describe('district ids', () => {
  it('every district has a Diyanet id', () => {
    const map = ids as Record<string, { id: number }>
    const missing = (places as { il: string; ilce: string }[]).filter((p) => !Number.isInteger(map[`${p.il}/${p.ilce}`]?.id))
    expect(missing).toEqual([])
  })

  it('central districts of metropolitan provinces use the province entry', async () => {
    const s = new EzanVaktiSource({ fetch: vi.fn() })
    expect((await city(s, 'tr-ankara', 'tr-ankara-cankaya')).diyanetId).toBe(9206)
    expect((await city(s, 'tr-istanbul', 'tr-istanbul-fatih')).diyanetId).toBe(9541)
  })
})

describe('EzanVaktiSource', () => {
  it('reads places without any request', async () => {
    const fetch = vi.fn()
    const s = new EzanVaktiSource({ fetch })
    expect((await s.getCountries()).map((c) => c.id)).toEqual(['tr'])
    expect((await s.getStates('tr')).length).toBe(81)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches /vakitler once and keeps only the asked window', async () => {
    const fetch = vi.fn(async () => json(fixture))
    const s = new EzanVaktiSource({ fetch, baseUrl: 'https://x.test/' })
    const c = await city(s, 'tr-istanbul', 'tr-istanbul-fatih')
    const days = await s.getPrayerTimes(c, '2026-11-09', 365)
    expect(days.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10'])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://x.test/vakitler/9541', expect.anything())
    expect(await s.getPrayerTimes(c, '2026-11-08', 1)).toHaveLength(1)
  })

  it('retries a 429 once after a short Retry-After', async () => {
    const sleep = vi.fn(async () => {})
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '5' } }))
      .mockResolvedValueOnce(json(fixture))
    const s = new EzanVaktiSource({ fetch, sleep })
    const days = await s.getPrayerTimes(await city(s, 'tr-istanbul', 'tr-istanbul-fatih'), '2026-11-08', 30)
    expect(days).toHaveLength(3)
    expect(sleep).toHaveBeenCalledWith(5000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up on repeated or long 429s, HTTP errors and network failures', async () => {
    const c = await city(new EzanVaktiSource({ fetch: vi.fn() }), 'tr-istanbul', 'tr-istanbul-fatih')
    const tooMany = () => new Response('', { status: 429, headers: { 'retry-after': '5' } })
    const cases: (() => Promise<Response>)[] = [
      async () => tooMany(),
      async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }),
      async () => new Response('', { status: 502 }),
      async () => new Response('not json', { status: 200 }),
      async () => {
        throw new TypeError('fetch failed')
      },
    ]
    for (const impl of cases) {
      const fetch = vi.fn(impl)
      const s = new EzanVaktiSource({ fetch, sleep: async () => {} })
      await expect(s.getPrayerTimes(c, '2026-11-08', 30)).rejects.toBeInstanceOf(SourceUnavailableError)
      expect(fetch.mock.calls.length).toBeLessThanOrEqual(2)
    }
  })

  it('rejects a city without a Diyanet id without a request', async () => {
    const fetch = vi.fn()
    const s = new EzanVaktiSource({ fetch })
    const c = { ...(await city(s, 'tr-istanbul', 'tr-istanbul-fatih')), diyanetId: null }
    await expect(s.getPrayerTimes(c, '2026-11-08', 30)).rejects.toBeInstanceOf(SourceUnavailableError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
