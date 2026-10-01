// Roads that matter when things go wrong, and for big trucks -> picture tiles public/tiles/logiroads/{z}/{x}/{y}.png,
// two municipal metrics in public/data/muni.json (distance from the population centre to the nearest such road) and
// the same distances for every cell of the 1 km grid (public/geo/logidist.bin.gz, for the site memo):
//   緊急輸送道路 (国土数値情報 N10, 2024年度, as of 2024-03): 第1次 / 第2次 / 第3次 in service
//     https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N10-2024.html   data/raw/roads/N10-24_GML.zip
//   重要物流道路 (国土数値情報 N12, 2021年度, as of 2021-04): 重要物流道路 / 代替・補完路
//     https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N12-2021.html   data/raw/roads/N12-21_NN_GML.zip
// Both are licensed 非商用. The site is non-commercial, and the lines reach the browser only as pictures: the
// 国土情報提供サイト運営事務局 answered (2026-10) that showing a layer is not redistribution, while data the viewer
// can download (vector tiles, APIs) may be — so no coordinates are published. Distances are GIS results (規約 3条2項).
// 大型車誘導区間 has no open data and is not included.
//
//   node scripts/build-bcp-roads.mjs
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTiles } from './lib/raster-tiles.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/roads'), TMP = resolve(root, 'data/geo/tmp/bcp');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const mapshaper = (args) => execFileSync(resolve(root, 'node_modules/.bin/mapshaper-xl'), ['-quiet', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

// ------------------------------------------------------------------ N10: shapefiles (the 2024 GeoJSON keys are mislabelled)
execFileSync('unzip', ['-q', '-o', resolve(RAW, 'N10-24_GML.zip'), '-d', `${TMP}/n10`]);
const shp10 = execFileSync('find', [`${TMP}/n10`, '-name', '*.shp']).toString().trim().split('\n');
mapshaper(['-i', ...shp10, 'combine-files', 'encoding=cp932', '-merge-layers', 'force',
  '-filter', 'N10_002 >= 1 && N10_002 <= 3 && N10_009 !== "未供用"',
  '-each', 'k = N10_002', '-dissolve', 'k',
  '-simplify', 'dp', 'interval=15', 'keep-shapes',
  '-o', `${TMP}/n10.json`, 'format=geojson', 'precision=0.00001', 'force']);

// ------------------------------------------------------------------ N12: GeoJSON per prefecture
for (const f of readdirSync(RAW).filter((n) => /^N12-21_\d\d_GML\.zip$/.test(n))) {
  const name = execFileSync('unzip', ['-Z1', resolve(RAW, f)]).toString().split('\n').find((n) => /\.geojson$/.test(n));
  writeFileSync(`${TMP}/${f.replace('.zip', '.geojson')}`, execFileSync('unzip', ['-p', resolve(RAW, f), name], { maxBuffer: 64 * 1024 * 1024 }));
}
const gj12 = readdirSync(TMP).filter((n) => /^N12-21_\d\d_GML\.geojson$/.test(n)).map((n) => `${TMP}/${n}`);
mapshaper(['-i', ...gj12, 'combine-files', '-merge-layers', 'force',
  '-each', 'k = N12_002', '-dissolve', 'k',
  '-simplify', 'dp', 'interval=15', 'keep-shapes',
  '-o', `${TMP}/n12.json`, 'format=geojson', 'precision=0.00001', 'force']);

// ------------------------------------------------------------------ picture tiles
const lines = (file) => {
  const ll = {};
  for (const f of JSON.parse(readFileSync(file, 'utf8')).features) {
    if (!f.geometry) continue;
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const k = String(f.properties.k);
    ll[k] = [...(ll[k] ?? []), ...parts];
  }
  return { ll };
};
const n10 = lines(`${TMP}/n10.json`), n12 = lines(`${TMP}/n12.json`);
// the vector layer's look (MapView .bcp), one palette for both themes; a bit wider when zoomed in
const grow = (z, w) => w * (z >= 12 ? 1.5 : z >= 10 ? 1.2 : 1);
const EMERG = '#d9443a', LOGI = '#23977a';
const STYLES = [
  ['logistics', '1', { color: LOGI, alpha: 0.42, width: (z) => grow(z, 6) }],
  ['logistics', '2', { color: LOGI, alpha: 0.4, width: (z) => grow(z, 3), dash: () => [5, 3] }],
  ['emergency', '3', { color: EMERG, alpha: 0.6, width: (z) => grow(z, 0.8), dash: () => [2, 2], minZ: 8 }],
  ['emergency', '2', { color: EMERG, width: (z) => grow(z, 1.1), dash: () => [4, 2] }],
  ['emergency', '1', { color: EMERG, width: (z) => grow(z, 1.8) }],
];
const OUT = resolve(root, 'public/tiles/logiroads');
const { files, bytes } = await renderTiles({ out: OUT, zooms: [5, 12], palette: [EMERG, LOGI, '#7e6d5a'],
  lines: STYLES.flatMap(([layer, k, style]) => ((layer === 'emergency' ? n10 : n12).ll[k] ?? []).map((coords) => ({ coords, style }))) });
console.log(`logiroads tiles: ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
writeFileSync(resolve(OUT, 'source.json'), JSON.stringify({
  emergency: { ja: '国土数値情報（緊急輸送道路データ 2024年度）（国土交通省）を加工して作成', en: 'MLIT National Land Numerical Information: emergency transport roads (FY2024), processed', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N10-2024.html' },
  logistics: { ja: '国土数値情報（重要物流道路データ 2021年度）（国土交通省）を加工して作成', en: 'MLIT National Land Numerical Information: key logistics roads (FY2021), processed', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N12-2021.html' },
  note: { ja: '非商用。画像として表示（位置は簡略化）。指定区間の確認は各道路管理者の資料で行ってください。', en: 'Non-commercial use, shown as a picture (simplified positions); check designated sections with the road administrators.' },
}));
if (existsSync(resolve(root, 'public/geo/logiroads.json'))) rmSync(resolve(root, 'public/geo/logiroads.json'));

// ------------------------------------------------------------------ municipal metrics: km to the nearest road of a class
const R = 6371.0088, rad = Math.PI / 180;
/** distance (km) from a point to the nearest segment of the polylines, on a local plane */
function nearest(p, polylines) {
  let best = Infinity;
  const kx = Math.cos(p[1] * rad) * R * rad, ky = R * rad;
  for (const line of polylines) for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p[0]) * kx, ay = (line[i - 1][1] - p[1]) * ky, bx = (line[i][0] - p[0]) * kx, by = (line[i][1] - p[1]) * ky;
    if (Math.min(Math.abs(ax), Math.abs(bx)) > best && Math.sign(ax) === Math.sign(bx)) continue;
    if (Math.min(Math.abs(ay), Math.abs(by)) > best && Math.sign(ay) === Math.sign(by)) continue;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const u = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(ax + u * dx, ay + u * dy));
  }
  return best;
}
const net = JSON.parse(readFileSync(resolve(root, 'public/geo/network.json'), 'utf8'));
const muni = JSON.parse(readFileSync(resolve(root, 'public/data/muni.json'), 'utf8'));
const r1 = (v) => (isFinite(v) ? Math.round(v * 10) / 10 : null);
muni.m.dEmerg = net.munis.ll.map((p) => r1(nearest(p, n10.ll['1'] ?? [])));
muni.m.dLogi = net.munis.ll.map((p) => r1(nearest(p, n12.ll['1'] ?? [])));
muni.sources.bcpRoads = { ja: '国土数値情報（緊急輸送道路 2024年度・重要物流道路 2021年度）を加工して作成（非商用）', en: 'MLIT: emergency transport roads (FY2024), key logistics roads (FY2021), processed (non-commercial)', url: 'https://nlftp.mlit.go.jp/ksj/' };
writeFileSync(resolve(root, 'public/data/muni.json'), JSON.stringify(muni));
// every cell of the 1 km grid (public/geo/grid.bin.gz, same order): 0.1 km units, 0xffff = none
const raw = gunzipSync(readFileSync(resolve(root, 'public/geo/grid.bin.gz')));
const g16 = new Uint16Array(raw.buffer, raw.byteOffset, raw.length / 2), n = g16.length / 4;
// segments bucketed on a 0.1° grid, searched in growing rings
const bucket = (polylines) => {
  const b = new Map();
  for (const line of polylines) for (let i = 1; i < line.length; i++) {
    const s = [line[i - 1], line[i]];
    for (let x = Math.floor(Math.min(s[0][0], s[1][0]) * 10); x <= Math.floor(Math.max(s[0][0], s[1][0]) * 10); x++)
      for (let y = Math.floor(Math.min(s[0][1], s[1][1]) * 10); y <= Math.floor(Math.max(s[0][1], s[1][1]) * 10); y++) {
        const k = x * 10000 + y; (b.get(k) ?? b.set(k, []).get(k)).push(s);
      }
  }
  return b;
};
const near = (b, p) => {
  const cx = Math.floor(p[0] * 10), cy = Math.floor(p[1] * 10);
  let best = Infinity;
  for (let ring = 0; ring < 400; ring++) {
    // a ring of 0.1° cells is at least (ring - 1) × ~8 km away
    if (best < (ring - 1) * 8) break;
    for (let x = cx - ring; x <= cx + ring; x++) for (let y = cy - ring; y <= cy + ring; y++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== ring) continue;
      const segs = b.get(x * 10000 + y);
      if (segs) best = Math.min(best, nearest(p, segs));
    }
  }
  return best;
};
const bE = bucket(n10.ll['1'] ?? []), bL = bucket(n12.ll['1'] ?? []);
const dist = new Uint16Array(2 * n);
for (let i = 0; i < n; i++) {
  const p = [120 + g16[n + i] / 1000, 20 + g16[i] / 1000];
  const e = near(bE, p), l = near(bL, p);
  dist[i] = isFinite(e) ? Math.min(65534, Math.round(e * 10)) : 0xffff;
  dist[n + i] = isFinite(l) ? Math.min(65534, Math.round(l * 10)) : 0xffff;
}
writeFileSync(resolve(root, 'public/geo/logidist.bin.gz'), gzipSync(Buffer.from(dist.buffer)));
console.log(`logidist.bin.gz: ${n} cells, ${(statSync(resolve(root, 'public/geo/logidist.bin.gz')).size / 1024).toFixed(0)} KB`);
const ix = (c) => muni.codes.indexOf(c);
console.log(`distances: 千代田 1次 ${muni.m.dEmerg[ix('13101')]} km, 重要物流 ${muni.m.dLogi[ix('13101')]} km; 檜原村 ${muni.m.dEmerg[ix('13307')]} / ${muni.m.dLogi[ix('13307')]} km`);
rmSync(TMP, { recursive: true, force: true });
