import { getContext } from '../../../../src/server/context'
import { locate } from '../../../../src/server/handlers/locate'
import { withContext } from '../../../../src/server/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return withContext(getContext, (ctx) => locate(ctx, new URL(req.url)))
}
