import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRepo, type Repo } from '@namazvakti/db'
import { createTestDb } from '@namazvakti/db/testing'
import { MockDiyanetSource } from '@namazvakti/diyanet-client'
import { ApiError } from '../src/server/errors'
import { createPlaceCache, type PlaceCache } from '../src/server/place-cache'
import { locateCity } from '../src/server/locate'
import { syncPlaces } from '../src/server/place-sync'

describe('locateCity', () => {
  let repo: Repo
  let cache: PlaceCache
  beforeAll(async () => {
    repo = createRepo(await createTestDb())
    await syncPlaces(repo, new MockDiyanetSource())
    cache = createPlaceCache(repo)
  })

  it('matches state and district names', async () => {
    const r = await locateCity(cache, { lat: 40.99, lng: 29.03, state: 'İSTANBUL', city: 'Kadıköy' })
    expect(r.id).toBe('tr-istanbul-kadikoy')
  })
  it('is case and diacritic insensitive', async () => {
    const r = await locateCity(cache, { lat: 41.06, lng: 28.99, state: 'Istanbul', city: 'SISLI' })
    expect(r.id).toBe('tr-istanbul-sisli')
  })
  it('maps Merkez to the central district', async () => {
    const r = await locateCity(cache, { lat: 38.76, lng: 30.54, state: 'Afyonkarahisar', city: 'Merkez' })
    expect(r.id).toBe('tr-afyonkarahisar-merkez')
  })
  it('falls back to nearest city in the state for unknown names', async () => {
    const r = await locateCity(cache, { lat: 40.99, lng: 29.03, state: 'İstanbul', city: 'Bilinmeyen' })
    expect(r.id).toBe('tr-istanbul-kadikoy')
  })
  it('uses coordinates only', async () => {
    const r = await locateCity(cache, { lat: 39.92, lng: 32.85 })
    expect(r.state.id).toBe('tr-ankara')
  })
  it('rejects far-away locations', async () => {
    await expect(locateCity(cache, { lat: 52.52, lng: 13.4 })).rejects.toMatchObject({ code: 'out_of_coverage' })
    await expect(locateCity(cache, { lat: 52.52, lng: 13.4 })).rejects.toBeInstanceOf(ApiError)
  })
  it('strips an administrative suffix from the state name', async () => {
    const a = await locateCity(cache, { lat: 52.52, lng: 13.4, state: 'Istanbul Province', city: 'Şişli' })
    expect(a.id).toBe('tr-istanbul-sisli')
    const b = await locateCity(cache, { lat: 52.52, lng: 13.4, state: 'İstanbul İli', city: 'Şişli' })
    expect(b.id).toBe('tr-istanbul-sisli')
  })
  it('handles state and city with the same name', async () => {
    const r = await locateCity(cache, { lat: 39.92, lng: 32.85, state: 'Ankara', city: 'Ankara' })
    expect(r.id).toBe('tr-ankara-cankaya')
  })
  it('falls back to proximity for a neighbourhood name', async () => {
    const r = await locateCity(cache, { lat: 40.99, lng: 29.03, state: 'İstanbul', city: 'Moda' })
    expect(r.id).toBe('tr-istanbul-kadikoy')
  })
  it('returns a district of the matched state even when coordinates are far away', async () => {
    const r = await locateCity(cache, { lat: 52.52, lng: 13.4, state: 'Afyonkarahisar' })
    expect(r.state.id).toBe('tr-afyonkarahisar')
  })

  describe('place cache', () => {
    const q = { lat: 40.99, lng: 29.03, state: 'İstanbul', city: 'Kadıköy' }
    beforeEach(() => {
      cache = createPlaceCache(repo)
    })
    const spies = () => [
      vi.spyOn(repo, 'findStatesByNormalizedName'),
      vi.spyOn(repo, 'findCitiesInState'),
      vi.spyOn(repo, 'getAllCitiesWithCoords'),
    ]
    const reads = (s: ReturnType<typeof spies>) => s.reduce((n, x) => n + x.mock.calls.length, 0)

    it('hits the repo once for repeated and varied calls', async () => {
      const s = spies()
      await locateCity(cache, q)
      expect(reads(s)).toBe(1)
      await locateCity(cache, q)
      await locateCity(cache, { lat: 39.92, lng: 32.85, state: 'whatever-1' })
      await locateCity(cache, { lat: 39.92, lng: 32.85, state: 'whatever-2' })
      expect(reads(s)).toBe(1)
    })

    it('does not cache a rejected read', async () => {
      const spy = vi.spyOn(repo, 'getAllCitiesWithCoords').mockRejectedValueOnce(new Error('db down'))
      await expect(locateCity(cache, q)).rejects.toThrow('db down')
      expect((await locateCity(cache, q)).id).toBe('tr-istanbul-kadikoy')
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('reads the repo again after invalidate()', async () => {
      const s = spies()
      await locateCity(cache, q)
      const first = reads(s)
      cache.invalidate()
      await locateCity(cache, q)
      expect(reads(s)).toBe(first * 2)
    })
  })
})
