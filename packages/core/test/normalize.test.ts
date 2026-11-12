import { describe, expect, it } from 'vitest'
import { normalizePlaceName, slugify } from '../src/index'

describe('normalizePlaceName', () => {
  it('normalizes Turkish characters', () => {
    expect(normalizePlaceName('İSTANBUL')).toBe('istanbul')
    expect(normalizePlaceName('Şişli')).toBe(normalizePlaceName('SISLI'))
    expect(normalizePlaceName('  Çankaya ')).toBe('cankaya')
    expect(normalizePlaceName('Ağrı')).toBe('agri')
  })
  it('lowercases and strips diacritics, including decomposed (NFD) input', () => {
    expect(normalizePlaceName('Şişli')).toBe('sisli')
    expect(normalizePlaceName('Şişli'.normalize('NFD'))).toBe('sisli')
  })
  it('slugifies', () => {
    expect(slugify('Kahramanmaraş Merkez')).toBe('kahramanmaras-merkez')
  })
})
