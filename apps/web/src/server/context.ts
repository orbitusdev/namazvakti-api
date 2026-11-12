import { createDb, createRepo, type Db, type Repo } from '@namazvakti/db'
import { MockDiyanetSource, type DiyanetSource } from '@namazvakti/diyanet-client'
import { createPlaceCache, type PlaceCache } from './place-cache'
import { PrayerTimesService } from './prayer-times-service'

export type Context = { repo: Repo; placeCache: PlaceCache; source: DiyanetSource; prayerTimes: PrayerTimesService }

export const DEFAULT_DATABASE_URL = 'pglite:./.data/pglite'

/** Builds the configured place/prayer-time source (default and only option for now: mock). */
export function createSourceFromEnv(env: NodeJS.ProcessEnv = process.env): DiyanetSource {
  const kind = env.DIYANET_SOURCE || 'mock'
  if (kind === 'mock') return new MockDiyanetSource()
  throw new Error(`Unsupported DIYANET_SOURCE "${kind}": only "mock" is available`)
}

export function createDbFromEnv(env: NodeJS.ProcessEnv = process.env): Db {
  return createDb(env.DATABASE_URL || DEFAULT_DATABASE_URL)
}

type GlobalWithCtx = { __namazvaktiCtx?: Context }

function buildContext(): Context {
  const db = createDbFromEnv()
  const source = createSourceFromEnv()
  const repo = createRepo(db)
  return { repo, placeCache: createPlaceCache(repo), source, prayerTimes: new PrayerTimesService(db, source) }
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
