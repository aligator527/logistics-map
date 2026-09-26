// JMA forecast areas (class20) -> our municipality codes -> public/data/jma-areas.json
//
//   node scripts/build-jma-areas.mjs
//
// Warnings (気象庁 防災情報 JSON) are issued per class20 area: a 7-digit code whose first 5 digits
// are the municipality code — except that designated cities are one area (0110000 札幌市) while the
// map has wards, and a few municipalities are split (0120601 釧路市釧路 …). This builds a static table
// { class20: [municipality codes] } so the browser only fetches the warnings themselves.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { muniPoints } from './lib/geo-ll.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const area = await (await fetch('https://www.jma.go.jp/bosai/common/const/area.json', { headers: { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' } })).json();
const geoms = JSON.parse(readFileSync(resolve(root, 'public/geo/japan.topo.json'), 'utf8')).objects.muni.geometries;
const codes = new Set(geoms.map((g) => String(g.id)));
const names = new Map(geoms.map((g) => [String(g.id), g.properties.n]));
const relm = await (await fetch('https://www.jma.go.jp/bosai/common/const/class20relm.json', { headers: { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' } })).json();
const pts = new Map(muniPoints().map((p) => [p.code, p]));
const out = {};
let wards = 0, missing = [];
// cities split into parts (「横浜市北部」「横浜市南部」): each ward goes to the part whose bounding box
// contains its interior point (nearest box centre if several or none)
const parts = Object.entries(area.class20s).filter(([c20, a]) => !codes.has(c20.slice(0, 5)) && /^(.+?市)(北部|南部|東部|西部|中部)$/.test(a.name));
const byCity = new Map();
for (const [c20, a] of parts) {
  const city = a.name.match(/^(.+?市)/)[1];
  const k = `${c20.slice(0, 2)}|${city}`;
  (byCity.get(k) ?? byCity.set(k, []).get(k)).push({ c20, box: relm[c20] });
}
for (const [k, list] of byCity) {
  const [pref, city] = k.split('|');
  for (const [code, n] of names) {
    if (!code.startsWith(pref) || !n.startsWith(city) || !/区$/.test(n)) continue;
    const p = pts.get(code);
    if (!p) continue;
    const inside = list.filter(({ box }) => box && p.lat <= box.ne[0] && p.lat >= box.sw[0] && p.lon <= box.ne[1] && p.lon >= box.sw[1]);
    const cands = inside.length ? inside : list;
    const d = ({ box }) => box ? Math.hypot(p.lat - (box.ne[0] + box.sw[0]) / 2, p.lon - (box.ne[1] + box.sw[1]) / 2) : Infinity;
    const best = cands.sort((x, y) => d(x) - d(y))[0];
    (out[best.c20] ??= []).push(code);
    wards++;
  }
}
for (const [c20, a] of Object.entries(area.class20s)) {
  if (out[c20]) continue; // city parts, done above
  const c5 = c20.slice(0, 5);
  if (codes.has(c5)) { out[c20] = [c5]; continue; }
  // designated city: every ward whose name starts with the city name, in the same prefecture
  const ws = [...names].filter(([c, n]) => c.startsWith(c20.slice(0, 2)) && n.startsWith(a.name) && /区$/.test(n)).map(([c]) => c);
  if (ws.length) { out[c20] = ws; wards += ws.length; continue; }
  missing.push(`${c20} ${a.name}`);
}
const covered = new Set(Object.values(out).flat());
writeFileSync(resolve(root, 'public/data/jma-areas.json'), JSON.stringify(out));
console.log(`jma-areas.json: ${Object.keys(out).length} class20 areas → ${covered.size}/${codes.size} municipalities (${wards} wards via their city);`,
  `unmatched: ${missing.length} ${missing.slice(0, 8).join(', ')}`);
