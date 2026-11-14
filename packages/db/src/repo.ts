import { and, arrayContains, asc, desc, eq, gte, isNull, lte, max, or, sql } from 'drizzle-orm'
import { normalizePlaceName, type DayTimes, type PlaceRef } from '@namazvakti/core'
import type { SourceCity, SourceCountry, SourceState } from '@namazvakti/diyanet-client'
import type { Db } from './client'
import { announcements, cities, cityDemand, countries, prayerTimes, sourceCalls, states, type LocalizedText } from './schema'

export type AnnouncementPlatform = 'ios' | 'macos'

export type AnnouncementInput = {
  slug: string
  title: LocalizedText
  body: LocalizedText
  linkUrl?: string | null
  linkTitle?: LocalizedText | null
  platforms?: AnnouncementPlatform[]
  minBuild?: number | null
  maxBuild?: number | null
  startsAt?: Date
  endsAt?: Date | null
}

export type AnnouncementRow = {
  slug: string
  title: LocalizedText
  body: LocalizedText
  linkUrl: string | null
  linkTitle: LocalizedText | null
  platforms: string[]
  minBuild: number | null
  maxBuild: number | null
  startsAt: Date
  endsAt: Date | null
  /** Not ended at the time asked: `endsAt` is null or later. */
  active: boolean
}

export type CityRow = SourceCity & { state: PlaceRef; country: PlaceRef }

export type SourceCallRecord = {
  kind: 'mock' | 'diyanet'
  operation: string
  param: string
  ok: boolean
  error?: string
  /** Defaults to the database clock. */
  at?: Date
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

    /** Stored days in [from, from + days); with `source`, only days that source wrote. */
    async getPrayerDays(cityId: string, from: string, days: number, source?: 'mock' | 'diyanet'): Promise<DayTimes[]> {
      const last = addDays(from, days - 1)
      const rows = await db
        .select()
        .from(prayerTimes)
        .where(
          and(
            eq(prayerTimes.cityId, cityId),
            gte(prayerTimes.date, from),
            lte(prayerTimes.date, last),
            source ? eq(prayerTimes.source, source) : undefined,
          ),
        )
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

    async getLatestPrayerDate(cityId: string, source?: 'mock' | 'diyanet'): Promise<string | null> {
      const [r] = await db
        .select({ d: max(prayerTimes.date) })
        .from(prayerTimes)
        .where(and(eq(prayerTimes.cityId, cityId), source ? eq(prayerTimes.source, source) : undefined))
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

    /** The most recent logged call of source `kind` for `operation` with `param`, or null. */
    async getLastSourceCall(kind: 'mock' | 'diyanet', operation: string, param: string): Promise<{ at: Date; ok: boolean } | null> {
      const [r] = await db
        .select({ at: sourceCalls.at, ok: sourceCalls.ok })
        .from(sourceCalls)
        .where(and(eq(sourceCalls.kind, kind), eq(sourceCalls.operation, operation), eq(sourceCalls.param, param)))
        .orderBy(desc(sourceCalls.at), desc(sourceCalls.id))
        .limit(1)
      return r ?? null
    },

    /**
     * Announcements that have started by `now` for `platform` (and `build` within its range, when
     * given), newest first. Ended ones are included with `active: false`.
     */
    async listAnnouncements(q: { platform: AnnouncementPlatform; build?: number; now: Date; limit: number }): Promise<AnnouncementRow[]> {
      const rows = await db
        .select()
        .from(announcements)
        .where(
          and(
            lte(announcements.startsAt, q.now),
            arrayContains(announcements.platforms, [q.platform]),
            q.build === undefined ? undefined : or(isNull(announcements.minBuild), lte(announcements.minBuild, q.build)),
            q.build === undefined ? undefined : or(isNull(announcements.maxBuild), gte(announcements.maxBuild, q.build)),
          ),
        )
        .orderBy(desc(announcements.startsAt), desc(announcements.id))
        .limit(q.limit)
      return rows.map((r) => toAnnouncementRow(r, q.now))
    },

    /** Every announcement, newest start first (for the CLI). */
    async listAllAnnouncements(now = new Date()): Promise<AnnouncementRow[]> {
      const rows = await db.select().from(announcements).orderBy(desc(announcements.startsAt), desc(announcements.id))
      return rows.map((r) => toAnnouncementRow(r, now))
    },

    async insertAnnouncement(a: AnnouncementInput): Promise<void> {
      await db.insert(announcements).values({
        slug: a.slug,
        title: a.title,
        body: a.body,
        linkUrl: a.linkUrl ?? null,
        linkTitle: a.linkTitle ?? null,
        ...(a.platforms ? { platforms: a.platforms } : {}),
        minBuild: a.minBuild ?? null,
        maxBuild: a.maxBuild ?? null,
        ...(a.startsAt ? { startsAt: a.startsAt } : {}),
        endsAt: a.endsAt ?? null,
      })
    },

    /** Ends an announcement at `at`; false when no such slug or it has already ended. */
    async endAnnouncement(slug: string, at: Date): Promise<boolean> {
      const r = await db
        .update(announcements)
        .set({ endsAt: at })
        .where(and(eq(announcements.slug, slug), or(isNull(announcements.endsAt), gte(announcements.endsAt, at))))
        .returning({ id: announcements.id })
      return r.length > 0
    },

    async logSourceCall(e: SourceCallRecord): Promise<void> {
      await db
        .insert(sourceCalls)
        .values({ kind: e.kind, operation: e.operation, param: e.param, ok: e.ok, error: e.error ?? null, ...(e.at ? { at: e.at } : {}) })
    },
  }
}

export type Repo = ReturnType<typeof createRepo>

function toAnnouncementRow(r: typeof announcements.$inferSelect, now: Date): AnnouncementRow {
  return {
    slug: r.slug, title: r.title, body: r.body, linkUrl: r.linkUrl, linkTitle: r.linkTitle ?? null,
    platforms: r.platforms, minBuild: r.minBuild, maxBuild: r.maxBuild, startsAt: r.startsAt, endsAt: r.endsAt,
    active: r.endsAt === null || r.endsAt > now,
  }
}
