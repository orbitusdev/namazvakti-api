import type { AnnouncementInput } from '@namazvakti/db'

/** Problems with an announcement before it is written; empty when it is fine. */
export function checkAnnouncementInput(a: AnnouncementInput): string[] {
  const problems: string[] = []
  if (!/^[a-z0-9][a-z0-9-]*$/.test(a.slug)) problems.push('slug: lowercase letters, digits and dashes only')
  if (!a.title.tr.trim()) problems.push('title: Turkish text is empty')
  if (!a.body.tr.trim()) problems.push('body: Turkish text is empty')
  if (a.linkUrl != null) {
    let ok = false
    try {
      ok = new URL(a.linkUrl).protocol === 'https:'
    } catch {
      ok = false
    }
    if (!ok) problems.push('link: must be an https URL')
  }
  if (a.minBuild != null && a.maxBuild != null && a.minBuild > a.maxBuild) problems.push('build range: min is above max')
  if (a.endsAt && a.endsAt <= (a.startsAt ?? new Date())) problems.push('dates: ends at or before it starts')
  return problems
}
