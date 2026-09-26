// Expressways and interchanges from 国土数値情報 N06 (高速道路時系列) -> public/geo/roads.json
//
//   node scripts/build-roads.mjs [path/to/N06-YY/UTF-8]
//
// Download N06-YY_GML.zip from https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N06-2025.html
// and unzip it into data/geo/. Only sections / joints still in service (設置期間 終了 = 9999).
//   sections: N06_007 路線名, N06_008 道路種別 (1 高速自動車国道, 2 一般国道の自動車専用道路,
//             3 高規格幹線以外の自動車専用道路 etc., 4 本州四国連絡道路, 5 都市高速道路)
//   joints:   N06_018 名称, N06_019 種別 (1 IC, 2 スマートIC, 3 JCT, 4 その他)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, r10 } from './lib/project.mjs';
import { prefAt, prefs } from './lib/planar.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, process.argv[2] ?? 'data/geo/N06-25/N06-25_GML/UTF-8');
const tag = dir.match(/N06-(\d+)/)?.[1] ?? '24';
const tmp = resolve(root, 'data/geo/tmp');
const out = resolve(root, 'public/geo/roads.json');
mkdirSync(tmp, { recursive: true });

// 1) current sections, dissolved per route and type, simplified (in lon/lat; interval in metres)
execFileSync(resolve(root, 'node_modules/.bin/mapshaper'), [
  '-i', `${dir}/N06-${tag}_HighwaySection.geojson`,
  '-filter', 'N06_003 === 9999',
  '-each', 'route=N06_007, kind=Number(N06_008)',
  '-dissolve', 'route,kind',
  '-simplify', 'dp', 'interval=120', 'keep-shapes',
  '-o', `${tmp}/roads.json`, 'format=geojson', 'force',
], { stdio: 'inherit' });

const lines = JSON.parse(readFileSync(`${tmp}/roads.json`, 'utf8')).features;
const roads = lines.filter((f) => f.geometry).map((f) => {
  const g = f.geometry;
  const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  return {
    n: f.properties.route,
    // 1 national expressway / 本四 ; 2 other motorways ; 3 urban expressways (首都高・阪神高速 …)
    t: f.properties.kind === 5 ? 3 : f.properties.kind === 1 || f.properties.kind === 4 ? 1 : 2,
    c: parts.map((p) => p.map((c) => r10(project(c)))),
  };
});

// 2) joints still in service: IC / smart IC / JCT
const KIND = { 1: 'ic', 2: 'sic', 3: 'jct' };
const joints = JSON.parse(readFileSync(`${dir}/N06-${tag}_Joint.geojson`, 'utf8')).features
  .filter((f) => f.properties.N06_014 === 9999 && KIND[f.properties.N06_019])
  .map((f) => ({ n: f.properties.N06_018, k: KIND[f.properties.N06_019], p: r10(project(f.geometry.coordinates)) }));
// the same joint can be recorded once per route: keep one per name + place
const seen = new Set();
const uniq = joints.filter((j) => {
  const key = `${j.n}|${Math.round(j.p[0] / 500)}|${Math.round(j.p[1] / 500)}`;
  return seen.has(key) ? false : (seen.add(key), true);
});

// 3) per-prefecture counts for the site score. A few joints on reclaimed land fall just outside
//    the simplified coastline and are left uncounted.
const stats = { area: prefs.map((f) => Math.round(f.area / 1e6)), ic: Array(47).fill(0), sic: Array(47).fill(0), jct: Array(47).fill(0) };
let outside = 0;
for (const j of uniq) {
  const c = prefAt(j.p);
  if (!c) { outside++; continue; }
  j.pr = c;
  stats[j.k][c - 1]++;
}
writeFileSync(resolve(root, 'public/geo/prefstats.json'), JSON.stringify({
  note: 'area: km² of the simplified outline (planar, LCC); ic/sic/jct: expressway joints in service (N06)', ...stats }));
console.log(`prefstats: ${outside} joints outside every prefecture outline (coast / simplification)`);

writeFileSync(out, JSON.stringify({
  source: {
    ja: `国土数値情報（高速道路時系列データ N06, 20${tag}年度）`,
    en: `MLIT National Land Numerical Information, expressways (N06, FY20${tag})`,
    url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N06-2025.html',
  },
  roads,
  joints: uniq,
}));
console.log(`wrote ${out}: ${(statSync(out).size / 1024).toFixed(0)} KB, ${roads.length} routes,`,
  uniq.length, 'joints', Object.fromEntries(Object.values(KIND).map((k) => [k, uniq.filter((j) => j.k === k).length])));
