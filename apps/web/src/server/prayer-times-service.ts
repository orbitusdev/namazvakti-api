import { sql } from 'drizzle-orm'
import { addDays, todayIn, type DayTimes } from '@namazvakti/core'
import { createRepo, type CityRow, type Db, type Repo } from '@namazvakti/db'
import { SourceUnavailableError, type DiyanetSource } from '@namazvakti/diyanet-client'
import { ApiError } from './errors'

type FetchWindow = { from: string; days: number }
/** Decides, against the current DB state, whether (and what) to fetch. */
type FetchPlan = (repo: Repo) => Promise<FetchWindow | null>
type FillResult = { fetched: boolean; error?: SourceUnavailableError }
/** Fill outcome inside the transaction; a DB write failure is carried out so the tx still commits its log. */
type LockedFillResult = FillResult & { writeError?: unknown }

export type PrayerTimesServiceOptions = {
  /** Days fetched from the source per fill. Default 365. */
  fetchAheadDays?: number
  /** `refillIfLow` fetches when stored coverage ends before today + this many days. Default 30. */
  refillBelowDays?: number
  /**
   * A city is not fetched again within this long after a successful fetch, even if days are
   * still missing (a source that serves only about a month can never cover every window). Default 0.
   */
  minRefetchMs?: number
  /** A city is not fetched again within this long after a failed fetch. Default 0. */
  failureBackoffMs?: number
}

/**
 * Serves prayer times from the database, filling gaps from the source on demand. Only days
 * written by the configured source count, so switching sources (mock → Diyanet) never serves
 * the old source's days under the new label.
 *
 * Fills are guarded twice: an in-memory single-flight map per city (same process) and a
 * Postgres transaction-scoped advisory lock per city (across instances). Coverage is
 * re-checked inside the lock, so a fill that another caller already completed is skipped.
 */
export class PrayerTimesService {
  private readonly repo: Repo
  private readonly fetchAheadDays: number
  private readonly refillBelowDays: number
  private readonly minRefetchMs: number
  private readonly failureBackoffMs: number
  private readonly inflight = new Map<string, Promise<FillResult>>()

  constructor(
    private readonly db: Db,
    private readonly source: DiyanetSource,
    opts: PrayerTimesServiceOptions = {},
  ) {
    this.repo = createRepo(db)
    this.fetchAheadDays = opts.fetchAheadDays ?? 365
    this.refillBelowDays = opts.refillBelowDays ?? 30
    this.minRefetchMs = opts.minRefetchMs ?? 0
    this.failureBackoffMs = opts.failureBackoffMs ?? 0
  }

  async getRange(
    cityId: string,
    from: string,
    days: number,
    now: Date,
  ): Promise<{ city: CityRow; days: DayTimes[]; source: 'mock' | 'diyanet' }> {
    const city = await this.repo.getCity(cityId)
    if (!city) throw new ApiError(404, 'not_found', `Unknown city: ${cityId}`)
    await this.repo.touchDemand(cityId, now)

    let stored = await this.repo.getPrayerDays(cityId, from, days, this.source.kind)
    if (stored.length < days) {
      const result = await this.fill(city, now, async (repo) => {
        const have = await repo.getPrayerDays(cityId, from, days, this.source.kind)
        return have.length < days ? { from, days: this.fetchAheadDays } : null
      })
      stored = await this.repo.getPrayerDays(cityId, from, days, this.source.kind)
      if (stored.length < days) {
        // Source failed or returned less than asked: never serve a gap, only the run starting at `from`.
        const served = contiguousFrom(stored, from)
        if (served.length === 0) {
          const message = result.error ? 'Prayer time source is unavailable' : `No prayer times available for ${from}`
          throw new ApiError(503, 'upstream_unavailable', message)
        }
        return { city, days: served, source: this.source.kind }
      }
    }
    return { city, days: stored, source: this.source.kind }
  }

  /** Extends stored coverage when it ends before today + `refillBelowDays`. Returns true if it fetched. */
  async refillIfLow(cityId: string, now: Date): Promise<boolean> {
    const city = await this.repo.getCity(cityId)
    if (!city) return false
    const today = todayIn(city.timezone, now)
    const threshold = addDays(today, this.refillBelowDays)
    const result = await this.fill(city, now, async (repo) => {
      const latest = await repo.getLatestPrayerDate(cityId, this.source.kind)
      if (latest !== null && latest >= threshold) return null
      // Never refetch the past: a stale city restarts at today.
      const next = latest ? addDays(latest, 1) : today
      return { from: next > today ? next : today, days: this.fetchAheadDays }
    })
    if (result.error) throw result.error
    return result.fetched
  }

  /**
   * Runs one fill per city at a time in this process. A caller that finds a fill already
   * in flight waits for it. If that fill hit a source failure, the waiter adopts the failure
   * (no extra source call during an outage); otherwise it runs its own plan, which usually
   * finds nothing to fetch.
   */
  private async fill(city: CityRow, now: Date, plan: FetchPlan): Promise<FillResult> {
    for (let pending = this.inflight.get(city.id); pending; pending = this.inflight.get(city.id)) {
      const settled = await pending.catch(() => undefined)
      if (settled?.error) return settled
    }
    const run = this.fillLocked(city, now, this.throttled(city.id, now, plan))
      .then(({ writeError, ...result }) => {
        if (writeError !== undefined) throw writeError
        return result
      })
      .finally(() => this.inflight.delete(city.id))
    this.inflight.set(city.id, run)
    return run
  }

  /** Wraps `plan` so a city fetched (or failed) too recently is not fetched again; checked inside the lock. */
  private throttled(cityId: string, now: Date, plan: FetchPlan): FetchPlan {
    if (this.minRefetchMs <= 0 && this.failureBackoffMs <= 0) return plan
    return async (repo) => {
      const window = await plan(repo)
      if (!window) return null
      const last = await repo.getLastSourceCall(this.source.kind, 'getPrayerTimes', cityId)
      if (last && now.getTime() - last.at.getTime() < (last.ok ? this.minRefetchMs : this.failureBackoffMs)) return null
      return window
    }
  }

  private fillLocked(city: CityRow, now: Date, plan: FetchPlan): Promise<LockedFillResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${city.id}))`)
      // All DB access inside the lock must go through `tx` (PGlite has a single connection).
      const repo = createRepo(tx as unknown as Db)
      const window = await plan(repo)
      if (!window) return { fetched: false }

      let fetched: DayTimes[]
      try {
        fetched = await this.source.getPrayerTimes(city, window.from, window.days)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await repo.logSourceCall({ kind: this.source.kind, operation: 'getPrayerTimes', param: city.id, ok: false, error: message, at: now })
        const error = e instanceof SourceUnavailableError ? e : new SourceUnavailableError(message, { cause: e })
        return { fetched: false, error }
      }
      await repo.logSourceCall({ kind: this.source.kind, operation: 'getPrayerTimes', param: city.id, ok: true, at: now })
      try {
        // Runs in a savepoint, so a failure here leaves the success log committable.
        await repo.upsertPrayerDays(city.id, this.source.kind, fetched)
      } catch (writeError) {
        return { fetched: false, writeError }
      }
      return { fetched: true }
    })
  }
}

/** The run of consecutive days in `stored` (sorted by date) that starts exactly at `from`. */
function contiguousFrom(stored: DayTimes[], from: string): DayTimes[] {
  const out: DayTimes[] = []
  let expected = from
  for (const day of stored) {
    if (day.date !== expected) break
    out.push(day)
    expected = addDays(expected, 1)
  }
  return out
}
