import type { DayTimes } from '@namazvakti/core'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DMY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/

const pad = (n: string) => n.padStart(2, '0')

/** "08.11.2026" -> "2026-11-08"; also used for the Hijri "28.5.1448" -> "1448-05-28". */
function isoFromDmy(s: unknown): string | null {
  const m = typeof s === 'string' ? DMY.exec(s.trim()) : null
  return m ? `${m[3]}-${pad(m[2]!)}-${pad(m[1]!)}` : null
}

function time(s: unknown): string | null {
  return typeof s === 'string' && TIME.test(s.trim()) ? s.trim() : null
}

/**
 * Turns a `/vakitler/{ilce}` response into days. Times are the city's local `HH:mm` (the API's
 * ISO date carries Türkiye's offset for every country, so it is ignored). Malformed days are
 * dropped; anything that is not an array yields no days.
 */
export function parseVakitler(body: unknown): DayTimes[] {
  if (!Array.isArray(body)) return []
  const out = new Map<string, DayTimes>()
  for (const v of body as Record<string, unknown>[]) {
    if (!v || typeof v !== 'object') continue
    const date = isoFromDmy(v.MiladiTarihKisa)
    const imsak = time(v.Imsak)
    const gunes = time(v.Gunes)
    const ogle = time(v.Ogle)
    const ikindi = time(v.Ikindi)
    const aksam = time(v.Aksam)
    const yatsi = time(v.Yatsi)
    if (!date || !imsak || !gunes || !ogle || !ikindi || !aksam || !yatsi) continue
    out.set(date, { date, imsak, gunes, ogle, ikindi, aksam, yatsi, hijriDate: isoFromDmy(v.HicriTarihKisa) })
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date))
}
