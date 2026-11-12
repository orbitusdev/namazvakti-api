import { getContext } from '../../../../src/server/context'
import { refresh } from '../../../../src/server/handlers/cron'
import { withContext } from '../../../../src/server/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Vercel Cron issues GET requests and sends `Authorization: Bearer ${CRON_SECRET}`.
export async function GET(req: Request) {
  return withContext(getContext, (ctx) => refresh(ctx, req.headers.get('authorization'), new Date()))
}
