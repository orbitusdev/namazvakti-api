import type { Repo } from '@namazvakti/db'
import type { DiyanetSource, SourceCity, SourceState } from '@namazvakti/diyanet-client'

/** Copies the full country → state → city tree from the source into the database. */
export async function syncPlaces(
  repo: Repo,
  source: DiyanetSource,
): Promise<{ countries: number; states: number; cities: number }> {
  const countries = await source.getCountries()
  const states: SourceState[] = []
  const cities: SourceCity[] = []
  for (const country of countries) {
    for (const state of await source.getStates(country.id)) {
      states.push(state)
      cities.push(...(await source.getCities(state.id)))
    }
  }
  await repo.upsertPlaces(countries, states, cities)
  return { countries: countries.length, states: states.length, cities: cities.length }
}
