// Industrial zoning (準工業・工業・工業専用地域) from 国土数値情報 用途地域 A29 (2019) ->
// public/geo/zoning/<pref>.json, one small file per prefecture, loaded when the map is zoomed in.
//
//   node scripts/build-zoning.mjs        (A29-19_<pref>_GML.zip in data/raw/zoning/)
//
// Download: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A29-2019.html (47 files, ~280 MB).
// Terms: 国土数値情報 利用規約 and each municipality's conditions; the data's positional error must be
// passed on to the end user (the map says so). Zones of each class are dissolved per prefecture,
// simplified (15 m) and laid out like the boundaries.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, r10 } from './lib/project.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/zoning'), TMP = resolve(root, 'data/geo/tmp/zoning'), OUT = resolve(root, 'public/geo/zoning');
mkdirSync(OUT, { recursive: true });
const KIND = { 10: 1, 11: 2, 12: 3 }; // 準工業 / 工業 / 工業専用
const mapshaper = resolve(root, 'node_modules/.bin/mapshaper');

const index = {};
for (let pc = 1; pc <= 47; pc++) {
  const p2 = String(pc).padStart(2, '0');
  const zip = resolve(RAW, `A29-19_${p2}_GML.zip`);
  if (!existsSync(zip)) { console.warn(`missing ${zip}`); continue; }
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  execFileSync('unzip', ['-j', '-o', '-q', zip, '*/01-03_*/*.geojson', '-d', TMP]);
  const files = readdirSync(TMP).filter((f) => f.endsWith('.geojson')).map((f) => resolve(TMP, f));
  if (!files.length) continue;
  execFileSync(mapshaper, [
    '-quiet', '-i', ...files, 'combine-files', '-merge-layers', 'force',
    '-filter', 'A29_004 >= 10 && A29_004 <= 12',
    '-each', 'k = A29_004',
    '-dissolve', 'k',
    '-simplify', 'dp', 'interval=15', 'keep-shapes',
    '-filter-slivers', 'min-area=2000m2',
    '-o', `${TMP}/out.json`, 'format=geojson', 'force',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  const gj = JSON.parse(readFileSync(`${TMP}/out.json`, 'utf8'));
  // { "1": [polygon…], … } — polygon = rings of planar points (10 m)
  const out = {};
  for (const f of gj.features) {
    if (!f.geometry) continue;
    const k = KIND[f.properties.k];
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    out[k] = [...(out[k] ?? []), ...polys.map((poly) => poly.map((ring) => ring.map((c) => r10(project(c)))))];
  }
  const file = resolve(OUT, `${p2}.json`);
  writeFileSync(file, JSON.stringify(out));
  index[p2] = statSync(file).size;
  console.log(`${p2}: ${files.length} municipalities, ${(statSync(file).size / 1024).toFixed(0)} KB`);
}
writeFileSync(resolve(OUT, 'index.json'), JSON.stringify({
  source: { ja: '国土数値情報（用途地域 A29、2019年度）', en: 'MLIT land-use zoning (A29, FY2019)', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A29-2019.html' },
  kinds: { 1: { ja: '準工業地域', en: 'Light industrial' }, 2: { ja: '工業地域', en: 'Industrial' }, 3: { ja: '工業専用地域', en: 'Exclusively industrial' } },
  bytes: index,
}));
rmSync(TMP, { recursive: true, force: true });
