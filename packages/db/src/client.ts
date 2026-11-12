import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema'

/** Driver-agnostic Drizzle database (postgres-js or PGlite). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle')

/**
 * Accepts `postgres://` / `postgresql://` URLs (postgres-js),
 * `pglite:<dir>` (file-backed PGlite) and `pglite:memory` (in-memory PGlite).
 */
export function createDb(url: string): Db {
  if (url.startsWith('pglite:')) {
    const target = url.slice('pglite:'.length)
    const inMemory = target === 'memory' || target === ''
    // PGlite does not create missing parent directories.
    if (!inMemory) mkdirSync(dirname(resolve(target)), { recursive: true })
    const client = inMemory ? new PGlite() : new PGlite(target)
    return drizzlePglite({ client, schema }) as unknown as Db
  }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return drizzlePostgres(postgres(url), { schema }) as unknown as Db
  }
  throw new Error(`Unsupported database URL scheme: ${url.split(':')[0]}`)
}

/** Applies the generated migrations in `drizzle/` for either driver. */
export async function migrate(db: Db): Promise<void> {
  const opts = { migrationsFolder: MIGRATIONS_FOLDER }
  const $client = (db as unknown as { $client?: unknown }).$client
  if ($client instanceof PGlite) {
    await migratePglite(db as unknown as Parameters<typeof migratePglite>[0], opts)
  } else {
    await migratePostgres(db as unknown as Parameters<typeof migratePostgres>[0], opts)
  }
}
