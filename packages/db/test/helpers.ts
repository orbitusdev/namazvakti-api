import { createDb, migrate, type Db } from '../src/client'

export async function createTestDb(): Promise<Db> {
  const db = createDb('pglite:memory')
  await migrate(db)
  return db
}
