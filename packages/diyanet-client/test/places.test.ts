import { describe, expect, it } from 'vitest'
import { MockDiyanetSource } from '../src/index'

describe('MockDiyanetSource places', () => {
  const source = new MockDiyanetSource()

  it('reports kind mock', () => {
    expect(source.kind).toBe('mock')
  })

  it('lists Türkiye as the only country', async () => {
    expect(await source.getCountries()).toEqual([{ id: 'tr', name: 'Türkiye', diyanetId: null }])
  })

  it('lists 81 provinces including İstanbul', async () => {
    const states = await source.getStates('tr')
    expect(states).toHaveLength(81)
    expect(states).toContainEqual({
      id: 'tr-istanbul',
      countryId: 'tr',
      name: 'İstanbul',
      diyanetId: null,
    })
  })

  it('returns no states for an unknown country', async () => {
    expect(await source.getStates('xx')).toEqual([])
  })

  it('has 950-1000 cities with unique ids inside Turkey bounds', async () => {
    const states = await source.getStates('tr')
    const cities = (await Promise.all(states.map((s) => source.getCities(s.id)))).flat()
    expect(cities.length).toBeGreaterThanOrEqual(950)
    expect(cities.length).toBeLessThanOrEqual(1000)
    expect(new Set(cities.map((c) => c.id)).size).toBe(cities.length)
    for (const c of cities) {
      expect(c.lat).toBeGreaterThanOrEqual(35.8)
      expect(c.lat).toBeLessThanOrEqual(42.2)
      expect(c.lng).toBeGreaterThanOrEqual(25.6)
      expect(c.lng).toBeLessThanOrEqual(44.9)
    }
  })

  it('returns Kadıköy among the İstanbul cities', async () => {
    const cities = await source.getCities('tr-istanbul')
    const kadikoy = cities.find((c) => c.id === 'tr-istanbul-kadikoy')
    expect(kadikoy).toMatchObject({
      stateId: 'tr-istanbul',
      name: 'Kadıköy',
      timezone: 'Europe/Istanbul',
      diyanetId: null,
    })
    expect(kadikoy!.lat).toBeGreaterThan(40.9)
    expect(kadikoy!.lat).toBeLessThan(41.05)
  })

  it('names the central district of a non-metropolitan province Merkez', async () => {
    const cities = await source.getCities('tr-afyonkarahisar')
    expect(cities.find((c) => c.id === 'tr-afyonkarahisar-merkez')?.name).toBe('Merkez')
  })

  it('returns no cities for an unknown state', async () => {
    expect(await source.getCities('tr-nowhere')).toEqual([])
  })

  it('gives districts their own coordinates instead of the province centre', async () => {
    const states = await source.getStates('tr')
    let sharing = 0
    for (const state of states) {
      const cities = await source.getCities(state.id)
      const counts = new Map<string, number>()
      for (const c of cities) {
        const k = `${c.lat},${c.lng}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      // The province centre is the "Merkez" district's point; any other district (or any district of a
      // metropolitan province) that duplicates a sibling's point is a province-centre fallback.
      for (const n of counts.values()) if (n > 1) sharing += n
    }
    expect(sharing).toBeLessThanOrEqual(10)
  })
})
