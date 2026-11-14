import { describe, expect, it } from 'vitest'
import { checkAnnouncementInput } from '../src/server/announcement-input'

const base = { slug: 'x', title: { tr: 'Başlık' }, body: { tr: 'Metin' } }

describe('checkAnnouncementInput', () => {
  it('accepts a minimal announcement', () => {
    expect(checkAnnouncementInput(base)).toEqual([])
  })

  it('requires https links', () => {
    expect(checkAnnouncementInput({ ...base, linkUrl: 'https://namazvakti.app' })).toEqual([])
    for (const linkUrl of ['http://namazvakti.app', 'javascript:alert(1)', 'tel:123', 'not a url']) {
      expect(checkAnnouncementInput({ ...base, linkUrl }), linkUrl).not.toEqual([])
    }
  })

  it('rejects inverted build and date ranges', () => {
    expect(checkAnnouncementInput({ ...base, minBuild: 20, maxBuild: 12 })).not.toEqual([])
    expect(checkAnnouncementInput({ ...base, minBuild: 12, maxBuild: 12 })).toEqual([])
    const startsAt = new Date('2027-01-02T00:00:00Z')
    expect(checkAnnouncementInput({ ...base, startsAt, endsAt: new Date('2027-01-01T00:00:00Z') })).not.toEqual([])
  })

  it('rejects blank text and a bad slug', () => {
    expect(checkAnnouncementInput({ ...base, title: { tr: '  ' } })).not.toEqual([])
    expect(checkAnnouncementInput({ ...base, slug: 'Has Space' })).not.toEqual([])
  })
})
