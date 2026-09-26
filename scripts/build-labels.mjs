// English municipality names -> public/geo/muni-en.json ({ "13101": "Chiyoda City", … })
//
//   node scripts/build-labels.mjs
//
// Same style as zairyu-map: official-looking English names "Kawasaki City", "Samukawa Town",
// "Ogasawara Village", "Chuo Ward, Sapporo". The type comes from the Japanese name (市/町/村/区),
// the romanisation from Wikidata without macrons (data/labels/wikidata_lg_codes.csv, 6-digit
// 全国地方公共団体コード incl. check digit).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const topo = JSON.parse(readFileSync(resolve(root, 'public/geo/japan.topo.json'), 'utf8'));
const rows = readFileSync(resolve(root, 'data/labels/wikidata_lg_codes.csv'), 'utf8')
  .trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
const wd = new Map(rows.map(([c, en]) => [c.slice(0, 5), en]));
/** designated city by prefecture + Japanese name, e.g. "14|川崎市" -> "Kawasaki" */
const cityEn = new Map(rows.map(([c, en, ja]) => [`${c.slice(0, 2)}|${ja}`, en]));

const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*\(.*\)$/, '').trim();
const base = (s) => plain(s).replace(/(-| )(shi|ku|machi|cho|mura|son|gun)$/i, '').replace(/ (City|Town|Village|Ward)$/, '');

const out = {};
for (const g of topo.objects.muni.geometries) {
  const code = String(g.id), ja = g.properties.n;
  const en = wd.get(code);
  if (!en) continue;
  const m = ja.match(/^(.+?市)(.+区)$/); // ward of a designated city
  if (m) {
    const city = cityEn.get(`${code.slice(0, 2)}|${m[1]}`);
    if (!city) console.warn(`  ! no city for ${code} ${ja}`);
    out[code] = `${base(en)} Ward, ${city ? base(city) : m[1]}`;
    continue;
  }
  const type = ja.endsWith('市') ? 'City' : ja.endsWith('区') ? 'City' /* Tokyo special wards */ : ja.endsWith('町') ? 'Town' : ja.endsWith('村') ? 'Village' : '';
  out[code] = type ? `${base(en)} ${type}` : base(en);
}
writeFileSync(resolve(root, 'public/geo/muni-en.json'), JSON.stringify(out));
const miss = topo.objects.muni.geometries.filter((g) => !out[String(g.id)]);
console.log(`wrote muni-en.json: ${Object.keys(out).length} names, ${miss.length} missing`, miss.slice(0, 8).map((g) => `${g.id} ${g.properties.n}`));
