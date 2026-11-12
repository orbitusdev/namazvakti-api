import { describe, expect, it } from 'vitest'
import { dateRange } from '@namazvakti/core'
import { MockDiyanetSource } from '../src/mock/source'
import { computeDay } from '../src/mock/prayer-times'

async function kadikoy() {
  const cities = await new MockDiyanetSource().getCities('tr-istanbul')
  const c = cities.find((x) => x.id === 'tr-istanbul-kadikoy')
  if (!c) throw new Error('Kadikoy missing')
  return c
}

describe('mock prayer times', () => {
  it('computes plausible times for Kadikoy', async () => {
    const d = computeDay(await kadikoy(), '2026-11-11')
    const t = [d.imsak, d.gunes, d.ogle, d.ikindi, d.aksam, d.yatsi]
    for (const x of t) expect(x).toMatch(/^\d{2}:\d{2}$/)
    expect([...t].sort()).toEqual(t)
    expect(new Set(t).size).toBe(6)
    expect(d.ogle >= '12:30' && d.ogle <= '13:15').toBe(true) // Istanbul solar noon in November (UTC+3) is ~12:53
    expect(d.hijriDate).toBeNull()
  })

  it('returns a range of days', async () => {
    const days = await new MockDiyanetSource().getPrayerTimes(await kadikoy(), '2026-12-20', 30)
    expect(days.map((x) => x.date)).toEqual(dateRange('2026-12-20', 30))
  })

  it('rejects everywhere when failWith is set', async () => {
    const err = new Error('down')
    const s = new MockDiyanetSource({ failWith: err })
    await expect(s.getCountries()).rejects.toBe(err)
    await expect(s.getStates('tr')).rejects.toBe(err)
    await expect(s.getCities('tr-istanbul')).rejects.toBe(err)
    await expect(s.getPrayerTimes(await kadikoy(), '2026-11-11', 1)).rejects.toBe(err)
  })

  it('is independent of the process timezone', async () => {
    const city = await kadikoy()
    const original = process.env.TZ
    const run = (tz: string) => {
      process.env.TZ = tz
      return ['2026-11-11', '2026-01-01', '2026-06-21'].map((d) => computeDay(city, d))
    }
    try {
      const utc = run('UTC')
      expect(run('Pacific/Kiritimati')).toEqual(utc)
      expect(run('Pacific/Pago_Pago')).toEqual(utc)
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
})
