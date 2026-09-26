// Roads that matter when things go wrong, and for big trucks -> public/geo/logiroads.json, plus two municipal
// metrics in public/data/muni.json (distance from the population centre to the nearest such road):
//   緊急輸送道路 (国土数値情報 N10, 2024年度, as of 2024-03): 第1次 / 第2次 / 第3次 in service
//     https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N10-2024.html   data/raw/roads/N10-24_GML.zip
//   重要物流道路 (国土数値情報 N12, 2021年度, as of 2021-04): 重要物流道路 / 代替・補完路
//     https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N12-2021.html   data/raw/roads/N12-21_NN_GML.zip
// Both are licensed 非商用: the site is non-commercial; the lines are merged by class and simplified (a processed
// product with the source named, not a copy of the data). 大型車誘導区間 has no open data and is not included.
//
//   node scripts/build-bcp-roads.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, r10 } from './lib/project.mjs';

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
  '-simplify', 'dp', 'interval=100', 'keep-shapes',
  '-o', `${TMP}/n10.json`, 'format=geojson', 'precision=0.00001', 'force']);

// ------------------------------------------------------------------ N12: GeoJSON per prefecture
for (const f of readdirSync(RAW).filter((n) => /^N12-21_\d\d_GML\.zip$/.test(n))) {
  const name = execFileSync('unzip', ['-Z1', resolve(RAW, f)]).toString().split('\n').find((n) => /\.geojson$/.test(n));
  writeFileSync(`${TMP}/${f.replace('.zip', '.geojson')}`, execFileSync('unzip', ['-p', resolve(RAW, f), name], { maxBuffer: 64 * 1024 * 1024 }));
}
const gj12 = readdirSync(TMP).filter((n) => /^N12-21_\d\d_GML\.geojson$/.test(n)).map((n) => `${TMP}/${n}`);
mapshaper(['-i', ...gj12, 'combine-files', '-merge-layers', 'force',
  '-each', 'k = N12_002', '-dissolve', 'k',
  '-simplify', 'dp', 'interval=100', 'keep-shapes',
  '-o', `${TMP}/n12.json`, 'format=geojson', 'precision=0.00001', 'force']);

// ------------------------------------------------------------------ lay out like the map; keep lon/lat for distances
const lines = (file) => {
  const out = {}, ll = {};
  for (const f of JSON.parse(readFileSync(file, 'utf8')).features) {
    if (!f.geometry) continue;
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const k = String(f.properties.k);
    // [x0, y0, dx1, dy1, …] in 10 m units: the map's planar layout, delta-encoded (a third of the size)
    out[k] = [...(out[k] ?? []), ...parts.map((p) => {
      const q = p.map((c) => r10(project(c)).map((v) => v / 10));
      const flat = [q[0][0], q[0][1]];
      for (let i = 1; i < q.length; i++) flat.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      return flat;
    })];
    ll[k] = [...(ll[k] ?? []), ...parts];
  }
  return { out, ll };
};
const n10 = lines(`${TMP}/n10.json`), n12 = lines(`${TMP}/n12.json`);
writeFileSync(resolve(root, 'public/geo/logiroads.json'), JSON.stringify({
  emergency: n10.out,
  logistics: n12.out,
  source: {
    emergency: { ja: '国土数値情報（緊急輸送道路データ 2024年度）（国土交通省）を加工して作成', en: 'MLIT National Land Numerical Information: emergency transport roads (FY2024), processed', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N10-2024.html' },
    logistics: { ja: '国土数値情報（重要物流道路データ 2021年度）（国土交通省）を加工して作成', en: 'MLIT National Land Numerical Information: key logistics roads (FY2021), processed', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N12-2021.html' },
    note: { ja: '非商用。位置は簡略化しており、指定区間の確認は各道路管理者の資料で行ってください。', en: 'Non-commercial use. Simplified positions; check designated sections with the road administrators.' },
  },
}));
console.log(`logiroads.json: ${(statSync(resolve(root, 'public/geo/logiroads.json')).size / 1024).toFixed(0)} KB`);

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
const ix = (c) => muni.codes.indexOf(c);
console.log(`distances: 千代田 1次 ${muni.m.dEmerg[ix('13101')]} km, 重要物流 ${muni.m.dLogi[ix('13101')]} km; 檜原村 ${muni.m.dEmerg[ix('13307')]} / ${muni.m.dLogi[ix('13307')]} km`);
rmSync(TMP, { recursive: true, force: true });
