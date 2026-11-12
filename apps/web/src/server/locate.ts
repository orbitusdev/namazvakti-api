import { normalizePlaceName } from '@namazvakti/core'
import type { CityRow } from '@namazvakti/db'
import { ApiError } from './errors'
import type { PlaceCache } from './place-cache'

export type LocateQuery = { lat: number; lng: number; country?: string; state?: string; city?: string }

const TURKEY_ID = 'tr'
const MAX_DISTANCE_KM = 100
// Administrative suffix geocoders may append to a province name (applied after normalization).
const STATE_SUFFIX = /\s+(province|ili|il)$/

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

function nearest(cities: CityRow[], lat: number, lng: number): { city: CityRow; km: number } | null {
  let best: { city: CityRow; km: number } | null = null
  for (const c of cities) {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number') continue
    const km = haversineKm(lat, lng, c.lat, c.lng)
    if (!best || km < best.km) best = { city: c, km }
  }
  return best
}

/** Resolves a device location (coordinates plus optional geocoded names) to a supported city. */
export async function locateCity(cache: PlaceCache, q: LocateQuery): Promise<CityRow> {
  if (q.state) {
    let stateN = normalizePlaceName(q.state)
    let state = (await cache.statesByNormalizedName(TURKEY_ID, stateN))[0]
    if (!state) {
      const stripped = stateN.replace(STATE_SUFFIX, '')
      if (stripped && stripped !== stateN) {
        stateN = stripped
        state = (await cache.statesByNormalizedName(TURKEY_ID, stateN))[0]
      }
    }
    if (state) {
      const inState = await cache.citiesInState(state.id)
      if (q.city) {
        const cityN = normalizePlaceName(q.city)
        const exact = inState.find((c) => normalizePlaceName(c.name) === cityN)
        if (exact) return exact
        if (cityN === 'merkez' || cityN === stateN) {
          const central =
            inState.find((c) => normalizePlaceName(c.name) === 'merkez') ??
            inState.find((c) => normalizePlaceName(c.name) === stateN)
          if (central) return central
        }
      }
      const near = nearest(inState, q.lat, q.lng)
      if (near) return near.city
    }
  }
  const near = nearest(await cache.cities(), q.lat, q.lng)
  if (!near || near.km > MAX_DISTANCE_KM) {
    throw new ApiError(404, 'out_of_coverage', 'Location is outside the supported area')
  }
  return near.city
}
