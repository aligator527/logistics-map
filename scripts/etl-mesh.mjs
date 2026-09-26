// 2020 census population on the 1 km grid -> data/raw/mesh/pop2020.json (intermediate, not published)
//
//   node scripts/etl-mesh.mjs
//
// Source: 国土数値情報「1kmメッシュ別将来推計人口（R6国政局推計）」 (mesh1000r6, CC BY 4.0), field PTN_2020
// = 2020 census population. https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-mesh1000r6.html
// The national zip holds 47 prefecture zips; only the DBF is needed (mesh code gives the position).
// Meshes on a prefecture border appear in both files with their own share, so values are summed
// per mesh. SHICODE may list several municipalities ("01202_01236"): the mesh is split evenly.
// Also the projections of the same dataset (国立社会保障・人口問題研究所 based, R6 国政局推計):
// PTN_2025/2035/2050 total, PTB_* 15–64 years, PTC_* 65+.
// Output rows: [lat, lon, pop2020, pop2025, pop2035, pop2050, work2025, work2050, old2025, municipality codes…].
export const FIELDS = ['PTN_2020', 'PTN_2025', 'PTN_2035', 'PTN_2050', 'PTB_2025', 'PTB_2050', 'PTC_2025'];
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/mesh');
const ZIP = resolve(RAW, '1km_mesh_2024_SHP.zip');
const URL_ = 'https://nlftp.mlit.go.jp/ksj/gml/data/m1kr6/m1kr6-24/1km_mesh_2024_SHP.zip';
mkdirSync(RAW, { recursive: true });
if (!existsSync(ZIP)) {
  console.log('downloading', URL_, '(139 MB)…');
  const r = await fetch(URL_);
  if (!r.ok) throw new Error(`GET ${r.status}`);
  writeFileSync(ZIP, Buffer.from(await r.arrayBuffer()));
}

/** 3次メッシュ code PPQQrstu -> centre lat/lon */
export function meshCenter(code) {
  const s = String(code);
  const pp = +s.slice(0, 2), qq = +s.slice(2, 4), r = +s[4], t = +s[5], u = +s[6], v = +s[7];
  return [pp / 1.5 + r / 12 + u / 120 + 1 / 240, qq + 100 + t / 8 + v / 80 + 1 / 160];
}

const work = resolve(RAW, 'work');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
execFileSync('unzip', ['-q', '-o', ZIP, '-d', work]);
const inner = resolve(work, '1km_mesh_2024_SHP');
const byMesh = new Map();
for (const z of readdirSync(inner).filter((f) => /_\d{2}_SHP\.zip$/.test(f)).sort()) {
  const dir = resolve(work, z.replace('.zip', ''));
  execFileSync('unzip', ['-q', '-o', resolve(inner, z), '*.dbf', '-d', dir]);
  const dbf = execFileSync('find', [dir, '-name', '*.dbf']).toString().trim().split('\n')[0];
  const csv = resolve(dir, 'p.csv');
  execFileSync(resolve(root, 'node_modules/.bin/mapshaper'), ['-i', dbf, 'encoding=utf8', '-filter-fields', `MESH_ID,SHICODE,${FIELDS.join(',')}`, '-o', csv, 'force'], { stdio: 'ignore' });
  const lines = readFileSync(csv, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const at = (k) => head.indexOf(k);
  for (const line of lines.slice(1)) {
    const r = line.split(',');
    const id = r[at('MESH_ID')], shi = r[at('SHICODE')];
    const m = byMesh.get(id) ?? byMesh.set(id, { pop: 0, v: FIELDS.map(() => 0), codes: new Set() }).get(id);
    FIELDS.forEach((f, k) => { m.v[k] += Number(r[at(f)]) || 0; });
    m.pop = m.v[0];
    for (const c of String(shi).split('_')) if (/^\d{5}$/.test(c)) m.codes.add(c);
  }
  rmSync(dir, { recursive: true, force: true });
}
rmSync(work, { recursive: true, force: true });

const rows = [];
let total = 0;
for (const [id, m] of byMesh) {
  if (m.pop <= 0) continue;
  const [lat, lon] = meshCenter(id);
  rows.push([+lat.toFixed(5), +lon.toFixed(5), ...m.v.map((x) => Math.round(x * 10) / 10), ...m.codes]);
  total += m.pop;
}
writeFileSync(resolve(RAW, 'pop2020.json'), JSON.stringify(rows));
console.log(`pop2020.json: ${rows.length} populated meshes, total ${Math.round(total).toLocaleString()} (census 2020: 126,146,099)`);
