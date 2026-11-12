import { boolean, date, doublePrecision, index, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const countries = pgTable('countries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  diyanetId: integer('diyanet_id'),
})

export const states = pgTable('states', {
  id: text('id').primaryKey(),
  countryId: text('country_id').notNull().references(() => countries.id),
  name: text('name').notNull(),
  nameNormalized: text('name_normalized').notNull(),
  diyanetId: integer('diyanet_id'),
})

export const cities = pgTable(
  'cities',
  {
    id: text('id').primaryKey(),
    stateId: text('state_id').notNull().references(() => states.id),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    timezone: text('timezone').notNull(),
    diyanetId: integer('diyanet_id'),
  },
  (t) => [index('cities_state_name_idx').on(t.stateId, t.nameNormalized)],
)

export const prayerTimes = pgTable(
  'prayer_times',
  {
    cityId: text('city_id').notNull().references(() => cities.id),
    date: date('date', { mode: 'string' }).notNull(),
    imsak: text('imsak').notNull(),
    gunes: text('gunes').notNull(),
    ogle: text('ogle').notNull(),
    ikindi: text('ikindi').notNull(),
    aksam: text('aksam').notNull(),
    yatsi: text('yatsi').notNull(),
    hijriDate: text('hijri_date'),
    source: text('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cityId, t.date] })],
)

export const cityDemand = pgTable('city_demand', {
  cityId: text('city_id').primaryKey().references(() => cities.id),
  lastRequestedAt: timestamp('last_requested_at', { withTimezone: true }).notNull(),
})

export const sourceCalls = pgTable('source_calls', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(),
  operation: text('operation').notNull(),
  param: text('param').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  ok: boolean('ok').notNull(),
  error: text('error'),
})
