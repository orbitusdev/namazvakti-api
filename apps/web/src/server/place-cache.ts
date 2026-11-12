import { normalizePlaceName, type PlaceRef } from '@namazvakti/core'
import type { CityRow, Repo } from '@namazvakti/db'

/**
 * Read-through, in-memory view of the place data `/locate` scans; cleared by `invalidate()` after a places sync.
 * Each server instance holds its own cache, which becomes fresh when the instance is recycled or
 * invalidated. That staleness is acceptable because places change rarely.
 */
export type PlaceCache = {
  cities(): Promise<CityRow[]>
  statesByNormalizedName(countryId: string, n: string): Promise<PlaceRef[]>
  citiesInState(stateId: string): Promise<CityRow[]>
  invalidate(): void
}

type Loaded = {
  all: CityRow[]
  statesByCountry: Map<string, Map<string, PlaceRef[]>>
  byState: Map<string, CityRow[]>
}

const tr = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'tr')

function index(all: CityRow[]): Loaded {
  const statesByCountry = new Map<string, Map<string, PlaceRef[]>>()
  const byState = new Map<string, CityRow[]>()
  const seen = new Set<string>()
  for (const c of all) {
    let cities = byState.get(c.state.id)
    if (!cities) byState.set(c.state.id, (cities = []))
    cities.push(c)
    if (seen.has(c.state.id)) continue
    seen.add(c.state.id)
    let names = statesByCountry.get(c.country.id)
    if (!names) statesByCountry.set(c.country.id, (names = new Map()))
    const n = normalizePlaceName(c.state.name)
    names.set(n, [...(names.get(n) ?? []), { id: c.state.id, name: c.state.name }])
  }
  for (const list of byState.values()) list.sort(tr)
  for (const names of statesByCountry.values()) for (const list of names.values()) list.sort(tr)
  return { all, statesByCountry, byState }
}

/** One repo read in total; every lookup is derived from that list, so the cache has a fixed set of keys. */
export function createPlaceCache(repo: Repo): PlaceCache {
  // The promise is cached (not the result) so concurrent requests share one read; a failed read is dropped.
  let loaded: Promise<Loaded> | null = null
  const load = (): Promise<Loaded> => {
    if (!loaded) {
      const p = repo.getAllCitiesWithCoords().then(index)
      loaded = p
      p.catch(() => {
        if (loaded === p) loaded = null
      })
    }
    return loaded
  }

  return {
    cities: async () => (await load()).all,
    statesByNormalizedName: async (countryId, n) => (await load()).statesByCountry.get(countryId)?.get(n) ?? [],
    citiesInState: async (stateId) => (await load()).byState.get(stateId) ?? [],
    invalidate() {
      loaded = null
    },
  }
}
