import { ApiError } from '../errors'
import type { Context } from '../context'
import { CACHE_PUBLIC, ok, toErrorResult, type HandlerResult } from '../http'

export async function listCountries(ctx: Context): Promise<HandlerResult> {
  try {
    return ok({ countries: await ctx.repo.listCountries() }, CACHE_PUBLIC)
  } catch (e) {
    return toErrorResult(e)
  }
}

export async function listStates(ctx: Context, countryId: string): Promise<HandlerResult> {
  try {
    const states = await ctx.repo.listStates(countryId)
    if (!states) throw new ApiError(404, 'not_found', 'Country not found')
    return ok({ states }, CACHE_PUBLIC)
  } catch (e) {
    return toErrorResult(e)
  }
}

export async function listCities(ctx: Context, stateId: string): Promise<HandlerResult> {
  try {
    const cities = await ctx.repo.listCities(stateId)
    if (!cities) throw new ApiError(404, 'not_found', 'State not found')
    return ok({ cities }, CACHE_PUBLIC)
  } catch (e) {
    return toErrorResult(e)
  }
}
