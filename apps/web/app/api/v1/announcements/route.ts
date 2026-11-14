import { getContext } from '../../../../src/server/context'
import { listAnnouncements } from '../../../../src/server/handlers/announcements'
import { withContext } from '../../../../src/server/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withContext(getContext, (ctx) => listAnnouncements(ctx, new URL(request.url), new Date()))
}
