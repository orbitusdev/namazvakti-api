import { beforeEach, describe, expect, it } from 'vitest'
import { createRepo, type Repo } from '../src'
import { createTestDb } from './helpers'

const NOW = new Date('2026-11-14T12:00:00Z')
const text = (s: string) => ({ tr: `${s} tr`, en: `${s} en`, de: `${s} de` })

describe('announcements', () => {
  let repo: Repo
  beforeEach(async () => {
    repo = createRepo(await createTestDb())
    await repo.insertAnnouncement({ slug: 'old', title: text('old'), body: text('old'), startsAt: new Date('2026-11-01T00:00:00Z'),
      endsAt: new Date('2026-11-10T00:00:00Z') })
    await repo.insertAnnouncement({ slug: 'new', title: text('new'), body: text('new'), startsAt: new Date('2026-11-13T00:00:00Z'),
      linkUrl: 'https://namazvakti.app', linkTitle: text('link') })
    await repo.insertAnnouncement({ slug: 'future', title: text('f'), body: text('f'), startsAt: new Date('2026-12-01T00:00:00Z') })
    await repo.insertAnnouncement({ slug: 'mac-only', title: text('m'), body: text('m'), startsAt: new Date('2026-11-12T00:00:00Z'),
      platforms: ['macos'] })
    await repo.insertAnnouncement({ slug: 'update', title: text('u'), body: text('u'), startsAt: new Date('2026-11-11T00:00:00Z'),
      maxBuild: 11 })
  })

  it('lists started announcements for the platform, newest first, with the active flag', async () => {
    const list = await repo.listAnnouncements({ platform: 'ios', build: 12, now: NOW, limit: 20 })
    expect(list.map((a) => a.slug)).toEqual(['new', 'old'])
    expect(list.map((a) => a.active)).toEqual([true, false])
    expect(list[0]).toMatchObject({ title: text('new'), linkUrl: 'https://namazvakti.app', linkTitle: text('link') })
  })

  it('filters by platform and build range', async () => {
    expect((await repo.listAnnouncements({ platform: 'macos', build: 12, now: NOW, limit: 20 })).map((a) => a.slug))
      .toEqual(['new', 'mac-only', 'old'])
    expect((await repo.listAnnouncements({ platform: 'ios', build: 11, now: NOW, limit: 20 })).map((a) => a.slug))
      .toEqual(['new', 'update', 'old'])
    // Without a build the build range is ignored.
    expect((await repo.listAnnouncements({ platform: 'ios', now: NOW, limit: 20 })).map((a) => a.slug))
      .toEqual(['new', 'update', 'old'])
  })

  it('honours the limit', async () => {
    expect(await repo.listAnnouncements({ platform: 'ios', build: 12, now: NOW, limit: 1 })).toHaveLength(1)
  })

  it('ends an announcement and lists everything for the CLI', async () => {
    expect(await repo.endAnnouncement('new', NOW)).toBe(true)
    expect(await repo.endAnnouncement('missing', NOW)).toBe(false)
    // Ending again keeps the first end time.
    expect(await repo.endAnnouncement('old', NOW)).toBe(false)
    const list = await repo.listAnnouncements({ platform: 'ios', build: 12, now: new Date(NOW.getTime() + 1000), limit: 20 })
    expect(list[0]).toMatchObject({ slug: 'new', active: false })
    expect((await repo.listAllAnnouncements()).map((a) => a.slug)).toEqual(['future', 'new', 'mac-only', 'update', 'old'])
  })

  it('rejects a duplicate slug', async () => {
    await expect(repo.insertAnnouncement({ slug: 'new', title: text('x'), body: text('x') })).rejects.toThrow()
  })
})
