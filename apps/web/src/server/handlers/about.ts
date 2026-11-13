import type { Context } from '../context'
import { CACHE_PUBLIC_SHORT, ok, toErrorResult, type HandlerResult } from '../http'

/** Credits for the apps' About screen: the data source and, if any, the service relaying it. */
export async function getAbout(ctx: Context): Promise<HandlerResult> {
  try {
    const { kind, provider } = ctx.source
    return ok(provider ? { source: kind, provider } : { source: kind }, CACHE_PUBLIC_SHORT)
  } catch (e) {
    return toErrorResult(e)
  }
}
