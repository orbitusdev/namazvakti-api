import type { CityRow } from '@namazvakti/db'

/** Maps a stored city to the contract's City shape (no extra fields). */
export function toCityResponse(c: CityRow) {
  return {
    id: c.id,
    name: c.name,
    state: { id: c.state.id, name: c.state.name },
    country: { id: c.country.id, name: c.country.name },
    timezone: c.timezone,
    lat: c.lat,
    lng: c.lng,
  }
}
