const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(s: string): boolean {
  const m = ISO_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

export function addDays(date: string, n: number): string {
  if (!isIsoDate(date)) throw new RangeError(`Invalid ISO date: ${date}`)
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10)
}

export function todayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function dateRange(from: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(from, i))
}
