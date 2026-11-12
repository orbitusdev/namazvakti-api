import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Validator } from '@seriousme/openapi-schema-validator'
import { loadSpec, validateResponse } from '../src/index'

const place = { id: 'tr-istanbul', name: 'Istanbul' }
const city = {
  id: 'tr-istanbul-kadikoy',
  name: 'Kadikoy',
  state: place,
  country: { id: 'tr', name: 'Turkiye' },
  timezone: 'Europe/Istanbul',
  lat: 40.99,
  lng: 29.03,
}
const day = {
  date: '2026-11-11',
  hijriDate: null,
  imsak: '05:07',
  gunes: '06:39',
  ogle: '12:01',
  ikindi: '14:35',
  aksam: '17:12',
  yatsi: '18:38',
}
const sample = { city, timezone: 'Europe/Istanbul', source: 'mock', days: [day] }

describe('openapi contract', () => {
  it('is a valid OpenAPI document', async () => {
    const yaml = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')
    const result = await new Validator().validate(yaml)
    expect(result.valid, JSON.stringify(result)).toBe(true)
  })

  it('loads the spec', () => {
    expect(loadSpec()).toHaveProperty('paths')
  })

  it('accepts a valid prayer-times response', () => {
    expect(validateResponse('getPrayerTimes', 200, sample)).toEqual({ ok: true })
  })

  it('rejects a malformed time', () => {
    const bad = { ...sample, days: [{ ...day, imsak: '5:07' }] }
    expect(validateResponse('getPrayerTimes', 200, bad).ok).toBe(false)
  })

  it('accepts the out_of_coverage error on locate', () => {
    const body = { error: { code: 'out_of_coverage', message: 'x' } }
    expect(validateResponse('locate', 404, body).ok).toBe(true)
  })

  it('rejects extra properties on City', () => {
    expect(validateResponse('locate', 200, { city: { ...city, extra: 1 } }).ok).toBe(false)
  })

  it('allows up to 60 days', () => {
    const spec = loadSpec() as any
    const days = spec.paths['/api/v1/cities/{cityId}/prayer-times'].get.parameters.find((p: any) => p.name === 'days')
    expect(days.schema).toMatchObject({ minimum: 1, maximum: 60, default: 30 })
  })

  it('reports unknown operations', () => {
    expect(validateResponse('nope', 200, {}).ok).toBe(false)
  })
})
