const TURKISH_MAP: Record<string, string> = {
  İ: 'i',
  I: 'i',
  ı: 'i',
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
  â: 'a',
  Â: 'a',
  î: 'i',
  Î: 'i',
  û: 'u',
  Û: 'u',
}

export function normalizePlaceName(s: string): string {
  const mapped = Array.from(s.normalize('NFC'), (ch) => TURKISH_MAP[ch] ?? ch).join('')
  return mapped
    .toLocaleLowerCase('tr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function slugify(s: string): string {
  return normalizePlaceName(s).split(' ').filter(Boolean).join('-')
}
