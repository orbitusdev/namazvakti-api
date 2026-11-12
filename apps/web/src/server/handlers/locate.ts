import { ApiError } from '../errors'
import type { Context } from '../context'
import { NO_STORE, ok, toErrorResult, type HandlerResult } from '../http'
import { locateCity } from '../locate'
import { toCityResponse } from './city'

function coordinate(url: URL, name: 'lat' | 'lng', max: number): number {
  const raw = url.searchParams.get(name)
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw)
  if (!Number.isFinite(n) || Math.abs(n) > max) {
    throw new ApiError(400, 'invalid_request', `Query parameter "${name}" must be a number between -${max} and ${max}`)
  }
  return n
}

export async function locate(ctx: Context, url: URL): Promise<HandlerResult> {
  try {
    const lat = coordinate(url, 'lat', 90)
    const lng = coordinate(url, 'lng', 180)
    const p = url.searchParams
    const city = await locateCity(ctx.placeCache, {
      lat,
      lng,
      country: p.get('country') || undefined,
      state: p.get('state') || undefined,
      city: p.get('city') || undefined,
    })
    return ok({ city: toCityResponse(city) }, NO_STORE)
  } catch (e) {
    return toErrorResult(e)
  }
}
