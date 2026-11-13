import { addDays, type DayTimes } from '@namazvakti/core'
import ids from '../../data/tr-diyanet-ids.json'
import { buildTurkeyPlaces, type DiyanetIds, type PlaceIndex } from '../mock/places'
import { SourceUnavailableError, type DiyanetSource, type SourceCity, type SourceCountry, type SourceState } from '../source'
import { parseVakitler } from './parse'

export const EZANVAKTI_BASE_URL = 'https://ezanvakti.emushaf.net'

export type EzanVaktiOptions = {
  baseUrl?: string
  fetch?: typeof fetch
  /** Per-request timeout. Default 10 s. */
  timeoutMs?: number
  /** A 429 is retried once when its Retry-After is at most this many seconds. Default 10. */
  maxRetryAfterSeconds?: number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Diyanet prayer times through the Ezan Vakti API (https://ezanvakti.emushaf.net), an unofficial
 * mirror of Diyanet's monthly tables. It is rate-limited (429 + Retry-After), so:
 * - places never touch the network: the place tree (with coordinates) is our own
 *   `tr-places.json`, and each district's Diyanet id comes from `tr-diyanet-ids.json`, built once
 *   by `scripts/build-diyanet-ids.mjs`;
 * - prayer times cost one request per district and return about a month (the API serves no
 *   other window), so callers store the result and refetch rarely.
 */
export class EzanVaktiSource implements DiyanetSource {
  readonly kind = 'diyanet' as const
  readonly provider = { name: 'Ezan Vakti API', url: EZANVAKTI_BASE_URL }
  private readonly places: PlaceIndex = buildTurkeyPlaces(undefined, ids as DiyanetIds)
  private readonly baseUrl: string
  private readonly fetch: typeof fetch
  private readonly timeoutMs: number
  private readonly maxRetryAfterSeconds: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(opts: EzanVaktiOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? EZANVAKTI_BASE_URL).replace(/\/+$/, '')
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = opts.timeoutMs ?? 10_000
    this.maxRetryAfterSeconds = opts.maxRetryAfterSeconds ?? 10
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  async getCountries(): Promise<SourceCountry[]> {
    return [...this.places.countries]
  }

  async getStates(countryId: string): Promise<SourceState[]> {
    return [...(this.places.statesByCountry.get(countryId) ?? [])]
  }

  async getCities(stateId: string): Promise<SourceCity[]> {
    return [...(this.places.citiesByState.get(stateId) ?? [])]
  }

  /** The days in [from, from + days) that the API has; usually fewer than asked (about a month). */
  async getPrayerTimes(city: SourceCity, from: string, days: number): Promise<DayTimes[]> {
    if (city.diyanetId === null) throw new SourceUnavailableError(`No Diyanet id for ${city.id}`)
    const body = await this.getJson(`/vakitler/${city.diyanetId}`)
    const end = addDays(from, days)
    return parseVakitler(body).filter((d) => d.date >= from && d.date < end)
  }

  private async getJson(path: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      let res: Response
      try {
        res = await this.fetch(this.baseUrl + path, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        })
      } catch (e) {
        throw new SourceUnavailableError(`Ezan Vakti API unreachable: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
      }
      if (res.status === 429 && attempt === 0) {
        const wait = Number(res.headers.get('retry-after'))
        if (Number.isFinite(wait) && wait >= 0 && wait <= this.maxRetryAfterSeconds) {
          await this.sleep(wait * 1000)
          continue
        }
      }
      if (!res.ok) throw new SourceUnavailableError(`Ezan Vakti API ${path}: HTTP ${res.status}`)
      try {
        return await res.json()
      } catch (e) {
        throw new SourceUnavailableError(`Ezan Vakti API ${path}: invalid JSON`, { cause: e })
      }
    }
  }
}
