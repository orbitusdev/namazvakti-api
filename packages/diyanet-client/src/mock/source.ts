import { dateRange, type DayTimes } from '@namazvakti/core'
import type { DiyanetSource, SourceCity, SourceCountry, SourceState } from '../source'
import { computeDay } from './prayer-times'
import { buildTurkeyPlaces, type PlaceIndex } from './places'

export class MockDiyanetSource implements DiyanetSource {
  readonly kind = 'mock' as const
  private readonly places: PlaceIndex = buildTurkeyPlaces()
  private readonly failWith?: Error

  constructor(opts: { failWith?: Error } = {}) {
    this.failWith = opts.failWith
  }

  private check(): void {
    if (this.failWith) throw this.failWith
  }

  async getCountries(): Promise<SourceCountry[]> {
    this.check()
    return [...this.places.countries]
  }

  async getStates(countryId: string): Promise<SourceState[]> {
    this.check()
    return [...(this.places.statesByCountry.get(countryId) ?? [])]
  }

  async getCities(stateId: string): Promise<SourceCity[]> {
    this.check()
    return [...(this.places.citiesByState.get(stateId) ?? [])]
  }

  async getPrayerTimes(city: SourceCity, from: string, days: number): Promise<DayTimes[]> {
    this.check()
    return dateRange(from, days).map((date) => computeDay(city, date))
  }
}
