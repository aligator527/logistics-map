// Section shapes of the 2021 road census (道路交通センサス WEBマップ), for matching census sections to the N06 graph
// ONLY: 道路局 道路経済調査室 allowed this in writing (2026-10) on condition that neither the lines nor the positions of
// the 地点名 are redistributed or shown. So the files stay in data/raw/roadcensus/geom/ (not committed, not published);
// only speeds keyed by N06 sections reach public/.
//
//   node scripts/fetch-census-geom.mjs      (resumable; one request a second; expressway sections only)
//
// One GeoJSON per 交通調査基本区間: {B}/census/{PP}/{id11}.geojson (MultiLineString, one part per carriageway).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/roadcensus'), OUT = resolve(RAW, 'geom');
const B = 'https://www.mlit.go.jp/road/ir/ir-data/census_visualizationR3';
const UA = { 'User-Agent': 'logistics-map ETL (non-commercial; section matching, permitted by MLIT road economics office)' };
mkdirSync(OUT, { recursive: true });

// the same rows as scripts/lib/roadcensus.mjs: 高速自動車国道, 都市高速, 自動車専用の一般国道
const ids = [];
for (const f of readdirSync(RAW).filter((n) => /^kasyo\d\d\.csv$/.test(n)).sort()) {
  for (const line of new TextDecoder('shift_jis').decode(readFileSync(resolve(RAW, f))).split(/\r?\n/).slice(1)) {
    const r = line.split(',');
    if (r.length < 100) continue;
    if (r[3] === '1' || r[3] === '2' || (r[3] === '3' && r[19] === '1')) ids.push(r[0].padStart(11, '0'));
  }
}
const todo = [...new Set(ids)].filter((id) => !existsSync(resolve(OUT, `${id}.geojson`)) && !existsSync(resolve(OUT, `${id}.missing`)));
console.log(`${ids.length} sections, ${todo.length} to fetch`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, missing = 0, failed = 0;
for (const [k, id] of todo.entries()) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${B}/census/${id.slice(0, 2)}/${id}.geojson`, { headers: UA });
    if (r.status === 404) { writeFileSync(resolve(OUT, `${id}.missing`), ''); missing++; }
    else if (!r.ok) { failed++; console.log(`${id}: HTTP ${r.status}`); if (r.status === 403 || r.status === 429) break; }
    else { writeFileSync(resolve(OUT, `${id}.geojson`), await r.text()); ok++; }
  } catch (e) { failed++; console.log(`${id}: ${e.message}`); }
  if (k % 250 === 0) console.log(`${k}/${todo.length}: ${ok} ok, ${missing} missing, ${failed} failed`);
  await sleep(Math.max(0, 1000 - (Date.now() - t0)));
}
console.log(`done: ${ok} ok, ${missing} missing, ${failed} failed`);
