import { beforeEach, describe, expect, it } from 'vitest'
import type { DayTimes } from '@namazvakti/core'
import { createRepo, sourceCalls, type Db, type Repo } from '../src'
import { createTestDb } from './helpers'

const day = (date: string, ogle = '12:00'): DayTimes => ({
  date, hijriDate: null, imsak: '05:00', gunes: '06:30', ogle, ikindi: '15:00', aksam: '17:30', yatsi: '19:00',
})

describe('repo', () => {
  let repo: Repo
  let db: Db
  beforeEach(async () => {
    db = await createTestDb()
    repo = createRepo(db)
    await repo.upsertPlaces(
      [{ id: 'tr', name: 'Türkiye', diyanetId: 2 }],
      [{ id: 'tr-istanbul', countryId: 'tr', name: 'İstanbul', diyanetId: 539 }],
      [
        { id: 'tr-istanbul-sisli', stateId: 'tr-istanbul', name: 'Şişli', lat: 41.06, lng: 28.98, timezone: 'Europe/Istanbul', diyanetId: 1 },
        { id: 'tr-istanbul-cekmekoy', stateId: 'tr-istanbul', name: 'Çekmeköy', lat: 41.03, lng: 29.18, timezone: 'Europe/Istanbul', diyanetId: 2 },
      ],
    )
  })

  it('lists cities with Turkish collation', async () => {
    const list = await repo.listCities('tr-istanbul')
    expect(list?.map((c) => c.name)).toEqual(['Çekmeköy', 'Şişli'])
  })

  it('returns null for unknown parents', async () => {
    expect(await repo.listStates('xx')).toBeNull()
    expect(await repo.listCities('xx')).toBeNull()
  })

  it('getCity joins state and country', async () => {
    const c = await repo.getCity('tr-istanbul-sisli')
    expect(c?.state).toEqual({ id: 'tr-istanbul', name: 'İstanbul' })
    expect(c?.country.id).toBe('tr')
    expect(await repo.getCity('nope')).toBeNull()
  })

  it('upserts prayer days without duplicates; second write wins', async () => {
    await repo.upsertPrayerDays('tr-istanbul-sisli', 'mock', [day('2026-12-31')])
    await repo.upsertPrayerDays('tr-istanbul-sisli', 'mock', [day('2026-12-31', '12:05')])
    const got = await repo.getPrayerDays('tr-istanbul-sisli', '2026-12-31', 1)
    expect(got).toHaveLength(1)
    expect(got[0]?.ogle).toBe('12:05')
  })

  it('getPrayerDays returns only stored dates in the window, ordered', async () => {
    await repo.upsertPrayerDays('tr-istanbul-sisli', 'mock', [day('2027-01-02'), day('2026-12-31'), day('2027-01-05')])
    const got = await repo.getPrayerDays('tr-istanbul-sisli', '2026-12-31', 3)
    expect(got.map((d) => d.date)).toEqual(['2026-12-31', '2027-01-02'])
    expect(await repo.getLatestPrayerDate('tr-istanbul-sisli')).toBe('2027-01-05')
    expect(await repo.getLatestPrayerDate('tr-istanbul-cekmekoy')).toBeNull()
  })

  it('tracks demand and source calls', async () => {
    await repo.touchDemand('tr-istanbul-sisli', new Date('2026-01-01T00:00:00Z'))
    await repo.touchDemand('tr-istanbul-cekmekoy', new Date('2026-06-01T00:00:00Z'))
    expect(await repo.listDemandedCities(new Date('2026-03-01T00:00:00Z'))).toEqual(['tr-istanbul-cekmekoy'])
    await repo.logSourceCall({ kind: 'mock', operation: 'getCities', param: 'x', ok: false, error: 'boom' })
    const rows = await db.select().from(sourceCalls)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'mock', ok: false, error: 'boom' })
  })

  it('finds states by normalized name', async () => {
    const found = await repo.findStatesByNormalizedName('tr', 'istanbul')
    expect(found).toEqual([{ id: 'tr-istanbul', name: 'İstanbul' }])
    expect(await repo.findStatesByNormalizedName('tr', 'nowhere')).toEqual([])
  })

  it('findCitiesInState and getAllCitiesWithCoords return joined rows', async () => {
    const inState = await repo.findCitiesInState('tr-istanbul')
    expect(inState.map((c) => c.name)).toEqual(['Çekmeköy', 'Şişli'])
    expect(inState[0]).toMatchObject({ lat: 41.03, lng: 29.18, state: { id: 'tr-istanbul' }, country: { id: 'tr' } })
    expect(await repo.getAllCitiesWithCoords()).toHaveLength(2)
  })

  it('upsertPlaces is idempotent and updates names', async () => {
    await repo.upsertPlaces(
      [{ id: 'tr', name: 'Türkiye', diyanetId: 2 }],
      [{ id: 'tr-istanbul', countryId: 'tr', name: 'İstanbul', diyanetId: 539 }],
      [{ id: 'tr-istanbul-sisli', stateId: 'tr-istanbul', name: 'Şişli 2', lat: 41.06, lng: 28.98, timezone: 'Europe/Istanbul', diyanetId: 1 }],
    )
    expect(await repo.listCountries()).toHaveLength(1)
    expect(await repo.getAllCitiesWithCoords()).toHaveLength(2)
    expect((await repo.getCity('tr-istanbul-sisli'))?.name).toBe('Şişli 2')
  })

  it('round-trips hijriDate and handles more than one chunk', async () => {
    const many = Array.from({ length: 600 }, (_, i) => ({
      ...day(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)),
      hijriDate: i === 0 ? '12 Recep 1447' : null,
    }))
    await repo.upsertPrayerDays('tr-istanbul-sisli', 'diyanet', many)
    const got = await repo.getPrayerDays('tr-istanbul-sisli', '2026-01-01', 600)
    expect(got).toHaveLength(600)
    expect(got[0]?.hijriDate).toBe('12 Recep 1447')
    expect(got[1]?.hijriDate).toBeNull()
  })
})
