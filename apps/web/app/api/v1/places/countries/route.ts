import { getContext } from '../../../../../src/server/context'
import { listCountries } from '../../../../../src/server/handlers/places'
import { withContext } from '../../../../../src/server/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withContext(getContext, (ctx) => listCountries(ctx))
}
