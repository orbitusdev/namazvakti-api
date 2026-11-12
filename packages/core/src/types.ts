export type PrayerName = 'imsak' | 'gunes' | 'ogle' | 'ikindi' | 'aksam' | 'yatsi'

export const PRAYER_NAMES: readonly PrayerName[] = [
  'imsak',
  'gunes',
  'ogle',
  'ikindi',
  'aksam',
  'yatsi',
]

/** `date` is YYYY-MM-DD; prayer times are HH:mm. */
export type DayTimes = { date: string; hijriDate: string | null } & Record<PrayerName, string>

export type PlaceRef = { id: string; name: string }
