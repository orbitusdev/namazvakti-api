import { getContext } from '../../../../../../../src/server/context'
import { listCities } from '../../../../../../../src/server/handlers/places'
import { withContext } from '../../../../../../../src/server/http'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ stateId: string }> }) {
  const { stateId } = await params
  return withContext(getContext, (ctx) => listCities(ctx, stateId))
}
