import type { DayTimes } from '@namazvakti/core'

export type SourceCountry = { id: string; name: string; diyanetId: number | null }
export type SourceState = { id: string; countryId: string; name: string; diyanetId: number | null }
export type SourceCity = {
  id: string
  stateId: string
  name: string
  lat: number
  lng: number
  timezone: string
  diyanetId: number | null
}

export interface DiyanetSource {
  readonly kind: 'mock' | 'diyanet'
  getCountries(): Promise<SourceCountry[]>
  getStates(countryId: string): Promise<SourceState[]>
  getCities(stateId: string): Promise<SourceCity[]>
  /** Prayer times for `days` consecutive days starting at `from` (YYYY-MM-DD). */
  getPrayerTimes(city: SourceCity, from: string, days: number): Promise<DayTimes[]>
}

/** Thrown when the upstream data source cannot be reached or answers with an error. */
export class SourceUnavailableError extends Error {
  constructor(message = 'Prayer time source unavailable', options?: ErrorOptions) {
    super(message, options)
    this.name = 'SourceUnavailableError'
  }
}
