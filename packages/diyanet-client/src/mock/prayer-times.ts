import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan'
import type { DayTimes } from '@namazvakti/core'
import type { SourceCity } from '../source'

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

/** Computes one day of prayer times for `city` using the adhan Turkey method. */
export function computeDay(city: SourceCity, date: string): DayTimes {
  const params = CalculationMethod.Turkey()
  params.madhab = Madhab.Shafi
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  // adhan reads local date components, so build the date from local components too
  const localNoon = new Date(y, m - 1, d, 12, 0, 0)
  const pt = new PrayerTimes(new Coordinates(city.lat, city.lng), localNoon, params)
  const tz = city.timezone
  return {
    date,
    imsak: formatTime(pt.fajr, tz),
    gunes: formatTime(pt.sunrise, tz),
    ogle: formatTime(pt.dhuhr, tz),
    ikindi: formatTime(pt.asr, tz),
    aksam: formatTime(pt.maghrib, tz),
    yatsi: formatTime(pt.isha, tz),
    hijriDate: null,
  } satisfies DayTimes
}
