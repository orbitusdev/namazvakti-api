import type { AnnouncementPlatform } from '@namazvakti/db'
import type { Context } from '../context'
import { ApiError } from '../errors'
import { CACHE_PUBLIC_SHORT, ok, toErrorResult, type HandlerResult } from '../http'

const PLATFORMS: readonly AnnouncementPlatform[] = ['ios', 'macos']
const LIMIT = 20

/** ISO 8601 to the second: the apps' decoder does not take fractional seconds. */
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

/** `GET /api/v1/announcements?platform=ios|macos&build=N`: newest first, ended ones flagged. */
export async function listAnnouncements(ctx: Context, url: URL, now: Date): Promise<HandlerResult> {
  try {
    const platform = url.searchParams.get('platform')
    if (!PLATFORMS.includes(platform as AnnouncementPlatform)) {
      throw new ApiError(400, 'invalid_request', 'Query parameter "platform" must be "ios" or "macos"')
    }
    const buildParam = url.searchParams.get('build')
    let build: number | undefined
    if (buildParam !== null) {
      if (!/^\d+$/.test(buildParam)) throw new ApiError(400, 'invalid_request', 'Query parameter "build" must be a non-negative integer')
      build = Number(buildParam)
    }
    const rows = await ctx.repo.listAnnouncements({ platform: platform as AnnouncementPlatform, build, now, limit: LIMIT })
    const announcements = rows.map((a) => ({
      id: a.slug,
      title: a.title,
      body: a.body,
      ...(a.linkUrl ? { link: { url: a.linkUrl, ...(a.linkTitle ? { title: a.linkTitle } : {}) } } : {}),
      startsAt: iso(a.startsAt),
      ...(a.endsAt ? { endsAt: iso(a.endsAt) } : {}),
      active: a.active,
    }))
    return ok({ announcements }, CACHE_PUBLIC_SHORT)
  } catch (e) {
    return toErrorResult(e)
  }
}
