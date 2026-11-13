import { describe, expect, it } from 'vitest'
import { EzanVaktiSource, MockDiyanetSource } from '@namazvakti/diyanet-client'
import { createSourceFromEnv, serviceOptionsFor } from '../src/server/context'

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

describe('createSourceFromEnv', () => {
  it('defaults to the mock source', () => {
    expect(createSourceFromEnv(env({}))).toBeInstanceOf(MockDiyanetSource)
  })

  it('builds the Ezan Vakti source, labelled as Diyanet data, with a throttled fetch policy', () => {
    const s = createSourceFromEnv(env({ DIYANET_SOURCE: 'ezanvakti' }))
    expect(s).toBeInstanceOf(EzanVaktiSource)
    expect(s.kind).toBe('diyanet')
    expect(serviceOptionsFor(s)).toEqual(expect.objectContaining({ refillBelowDays: 7, minRefetchMs: 12 * 3_600_000 }))
    expect(serviceOptionsFor(new MockDiyanetSource())).toEqual({})
  })

  it('rejects unknown sources', () => {
    expect(() => createSourceFromEnv(env({ DIYANET_SOURCE: 'x' }))).toThrow(/Unsupported/)
  })
})
