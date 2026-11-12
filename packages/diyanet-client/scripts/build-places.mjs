#!/usr/bin/env node
// Builds data/tr-places.json from two openly licensed sources (see data/SOURCE.md):
//   1. ubeydeozdmr/turkiye-api (MIT): provinces.json + districts.json -> canonical names + province coordinates
//   2. Wikidata (CC0): district coordinates, fetched with scripts/places.rq
//
// Usage: node scripts/build-places.mjs <turkiye-api/datasets dir> <wikidata-results.json> [out.json]
// Inputs are treated as untrusted data: they are only parsed as JSON, never executed.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [datasetsDir, wikidataFile, outArg] = process.argv.slice(2)
if (!datasetsDir || !wikidataFile) {
  console.error('usage: build-places.mjs <datasets dir> <wikidata-results.json> [out.json]')
  process.exit(1)
}
const out = outArg ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tr-places.json')

const MAX_KM_FROM_PROVINCE = 150
const TR_MAP = { ı: 'i', İ: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u' }

const key = (s) =>
  Array.from(s.normalize('NFC').replace(/\s*\(.*?\)\s*/g, ' ').replace(/,.*$/, '').trim(), (c) => TR_MAP[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/ (ilcesi|ilce|district)$/, '')
    .trim()

const km = (a, b) => {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

const provinces = JSON.parse(readFileSync(join(datasetsDir, 'provinces.json'), 'utf8'))
const districts = JSON.parse(readFileSync(join(datasetsDir, 'districts.json'), 'utf8'))
const bindings = JSON.parse(readFileSync(wikidataFile, 'utf8')).results.bindings

const wd = new Map() // normalized district name -> [{lat,lng}]
for (const b of bindings) {
  const m = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(b.coord.value)
  if (!m) continue
  const k = `${key(b.pLabel.value)}/${key(b.dLabel.value)}`
  if (!wd.has(k)) wd.set(k, [])
  wd.get(k).push({ lng: Number(m[1]), lat: Number(m[2]) })
}

// Districts with no usable Wikidata match. Each coordinate is the label point of the district's
// OpenStreetMap administrative boundary relation (ODbL, (c) OpenStreetMap contributors), found with
// https://nominatim.openstreetmap.org/search?q=<ilce>,+<il>,+T%C3%BCrkiye (Soma: county=Soma&state=Manisa)
// and cross-checked to lie inside the right province. Keyed by "il/ilce"; the comment is the source.
const OVERRIDES = {
  'Adana/Tufanbeyli': { lat: 38.2603, lng: 36.2221 }, // https://www.openstreetmap.org/relation/1249258
  'Ağrı/Diyadin': { lat: 39.5398, lng: 43.6712 }, // https://www.openstreetmap.org/relation/1837705
  'Aksaray/Gülağaç': { lat: 38.3941, lng: 34.3461 }, // https://www.openstreetmap.org/relation/1717635
  'Ankara/Bala': { lat: 39.5534, lng: 33.1238 }, // https://www.openstreetmap.org/relation/1809594
  'Ankara/Gölbaşı': { lat: 39.7925, lng: 32.8067 }, // https://www.openstreetmap.org/relation/1809464
  'Ankara/Güdül': { lat: 40.2105, lng: 32.2432 }, // https://www.openstreetmap.org/relation/1739269
  'Ankara/Kahramankazan': { lat: 40.2054, lng: 32.6813 }, // https://www.openstreetmap.org/relation/1812355
  'Antalya/Döşemealtı': { lat: 37.0230, lng: 30.6013 }, // https://www.openstreetmap.org/relation/1727454
  'Antalya/Gazipaşa': { lat: 36.2683, lng: 32.3175 }, // https://www.openstreetmap.org/relation/1443174
  'Antalya/Kemer': { lat: 36.6014, lng: 30.5639 }, // https://www.openstreetmap.org/relation/1727292
  'Antalya/Konyaaltı': { lat: 36.8726, lng: 30.6504 }, // https://www.openstreetmap.org/relation/1727384
  'Antalya/Muratpaşa': { lat: 36.8889, lng: 30.7209 }, // https://www.openstreetmap.org/relation/1727535
  'Bingöl/Karlıova': { lat: 39.2946, lng: 41.0102 }, // https://www.openstreetmap.org/relation/1836193
  'Bingöl/Kiğı': { lat: 39.3104, lng: 40.3496 }, // https://www.openstreetmap.org/relation/1836194
  'Bingöl/Yedisu': { lat: 39.4340, lng: 40.5451 }, // https://www.openstreetmap.org/relation/1836197
  'Çankırı/Ilgaz': { lat: 40.9249, lng: 33.6253 }, // https://www.openstreetmap.org/relation/1647151
  'Denizli/Güney': { lat: 38.1539, lng: 29.0652 }, // https://www.openstreetmap.org/relation/1606208
  'Diyarbakır/Yenişehir': { lat: 37.9200, lng: 40.2299 }, // https://www.openstreetmap.org/relation/1665091
  'Erzurum/Aziziye': { lat: 39.9455, lng: 41.1060 }, // https://www.openstreetmap.org/relation/1832781
  'Eskişehir/Odunpazarı': { lat: 39.7656, lng: 30.5238 }, // https://www.openstreetmap.org/relation/1238924
  'Gaziantep/Şehitkamil': { lat: 37.0728, lng: 37.3950 }, // https://www.openstreetmap.org/relation/1808100
  'Hakkari/Derecik': { lat: 37.0813, lng: 44.3119 }, // https://www.openstreetmap.org/relation/9218922
  'İstanbul/Çekmeköy': { lat: 41.0352, lng: 29.1739 }, // https://www.openstreetmap.org/relation/1276034
  'İstanbul/Eyüpsultan': { lat: 41.0478, lng: 28.9327 }, // https://www.openstreetmap.org/relation/1766103
  'İstanbul/Şile': { lat: 41.1744, lng: 29.6125 }, // https://www.openstreetmap.org/relation/1275310
  'Kahramanmaraş/Onikişubat': { lat: 37.5778, lng: 36.9237 }, // https://www.openstreetmap.org/relation/3671449
  'Kayseri/Yahyalı': { lat: 38.1003, lng: 35.3541 }, // https://www.openstreetmap.org/relation/1798543
  'Konya/Halkapınar': { lat: 37.4335, lng: 34.1866 }, // https://www.openstreetmap.org/relation/1250949
  'Konya/Selçuklu': { lat: 37.8769, lng: 32.4874 }, // https://www.openstreetmap.org/relation/1250972
  'Manisa/Soma': { lat: 39.1852, lng: 27.6089 }, // https://www.openstreetmap.org/relation/1758899
  'Mardin/Mazıdağı': { lat: 37.4773, lng: 40.4865 }, // https://www.openstreetmap.org/relation/1693976
  'Mersin/Anamur': { lat: 36.0803, lng: 32.8312 }, // https://www.openstreetmap.org/relation/1827892
  'Mersin/Bozyazı': { lat: 36.1048, lng: 32.9743 }, // https://www.openstreetmap.org/relation/1827894
  'Mersin/Çamlıyayla': { lat: 37.1665, lng: 34.5934 }, // https://www.openstreetmap.org/relation/1626475
  'Mersin/Mut': { lat: 36.6434, lng: 33.4373 }, // https://www.openstreetmap.org/relation/1442351
  'Muğla/Kavaklıdere': { lat: 37.4456, lng: 28.3649 }, // https://www.openstreetmap.org/relation/1624125
  'Ordu/Altınordu': { lat: 40.9787, lng: 37.8964 }, // https://www.openstreetmap.org/relation/1839066
  'Samsun/19 Mayıs': { lat: 41.4937, lng: 36.0810 }, // https://www.openstreetmap.org/relation/1837369
  'Şanlıurfa/Eyyübiye': { lat: 37.1481, lng: 38.7825 }, // https://www.openstreetmap.org/relation/3677452
  'Şanlıurfa/Haliliye': { lat: 37.1675, lng: 38.7956 }, // https://www.openstreetmap.org/relation/1747584
  'Şanlıurfa/Karaköprü': { lat: 37.2047, lng: 38.7959 }, // https://www.openstreetmap.org/relation/3677455
  'Siirt/Eruh': { lat: 37.7506, lng: 42.1808 }, // https://www.openstreetmap.org/relation/1246475
  'Siirt/Kurtalan': { lat: 37.9261, lng: 41.7002 }, // https://www.openstreetmap.org/relation/1246476
  'Siirt/Pervari': { lat: 37.9325, lng: 42.5480 }, // https://www.openstreetmap.org/relation/1246474
  'Siirt/Şirvan': { lat: 38.0618, lng: 42.0299 }, // https://www.openstreetmap.org/relation/1246472
  'Siirt/Tillo': { lat: 37.9501, lng: 42.0125 }, // https://www.openstreetmap.org/relation/1246477
  'Tekirdağ/Marmaraereğlisi': { lat: 40.9694, lng: 27.9550 }, // https://www.openstreetmap.org/relation/1771122
  'Tekirdağ/Muratlı': { lat: 41.1723, lng: 27.5015 }, // https://www.openstreetmap.org/relation/1771123
  'Trabzon/Arsin': { lat: 40.9537, lng: 39.9326 }, // https://www.openstreetmap.org/relation/1236155
  'Trabzon/Sürmene': { lat: 40.9128, lng: 40.1135 }, // https://www.openstreetmap.org/relation/1236153
  'Van/İpekyolu': { lat: 38.5038, lng: 43.3955 }, // https://www.openstreetmap.org/relation/3678626
  'Van/Tuşba': { lat: 38.5123, lng: 43.3753 }, // https://www.openstreetmap.org/relation/1778550
  'Zonguldak/Ereğli': { lat: 41.2796, lng: 31.4230 }, // https://www.openstreetmap.org/relation/1840250
}

const round = (n) => Math.round(n * 1e4) / 1e4
const byProvince = new Map(provinces.map((p) => [p.id, p]))
const rows = []
const stats = { merkez: 0, wikidata: 0, override: 0, fallback: 0 }
const fallbackNames = []

for (const d of districts) {
  const p = byProvince.get(d.provinceId)
  const pc = { lat: p.coordinates.latitude, lng: p.coordinates.longitude }
  let coord
  if (d.name === 'Merkez') {
    coord = pc
    stats.merkez++
  } else {
    // Wikidata candidates must be filed under this province (P131) and lie near its centre.
    const names = [d.name, d.name.replace(/\s+Merkez$/, '')]
    const near = names
      .flatMap((n) => wd.get(`${key(p.name)}/${key(n)}`) ?? [])
      .map((c) => ({ c, d: km(c, pc) }))
      .filter((x) => x.d <= MAX_KM_FROM_PROVINCE)
      .sort((a, b) => a.d - b.d)[0]
    if (near) {
      coord = near.c
      stats.wikidata++
    } else if (OVERRIDES[`${p.name}/${d.name}`]) {
      coord = OVERRIDES[`${p.name}/${d.name}`]
      stats.override++
    } else {
      coord = pc
      stats.fallback++
      fallbackNames.push(`${p.name}/${d.name}`)
    }
  }
  rows.push({ il: p.name, ilce: d.name, lat: round(coord.lat), lng: round(coord.lng) })
}

for (const k of Object.keys(OVERRIDES)) {
  if (!rows.some((r) => `${r.il}/${r.ilce}` === k)) console.error('unused override (not a district):', k)
}

rows.sort((a, b) => a.il.localeCompare(b.il, 'tr') || a.ilce.localeCompare(b.ilce, 'tr'))
writeFileSync(out, JSON.stringify(rows, null, 1) + '\n')
console.error(`wrote ${rows.length} rows to ${out}`, stats)
console.error('province-centre fallback:', fallbackNames.join(', '))
