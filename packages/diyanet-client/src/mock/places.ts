import { slugify } from '@namazvakti/core'
import raw from '../../data/tr-places.json'
import type { SourceCity, SourceCountry, SourceState } from '../source'

type RawPlace = { il: string; ilce: string; lat: number; lng: number }

const TR_COUNTRY: SourceCountry = { id: 'tr', name: 'Türkiye', diyanetId: null }
const TR_TIMEZONE = 'Europe/Istanbul'

export type PlaceIndex = {
  countries: SourceCountry[]
  statesByCountry: Map<string, SourceState[]>
  citiesByState: Map<string, SourceCity[]>
}

export function buildTurkeyPlaces(places: readonly RawPlace[] = raw as RawPlace[]): PlaceIndex {
  const states: SourceState[] = []
  const citiesByState = new Map<string, SourceCity[]>()
  for (const p of places) {
    const stateId = `tr-${slugify(p.il)}`
    let cities = citiesByState.get(stateId)
    if (!cities) {
      cities = []
      citiesByState.set(stateId, cities)
      states.push({ id: stateId, countryId: TR_COUNTRY.id, name: p.il, diyanetId: null })
    }
    cities.push({
      id: `${stateId}-${slugify(p.ilce)}`,
      stateId,
      name: p.ilce,
      lat: p.lat,
      lng: p.lng,
      timezone: TR_TIMEZONE,
      diyanetId: null,
    })
  }
  return {
    countries: [TR_COUNTRY],
    statesByCountry: new Map([[TR_COUNTRY.id, states]]),
    citiesByState,
  }
}
