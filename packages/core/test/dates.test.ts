import { describe, expect, it } from 'vitest'
import { addDays, dateRange, isIsoDate, todayIn } from '../src/index'

describe('dates', () => {
  it('addDays', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('dateRange', () => {
    expect(dateRange('2026-12-30', 3)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
  })
  it('todayIn', () => {
    expect(todayIn('Europe/Istanbul', new Date('2026-11-11T21:30:00Z'))).toBe('2026-11-12')
  })
  it('isIsoDate', () => {
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2028-02-29')).toBe(true)
  })
})
