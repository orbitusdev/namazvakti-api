import { createDb, createRepo, type Db, type Repo } from '@namazvakti/db'
import { EzanVaktiSource, MockDiyanetSource, type DiyanetSource } from '@namazvakti/diyanet-client'
import { createPlaceCache, type PlaceCache } from './place-cache'
import { PrayerTimesService, type PrayerTimesServiceOptions } from './prayer-times-service'

export type Context = { repo: Repo; placeCache: PlaceCache; source: DiyanetSource; prayerTimes: PrayerTimesService }

export const DEFAULT_DATABASE_URL = 'pglite:./.data/pglite'

/**
 * Builds the configured place/prayer-time source from `DIYANET_SOURCE`:
 * `mock` (default, computed times) or `ezanvakti` (Diyanet times via the Ezan Vakti API,
 * base URL overridable with `EZANVAKTI_BASE_URL`).
 */
export function createSourceFromEnv(env: NodeJS.ProcessEnv = process.env): DiyanetSource {
  const kind = env.DIYANET_SOURCE || 'mock'
  if (kind === 'mock') return new MockDiyanetSource()
  if (kind === 'ezanvakti') return new EzanVaktiSource({ baseUrl: env.EZANVAKTI_BASE_URL || undefined })
  throw new Error(`Unsupported DIYANET_SOURCE "${kind}": use "mock" or "ezanvakti"`)
}

const HOUR = 3_600_000

/**
 * Fetch policy per source. The Ezan Vakti API is rate-limited and serves about one month per
 * district, so a district is fetched at most every 12 hours (30 minutes after a failure) and the
 * nightly cron tops it up only when fewer than 7 days are left; a month then costs one or two
 * requests per district in demand.
 */
export function serviceOptionsFor(source: DiyanetSource): PrayerTimesServiceOptions {
  if (source instanceof EzanVaktiSource) return { refillBelowDays: 7, minRefetchMs: 12 * HOUR, failureBackoffMs: HOUR / 2 }
  return {}
}

export function createDbFromEnv(env: NodeJS.ProcessEnv = process.env): Db {
  return createDb(env.DATABASE_URL || DEFAULT_DATABASE_URL)
}

type GlobalWithCtx = { __namazvaktiCtx?: Context }

function buildContext(): Context {
  const db = createDbFromEnv()
  const source = createSourceFromEnv()
  const repo = createRepo(db)
  return { repo, placeCache: createPlaceCache(repo), source, prayerTimes: new PrayerTimesService(db, source, serviceOptionsFor(source)) }
}

/**
 * Process-wide singleton built from the environment. Stored on globalThis so dev HMR or
 * separate bundles never open a second PGlite on the same directory.
 */
export function getContext(): Context {
  const g = globalThis as unknown as GlobalWithCtx
  // A context cached by an older dev bundle may lack newer members; rebuild it then.
  if (!g.__namazvaktiCtx?.placeCache) g.__namazvaktiCtx = buildContext()
  return g.__namazvaktiCtx
}
