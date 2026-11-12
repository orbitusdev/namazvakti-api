export type ErrorCode = 'invalid_request' | 'not_found' | 'out_of_coverage' | 'upstream_unavailable' | 'rate_limited' | 'internal'

/** Error that maps directly onto an HTTP error response. */
export class ApiError extends Error {
  constructor(
    public status: 400 | 404 | 429 | 500 | 503,
    public code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
