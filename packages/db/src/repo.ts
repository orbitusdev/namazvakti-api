import { and, asc, eq, gte, lte, max, sql } from 'drizzle-orm'
import { normalizePlaceName, type DayTimes, type PlaceRef } from '@namazvakti/core'
import type { SourceCity, SourceCountry, SourceState } from '@namazvakti/diyanet-client'
import type { Db } from './client'
import { cities, cityDemand, countries, prayerTimes, sourceCalls, states } from './schema'

export type CityRow = SourceCity & { state: PlaceRef; country: PlaceRef }

export type SourceCallRecord = {
  kind: 'mock' | 'diyanet'
  operation: string
  param: string
  ok: boolean
  error?: string
}

const byName = (a: PlaceRef, b: PlaceRef) => a.name.localeCompare(b.name, 'tr')
const CHUNK = 500
function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK))
  return out
}
const ex = (c: { name: string }) => sql.raw(`excluded."${c.name}"`)
const ref = (r: { id: string; name: string }): PlaceRef => ({ id: r.id, name: r.name })

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function createRepo(db: Db) {
  async function cityRows(where?: ReturnType<typeof eq>): Promise<CityRow[]> {
    const q = db
      .select({ city: cities, state: states, country: countries })
      .from(cities)
      .innerJoin(states, eq(cities.stateId, states.id))
      .innerJoin(countries, eq(states.countryId, countries.id))
    const rows = await (where ? q.where(where) : q)
    return rows.map(({ city, state, country }) => ({
      id: city.id,
      stateId: city.stateId,
      name: city.name,
      lat: city.lat,
      lng: city.lng,
      timezone: city.timezone,
      diyanetId: city.diyanetId,
      state: ref(state),
      country: ref(country),
    }))
  }

  return {
    async upsertPlaces(c: SourceCountry[], s: SourceState[], ci: SourceCity[]): Promise<void> {
      await db.transaction(async (tx) => {
        for (const part of chunks(c)) {
          await tx
            .insert(countries)
            .values(part.map((x) => ({ id: x.id, name: x.name, diyanetId: x.diyanetId })))
            .onConflictDoUpdate({ target: countries.id, set: { name: ex(countries.name), diyanetId: ex(countries.diyanetId) } })
        }
        for (const part of chunks(s)) {
          await tx
            .insert(states)
            .values(
              part.map((x) => ({
                id: x.id,
                countryId: x.countryId,
                name: x.name,
                nameNormalized: normalizePlaceName(x.name),
                diyanetId: x.diyanetId,
              })),
            )
            .onConflictDoUpdate({
              target: states.id,
              set: {
                countryId: ex(states.countryId),
                name: ex(states.name),
                nameNormalized: ex(states.nameNormalized),
                diyanetId: ex(states.diyanetId),
              },
            })
        }
        for (const part of chunks(ci)) {
          await tx
            .insert(cities)
            .values(
              part.map((x) => ({
                id: x.id,
                stateId: x.stateId,
                name: x.name,
                nameNormalized: normalizePlaceName(x.name),
                lat: x.lat,
                lng: x.lng,
                timezone: x.timezone,
                diyanetId: x.diyanetId,
              })),
            )
            .onConflictDoUpdate({
              target: cities.id,
              set: {
                stateId: ex(cities.stateId),
                name: ex(cities.name),
                nameNormalized: ex(cities.nameNormalized),
                lat: ex(cities.lat),
                lng: ex(cities.lng),
                timezone: ex(cities.timezone),
                diyanetId: ex(cities.diyanetId),
              },
            })
        }
      })
    },

    async listCountries(): Promise<PlaceRef[]> {
      const rows = await db.select({ id: countries.id, name: countries.name }).from(countries)
      return rows.map(ref).sort(byName)
    },

    async listStates(countryId: string): Promise<PlaceRef[] | null> {
      const [c] = await db.select({ id: countries.id }).from(countries).where(eq(countries.id, countryId))
      if (!c) return null
      const rows = await db.select({ id: states.id, name: states.name }).from(states).where(eq(states.countryId, countryId))
      return rows.map(ref).sort(byName)
    },

    async listCities(stateId: string): Promise<PlaceRef[] | null> {
      const [s] = await db.select({ id: states.id }).from(states).where(eq(states.id, stateId))
      if (!s) return null
      const rows = await db.select({ id: cities.id, name: cities.name }).from(cities).where(eq(cities.stateId, stateId))
      return rows.map(ref).sort(byName)
    },

    async getCity(cityId: string): Promise<CityRow | null> {
      return (await cityRows(eq(cities.id, cityId)))[0] ?? null
    },

    getAllCitiesWithCoords(): Promise<CityRow[]> {
      return cityRows()
    },

    async findStatesByNormalizedName(countryId: string, n: string): Promise<PlaceRef[]> {
      const rows = await db
        .select({ id: states.id, name: states.name })
        .from(states)
        .where(and(eq(states.countryId, countryId), eq(states.nameNormalized, n)))
      return rows.map(ref).sort(byName)
    },

    async findCitiesInState(stateId: string): Promise<CityRow[]> {
      const rows = await cityRows(eq(cities.stateId, stateId))
      return rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    },

    async getPrayerDays(cityId: string, from: string, days: number): Promise<DayTimes[]> {
      const last = addDays(from, days - 1)
      const rows = await db
        .select()
        .from(prayerTimes)
        .where(and(eq(prayerTimes.cityId, cityId), gte(prayerTimes.date, from), lte(prayerTimes.date, last)))
        .orderBy(asc(prayerTimes.date))
      return rows.map((r) => ({
        date: r.date,
        hijriDate: r.hijriDate,
        imsak: r.imsak,
        gunes: r.gunes,
        ogle: r.ogle,
        ikindi: r.ikindi,
        aksam: r.aksam,
        yatsi: r.yatsi,
      }))
    },

    async upsertPrayerDays(cityId: string, source: 'mock' | 'diyanet', days: DayTimes[]): Promise<void> {
      const fetchedAt = new Date()
      await db.transaction(async (tx) => {
        for (const part of chunks(days)) {
          await tx
            .insert(prayerTimes)
            .values(
              part.map((d) => ({
                cityId,
                date: d.date,
                imsak: d.imsak,
                gunes: d.gunes,
                ogle: d.ogle,
                ikindi: d.ikindi,
                aksam: d.aksam,
                yatsi: d.yatsi,
                hijriDate: d.hijriDate,
                source,
                fetchedAt,
              })),
            )
            .onConflictDoUpdate({
              target: [prayerTimes.cityId, prayerTimes.date],
              set: {
                imsak: ex(prayerTimes.imsak),
                gunes: ex(prayerTimes.gunes),
                ogle: ex(prayerTimes.ogle),
                ikindi: ex(prayerTimes.ikindi),
                aksam: ex(prayerTimes.aksam),
                yatsi: ex(prayerTimes.yatsi),
                hijriDate: ex(prayerTimes.hijriDate),
                source: ex(prayerTimes.source),
                fetchedAt: ex(prayerTimes.fetchedAt),
              },
            })
        }
      })
    },

    async getLatestPrayerDate(cityId: string): Promise<string | null> {
      const [r] = await db.select({ d: max(prayerTimes.date) }).from(prayerTimes).where(eq(prayerTimes.cityId, cityId))
      return r?.d ?? null
    },

    async touchDemand(cityId: string, at: Date): Promise<void> {
      await db
        .insert(cityDemand)
        .values({ cityId, lastRequestedAt: at })
        .onConflictDoUpdate({ target: cityDemand.cityId, set: { lastRequestedAt: at } })
    },

    async listDemandedCities(since: Date): Promise<string[]> {
      const rows = await db.select({ id: cityDemand.cityId }).from(cityDemand).where(gte(cityDemand.lastRequestedAt, since))
      return rows.map((r) => r.id)
    },

    async logSourceCall(e: SourceCallRecord): Promise<void> {
      await db.insert(sourceCalls).values({ kind: e.kind, operation: e.operation, param: e.param, ok: e.ok, error: e.error ?? null })
    },
  }
}

export type Repo = ReturnType<typeof createRepo>
