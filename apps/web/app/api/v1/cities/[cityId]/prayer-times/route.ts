import { getContext } from '../../../../../../src/server/context'
import { getPrayerTimes } from '../../../../../../src/server/handlers/prayer-times'
import { withContext } from '../../../../../../src/server/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ cityId: string }> }) {
  const { cityId } = await params
  return withContext(getContext, (ctx) => getPrayerTimes(ctx, cityId, new URL(req.url), new Date()))
}
