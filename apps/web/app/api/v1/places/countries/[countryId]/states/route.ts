import { getContext } from '../../../../../../../src/server/context'
import { listStates } from '../../../../../../../src/server/handlers/places'
import { withContext } from '../../../../../../../src/server/http'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ countryId: string }> }) {
  const { countryId } = await params
  return withContext(getContext, (ctx) => listStates(ctx, countryId))
}
