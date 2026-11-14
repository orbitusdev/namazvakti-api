// Writes announcements for the apps (no admin panel yet).
//
//   pnpm announce add --slug bayram-2027 --title-tr "Bayramınız mübarek olsun" --body-tr "…" \
//     [--title-en …] [--body-en …] [--title-de …] [--body-de …] \
//     [--link https://…] [--link-title-tr …] [--link-title-en …] [--link-title-de …] \
//     [--platforms ios,macos] [--starts 2027-03-20T00:00:00+03:00] [--ends …] [--min-build 12] [--max-build 20]
//   pnpm announce list
//   pnpm announce end <slug>
//
// The apps cache the list for up to 10 minutes at the CDN, so a change takes that long to show.
import { parseArgs } from 'node:util'
import { createRepo, type AnnouncementPlatform, type LocalizedText } from '@namazvakti/db'
import { checkAnnouncementInput } from '../src/server/announcement-input'
import { createDbFromEnv } from '../src/server/context'

const USAGE = 'usage: pnpm announce add --slug S --title-tr T --body-tr B [...] | list | end <slug>'

function localized(v: Record<string, unknown>, key: string): LocalizedText | undefined {
  const tr = (v[`${key}-tr`] as string | undefined)?.trim()
  if (!tr) return undefined
  const en = (v[`${key}-en`] as string | undefined)?.trim()
  const de = (v[`${key}-de`] as string | undefined)?.trim()
  return { tr, ...(en ? { en } : {}), ...(de ? { de } : {}) }
}

function date(v: unknown, name: string): Date | undefined {
  if (v === undefined) return undefined
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) throw new Error(`--${name} is not a date: ${v}`)
  return d
}

function int(v: unknown, name: string): number | undefined {
  if (v === undefined) return undefined
  if (!/^\d+$/.test(String(v))) throw new Error(`--${name} must be a non-negative integer`)
  return Number(v)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const repo = createRepo(createDbFromEnv())
  if (command === 'list') {
    for (const a of await repo.listAllAnnouncements()) {
      const state = a.active ? (a.startsAt > new Date() ? 'scheduled' : 'active') : 'ended'
      console.log(`${a.slug}\t${state}\t${a.startsAt.toISOString()}\t[${a.platforms.join(',')}]\t${a.title.tr}`)
    }
    return
  }
  if (command === 'end') {
    const slug = rest[0]
    if (!slug) throw new Error(USAGE)
    if (!(await repo.endAnnouncement(slug, new Date()))) throw new Error(`no announcement "${slug}"`)
    console.log(`ended ${slug}`)
    return
  }
  if (command !== 'add') throw new Error(USAGE)
  const text = (n: string) => ({ type: 'string' as const, [n]: undefined })
  const { values } = parseArgs({
    args: rest,
    options: {
      slug: { type: 'string' }, link: { type: 'string' }, platforms: { type: 'string' },
      starts: { type: 'string' }, ends: { type: 'string' }, 'min-build': { type: 'string' }, 'max-build': { type: 'string' },
      ...Object.fromEntries(['title', 'body', 'link-title'].flatMap((k) => ['tr', 'en', 'de'].map((l) => [`${k}-${l}`, text(l)]))),
    },
  })
  const title = localized(values, 'title')
  const body = localized(values, 'body')
  if (!values.slug || !title || !body) throw new Error(USAGE)
  const platforms = values.platforms?.split(',').map((p) => p.trim()) as AnnouncementPlatform[] | undefined
  if (platforms?.some((p) => p !== 'ios' && p !== 'macos')) throw new Error('--platforms takes ios and/or macos')
  const input = {
    slug: values.slug, title, body,
    linkUrl: values.link ?? null, linkTitle: localized(values, 'link-title') ?? null,
    platforms, minBuild: int(values['min-build'], 'min-build'), maxBuild: int(values['max-build'], 'max-build'),
    startsAt: date(values.starts, 'starts'), endsAt: date(values.ends, 'ends') ?? null,
  }
  const problems = checkAnnouncementInput(input)
  if (problems.length) throw new Error(problems.join('\n'))
  await repo.insertAnnouncement(input)
  console.log(`added ${values.slug}`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
