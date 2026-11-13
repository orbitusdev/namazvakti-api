#!/usr/bin/env node
// Builds data/tr-diyanet-ids.json: the Diyanet district (ilçe) id of every district in tr-places.json.
// Source: the Ezan Vakti API (https://ezanvakti.emushaf.net), which mirrors Diyanet's place lists.
//
// It costs 82 requests (1 province list + 81 district lists), spaced out, and runs only when the
// place list changes; the server never asks for place lists at runtime.
//
// Usage: node scripts/build-diyanet-ids.mjs [out.json]
// Responses are kept in $TMPDIR/ezanvakti-lists, so a rerun (e.g. after editing ALIASES) sends no requests.
// Responses are treated as untrusted data: only parsed as JSON, never executed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://ezanvakti.emushaf.net'
const TURKIYE = 2
const DELAY_MS = 1500
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ?? join(here, '..', 'data', 'tr-diyanet-ids.json')
const places = JSON.parse(readFileSync(join(here, '..', 'data', 'tr-places.json'), 'utf8'))

const TR_MAP = { ı: 'i', İ: 'i', I: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a', î: 'i', û: 'u' }
const key = (s) =>
  Array.from(s.normalize('NFC'), (c) => TR_MAP[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Diyanet disambiguates with a province letter: "AYVACIK (S)", "ALTINYAYLA(S)"
    .replace(/[^a-z0-9]+/g, '')

// Names that differ between the two lists, keyed "il/ilce" (tr-places spelling) -> Diyanet ilçe name.
// Filled in from the script's "unmatched" output after checking each by hand.
const ALIASES = {
  'Tekirdağ/Marmaraereğlisi': 'M.EREĞLİSİ',
  'Zonguldak/Ereğli': 'KARADENİZ EREĞLİ',
  'Ağrı/Doğubayazıt': 'DOĞUBEYAZIT',
}

// Diyanet lists a metropolitan province's centre as one entry named after the province ("ANKARA")
// instead of its central districts. That entry is placed at the seat district below, so central
// districts without an entry of their own fall to it. The script fails if a province needs one.
const PROVINCE_SEAT = {
  Adana: 'Seyhan', Ankara: 'Çankaya', Antalya: 'Muratpaşa', Aydın: 'Efeler', Balıkesir: 'Karesi',
  Bursa: 'Osmangazi', Denizli: 'Pamukkale', Diyarbakır: 'Sur', Erzurum: 'Yakutiye', Eskişehir: 'Odunpazarı',
  Gaziantep: 'Şahinbey', Hatay: 'Antakya', İstanbul: 'Fatih', İzmir: 'Konak', Kahramanmaraş: 'Onikişubat',
  Kayseri: 'Melikgazi', Kocaeli: 'İzmit', Malatya: 'Battalgazi', Manisa: 'Şehzadeler',
  Mardin: 'Artuklu', Mersin: 'Akdeniz', Muğla: 'Menteşe', Ordu: 'Altınordu', Sakarya: 'Adapazarı',
  Samsun: 'İlkadım', Şanlıurfa: 'Haliliye', Tekirdağ: 'Süleymanpaşa', Trabzon: 'Ortahisar', Van: 'İpekyolu',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cacheDir = join(tmpdir(), 'ezanvakti-lists')
mkdirSync(cacheDir, { recursive: true })
async function get(path) {
  const cached = join(cacheDir, path.replaceAll('/', '_') + '.json')
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'))
  const data = await fetchJson(path)
  writeFileSync(cached, JSON.stringify(data))
  return data
}
async function fetchJson(path) {
  await sleep(DELAY_MS)
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
    // The API rate-limits with 429 + Retry-After (seconds); wait as told and retry.
    if (res.status === 429 && attempt < 5) {
      const wait = Number(res.headers.get('retry-after')) || 5
      console.error(`429 on ${path}, waiting ${wait}s`)
      await sleep(wait * 1000 + 250)
      continue
    }
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return res.json()
  }
}

const provinces = await get(`/sehirler/${TURKIYE}`)
const provinceByKey = new Map(provinces.map((p) => [key(p.SehirAdi), p]))

const km = (a, b) => {
  const r = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

// Each entry: the Diyanet district id, its Diyanet name, and how it was found:
//   "name"    – same name (Merkez -> the province's own entry, e.g. "ADANA"),
//   "alias"   – a hand-checked spelling difference (ALIASES),
//   "nearest" – Diyanet has no entry of its own (mostly central districts of metropolitan
//               provinces, which Diyanet folds into the province entry); the Diyanet district
//               nearest to it in the same province is used, by our own coordinates.
const ids = {}
const stats = { name: 0, alias: 0, nearest: 0 }
const byIl = Map.groupBy(places, (p) => p.il)
for (const [il, rows] of byIl) {
  const province = provinceByKey.get(key(il))
  if (!province) throw new Error(`province not in Diyanet list: ${il}`)
  const districts = await get(`/ilceler/${province.SehirID}`)
  const byKey = new Map(districts.map((d) => [key(d.IlceAdi), d]))
  const matched = []
  const pending = []
  for (const row of rows) {
    const alias = ALIASES[`${il}/${row.ilce}`]
    const d = byKey.get(key(alias ?? (row.ilce === 'Merkez' ? il : row.ilce)))
    if (!d) {
      pending.push(row)
      continue
    }
    const how = alias ? 'alias' : 'name'
    ids[`${il}/${row.ilce}`] = { id: Number(d.IlceID), diyanet: d.IlceAdi, how }
    stats[how]++
    matched.push({ row, d })
  }
  // The province's own entry, when no district took it by name, stands at the seat district.
  const own = byKey.get(key(il))
  if (pending.length && own && !matched.some((m) => m.d === own)) {
    const seat = rows.find((r) => r.ilce === PROVINCE_SEAT[il])
    if (!seat) throw new Error(`PROVINCE_SEAT needed for ${il} (unmatched: ${pending.map((r) => r.ilce).join(', ')})`)
    matched.push({ row: seat, d: own })
  }
  if (pending.length && !matched.length) throw new Error(`no district of ${il} matched`)
  for (const row of pending) {
    const near = matched.map((m) => ({ ...m, km: km(row, m.row) })).sort((a, b) => a.km - b.km)[0]
    ids[`${il}/${row.ilce}`] = { id: Number(near.d.IlceID), diyanet: near.d.IlceAdi, how: 'nearest', km: Math.round(near.km) }
    stats.nearest++
  }
  if (PROVINCE_SEAT[il] && !(own && pending.length)) console.error(`PROVINCE_SEAT unused for ${il}`)
  for (const a of Object.keys(ALIASES)) {
    if (a.startsWith(il + '/') && !rows.some((r) => `${il}/${r.ilce}` === a)) throw new Error(`unused alias ${a}`)
  }
}

const sorted = Object.fromEntries(Object.entries(ids).sort(([a], [b]) => a.localeCompare(b, 'tr')))
writeFileSync(out, JSON.stringify(sorted, null, 1) + '\n')
console.error(`wrote ${Object.keys(ids).length}/${places.length} ids to ${out}`, stats)
const far = Object.entries(ids).filter(([, v]) => v.how === 'nearest').sort((a, b) => b[1].km - a[1].km)
console.error('nearest (km):\n' + far.map(([k, v]) => `${k} -> ${v.diyanet} ${v.km}`).join('\n'))
