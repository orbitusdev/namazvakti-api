import { getContext } from '../../../../src/server/context'
import { getAbout } from '../../../../src/server/handlers/about'
import { withContext } from '../../../../src/server/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withContext(getContext, (ctx) => getAbout(ctx))
}
