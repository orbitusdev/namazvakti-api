import { ApiError, type ErrorCode } from './errors'

export type HandlerResult = { status: number; body: unknown; headers: Record<string, string> }

export const CACHE_PUBLIC = 'public, s-maxage=86400, stale-while-revalidate=604800'
export const CACHE_PUBLIC_SHORT = 'public, s-maxage=600, stale-while-revalidate=3600'
export const NO_STORE = 'no-store'

export function ok(body: unknown, cacheControl: string): HandlerResult {
  return { status: 200, body, headers: { 'Cache-Control': cacheControl } }
}

export function errorResult(status: number, code: ErrorCode, message: string): HandlerResult {
  return { status, body: { error: { code, message } }, headers: { 'Cache-Control': NO_STORE } }
}

/** Maps any thrown value to an error result; unknown errors are logged and become a 500. */
export function toErrorResult(err: unknown): HandlerResult {
  if (err instanceof ApiError) return errorResult(err.status, err.code, err.message)
  console.error(err)
  return errorResult(500, 'internal', 'Internal server error')
}

export function toResponse(r: HandlerResult): Response {
  return Response.json(r.body, { status: r.status, headers: r.headers })
}

/**
 * Route helper: builds the context and runs the handler; a failure while building the context
 * (e.g. bad configuration) still yields the JSON contract error instead of Next's HTML 500.
 */
export async function withContext<C>(
  getCtx: () => C,
  fn: (ctx: C) => Promise<HandlerResult>,
): Promise<Response> {
  try {
    return toResponse(await fn(getCtx()))
  } catch (e) {
    return toResponse(toErrorResult(e))
  }
}
