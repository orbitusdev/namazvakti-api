import { describe, expect, it } from 'vitest'
import { createRepo } from '@namazvakti/db'
import { createTestDb } from '@namazvakti/db/testing'
import { MockDiyanetSource } from '@namazvakti/diyanet-client'
import { syncPlaces } from '../src/server/place-sync'

describe('syncPlaces', () => {
  it('imports all places from the source and is idempotent', async () => {
    const repo = createRepo(await createTestDb())
    const source = new MockDiyanetSource()

    const first = await syncPlaces(repo, source)
    expect(first.countries).toBe(1)
    expect(first.states).toBe(81)
    expect(first.cities).toBeGreaterThanOrEqual(950)
    expect(first.cities).toBeLessThanOrEqual(1000)

    const second = await syncPlaces(repo, source)
    expect(second).toEqual(first)
    expect(await repo.listCountries()).toHaveLength(1)
    expect(await repo.listStates('tr')).toHaveLength(81)
    expect(await repo.getCity('tr-istanbul-sisli')).not.toBeNull()
  })
})
