// Municipal indicators for the municipal site score and the DPL catchments -> public/data/muni.json
//
//   node scripts/etl-muni.mjs     (needs: npm run geo, etl-mesh; raw files listed below)
//
// Inputs (downloaded once into data/raw/, see README):
//   mesh/pop2020.json          2020 census population on the 1 km grid (scripts/etl-mesh.mjs)
//   land/L01-26_GML.zip        地価公示 2026 (国土数値情報 L01, CC BY 4.0)
//   land/L02-26_GML.zip        都道府県地価調査 2026 (L02, CC BY 4.0)
//   land/toshikeikaku_R7.xls   都市計画現況調査 R7 「(ニ)都市別一覧」 (用途地域 ha by municipality)
//   census2020/000032214569.xlsx  国勢調査2020 従業地・通学地集計 第12表 (occupation × residence)
//   census2020/000040067885.xlsx  経済センサス‐活動調査2021 第9-1B表 (employees by industry)
//   geo/N06-24/UTF-8/N06-24_Joint.geojson  expressway interchanges
// Every municipality gets a population-weighted centre from the 1 km grid; distances and radius
// sums are measured from there (a big ward's "interior point" can sit in the mountains).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { GridIndex, km, muniPoints } from './lib/geo-ll.mjs';
import { muniAt } from './lib/planar.mjs';
import { project } from './lib/project.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw');
const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (v, d = 0) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ municipalities (2025 boundaries)
const topo = JSON.parse(readFileSync(resolve(root, 'public/geo/japan.topo.json'), 'utf8'));
const MUNIS = topo.objects.muni.geometries.map((g) => ({ code: String(g.id), name: g.properties.n }));
const idxOf = new Map(MUNIS.map((m, i) => [m.code, i]));
const N = MUNIS.length;
const inner = new Map(muniPoints().map((p) => [p.code, p]));
// planar area per municipality (km², inset scale removed) for apportioning city figures to wards
const { feature } = await import('topojson-client');
const layout = topo.meta.layout;
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a) / 2; };
const areaKm2 = new Map(feature(topo, topo.objects.muni).features.map((f) => {
  const code = String(f.id);
  const k = code === '13421' ? layout.ogasawara.k : code.startsWith('47') ? layout.okinawa.k : 1;
  const ps = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const a = ps.reduce((s, p) => s + ringArea(p[0]) - p.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
  return [code, a / (k * k) / 1e6];
}));

// ------------------------------------------------------------------ 1) population grid
const mesh = JSON.parse(readFileSync(resolve(RAW, 'mesh/pop2020.json'), 'utf8')).map(([lat, lon, pop, ...codes]) => ({ lat, lon, pop, codes }));
// Meshes whose code is not a 2025 municipality — 福島県 浜通り pooled as 「07999」 in this dataset,
// 浜松市's pre-2024 wards — are placed by point-in-polygon on the current boundaries.
let relocated = 0;
for (const m of mesh) {
  if (m.codes.length && m.codes.every((c) => idxOf.has(c))) continue;
  const c = muniAt(project([m.lon, m.lat]));
  if (c) { m.codes = [c]; relocated++; }
}
console.log(`grid: ${relocated} meshes placed by point-in-polygon`);
const meshIdx = new GridIndex(mesh, 0.1);
const pop = Array(N).fill(0), sx = Array(N).fill(0), sy = Array(N).fill(0);
for (const m of mesh) {
  const share = m.pop / (m.codes.length || 1);
  for (const c of m.codes) {
    const i = idxOf.get(c);
    if (i === undefined) continue;
    pop[i] += share; sx[i] += share * m.lon; sy[i] += share * m.lat;
  }
}
const centre = MUNIS.map((m, i) => (pop[i] > 0 ? { lat: sy[i] / pop[i], lon: sx[i] / pop[i] } : inner.get(m.code) ?? null));
const popWithin = (q, r) => meshIdx.within(q, r).reduce((s, p) => s + p.pop, 0);
console.log(`grid: ${mesh.length} meshes; municipalities without grid population: ${pop.filter((v) => !v).length}`);

// ------------------------------------------------------------------ 2) interchanges
const joints = JSON.parse(readFileSync(resolve(RAW, '../geo/N06-24/UTF-8/N06-24_Joint.geojson'), 'utf8')).features
  .filter((f) => f.properties.N06_014 === 9999 && ['1', '2'].includes(f.properties.N06_019))
  .map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], n: f.properties.N06_018, smart: f.properties.N06_019 === '2' }));
const icIdx = new GridIndex(joints, 0.1);

// ------------------------------------------------------------------ 3) land prices (industrial = 用途区分 009)
function readGeojsonFromZip(zip, re) {
  const list = execFileSync('unzip', ['-Z1', zip]).toString().split('\n');
  const name = list.find((n) => re.test(n));
  if (!name) throw new Error(`${zip}: no ${re}`);
  return JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8'));
}
const land = [];
for (const [zip, f] of [['L01-26_GML.zip', { code: 'L01_001', use: 'L01_002', price: 'L01_008' }], ['L02-26_GML.zip', { code: 'L02_020', use: 'L02_001', price: 'L02_006' }]]) {
  const gj = readGeojsonFromZip(resolve(RAW, 'land', zip), /\.geojson$/);
  for (const ft of gj.features) {
    const p = ft.properties;
    if (String(p[f.use]).padStart(3, '0') !== '009') continue;
    const price = Number(p[f.price]);
    if (!(price > 0)) continue;
    land.push({ code: String(p[f.code]).padStart(5, '0'), price, lon: ft.geometry.coordinates[0], lat: ft.geometry.coordinates[1] });
  }
}
const landIdx = new GridIndex(land, 0.1);
const landByMuni = new Map();
for (const l of land) (landByMuni.get(l.code) ?? landByMuni.set(l.code, []).get(l.code)).push(l.price);
const landOwn = MUNIS.map((m) => median(landByMuni.get(m.code) ?? []));
const landVal = [], landEst = [];
MUNIS.forEach((m, i) => {
  if (Number.isFinite(landOwn[i])) { landVal.push(landOwn[i]); landEst.push(0); return; }
  const near = centre[i] ? landIdx.within(centre[i], 15).map((p) => p.price) : [];
  if (near.length >= 2) { landVal.push(median(near)); landEst.push(1); return; }
  landVal.push(NaN); landEst.push(2); // filled with the prefecture median below
});
const prefLand = Array.from({ length: 47 }, (_, k) => median(land.filter((l) => Number(l.code.slice(0, 2)) === k + 1).map((l) => l.price)));
// landEst: 0 = own points, 1 = median of points within 15 km, 2 = prefecture median
MUNIS.forEach((m, i) => { if (landEst[i] === 2) landVal[i] = prefLand[Number(m.code.slice(0, 2)) - 1]; });
console.log(`land: ${land.length} industrial points; own ${landEst.filter((e) => e === 0).length}, 15 km ${landEst.filter((e) => e === 1).length}, prefecture median ${landEst.filter((e) => e === 2).length}`);

// ------------------------------------------------------------------ helpers: city totals -> wards
/** designated city code of a ward (14131 -> 14130), by name prefix */
const cityOfWard = new Map();
for (const m of MUNIS) {
  const w = m.name.match(/^(.+?市)(.+区)$/);
  if (w) cityOfWard.set(m.code, w[1]);
}
/**
 * Values keyed by code for a statistical table that also has city-total rows (「22130_浜松市」):
 * municipalities missing from the table (wards created after the survey: 浜松市, 2024) get their
 * city's total spread by 2020 grid population.
 */
function assign(target, byCode, cityByName, label) {
  let spread = 0;
  const done = new Set();
  MUNIS.forEach((m, i) => {
    if (byCode.has(m.code)) { target[i] = byCode.get(m.code); return; }
    const city = cityOfWard.get(m.code);
    const key = `${m.code.slice(0, 2)}|${city}`;
    if (!city || done.has(key) || !cityByName.has(key)) return;
    done.add(key);
    spread += spreadToWards(target, city, m.code.slice(0, 2), cityByName.get(key), (_, j) => pop[j] || 1);
  });
  console.log(`${label}: ${byCode.size} codes, ${spread} wards spread from their city, missing ${target.filter((v) => !Number.isFinite(v)).length}`);
}
/** spread a value known for a whole designated city over its wards by `weight` */
function spreadToWards(values, cityName, prefCode, total, weight) {
  const wards = MUNIS.map((m, i) => ({ m, i })).filter(({ m }) => m.code.startsWith(prefCode) && cityOfWard.get(m.code) === cityName);
  const wsum = wards.reduce((s, { m, i }) => s + weight(m, i), 0) || 1;
  for (const { m, i } of wards) values[i] = total * (weight(m, i) / wsum);
  return wards.length;
}

// ------------------------------------------------------------------ 4) industrial zoning (ha)
const zoneHa = Array(N).fill(NaN);
{
  const wb = XLSX.read(readFileSync(resolve(RAW, 'land/toshikeikaku_R7.xls')), { type: 'buffer' });
  const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const head = a[2].map(norm);
  const cols = ['準工業地域', '工業地域', '工業専用地域'].map((h) => head.indexOf(h));
  if (cols.some((c) => c < 0)) throw new Error('zoning: header not found');
  const byName = new Map();
  for (const r of a.slice(17)) {
    const pref = norm(r[0]), name = norm(r[3]);
    if (!pref || !name || !/[市町村区]$/.test(name)) continue;
    const ha = cols.reduce((s, c) => s + (Number(r[c]) || 0), 0);
    const key = `${pref}|${name}`;
    byName.set(key, (byName.get(key) ?? 0) + ha);
  }
  const PREF_NAMES = topo.objects.pref.geometries.sort((x, y) => Number(x.id) - Number(y.id)).map((g) => g.properties.n);
  // municipalities inside a 都市計画区域 but with no 用途地域 have 0; outside any 都市計画区域 → 0 as well
  let matched = 0;
  const cityDone = new Set();
  MUNIS.forEach((m, i) => {
    const pref = PREF_NAMES[Number(m.code.slice(0, 2)) - 1];
    if (byName.has(`${pref}|${m.name}`)) { zoneHa[i] = byName.get(`${pref}|${m.name}`); matched++; return; }
    const city = cityOfWard.get(m.code);
    if (city && byName.has(`${pref}|${city}`) && !cityDone.has(`${pref}|${city}`)) {
      cityDone.add(`${pref}|${city}`);
      matched += spreadToWards(zoneHa, city, m.code.slice(0, 2), byName.get(`${pref}|${city}`), (mm) => areaKm2.get(mm.code) ?? 1);
      return;
    }
    if (!Number.isFinite(zoneHa[i])) zoneHa[i] = 0;
  });
  console.log(`zoning: ${byName.size} names in the table, matched ${matched}/${N} municipalities (others: no 用途地域 = 0)`);
}

// ------------------------------------------------------------------ 5) workers (residence) in 輸送・機械運転 + 運搬・清掃・包装
const workers = Array(N).fill(NaN);
{
  const wb = XLSX.read(readFileSync(resolve(RAW, 'census2020/000032214569.xlsx')), { type: 'buffer' });
  const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  // occupation = 「I_輸送・機械運転従事者」 + 「K_運搬・清掃・包装等従事者」 (letters of the 2020 classification)
  const occ = new Map(), cityByName = new Map();
  for (const r of a.slice(10)) {
    if (norm(r[0]) === '9' || norm(r[3]) !== '0_総数' || norm(r[4]) !== '0_総数') continue;
    const [code, name] = norm(r[2]).split('_');
    const o = norm(r[5]);
    if (!/^\d{5}$/.test(code) || !(/^I_/.test(o) || /^K_/.test(o))) continue;
    const v = (Number(r[6]) || 0) + (occ.get(code) ?? 0);
    occ.set(code, v);
    if (/市$/.test(name)) cityByName.set(`${code.slice(0, 2)}|${name}`, v);
  }
  assign(workers, occ, cityByName, 'workers (第12表)');
}

// ------------------------------------------------------------------ 6) logistics employees (道路貨物運送業 + 倉庫業, 2021)
const logi = Array(N).fill(NaN);
{
  const wb = XLSX.read(readFileSync(resolve(RAW, 'census2020/000040067885.xlsx')), { type: 'buffer' });
  const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const hr = a.findIndex((r) => r.some((v) => /^44_道路貨物運送業/.test(norm(v))));
  const c44 = a[hr].findIndex((v) => /^44_道路貨物運送業/.test(norm(v)));
  const c47 = a[hr].findIndex((v) => /^47_倉庫業/.test(norm(v)));
  const byCode = new Map(), cityByName = new Map();
  for (const r of a.slice(hr + 1)) {
    const [code, name] = norm(r[1]).split('_');
    if (!/^\d{5}$/.test(code) || norm(r[0]) === '9') continue;
    const v = (Number(r[c44]) || 0) + (Number(r[c47]) || 0);
    byCode.set(code, v);
    if (/市$/.test(name ?? '')) cityByName.set(`${code.slice(0, 2)}|${name}`, v);
  }
  assign(logi, byCode, cityByName, 'logistics employees (経済センサス)');
}

// ------------------------------------------------------------------ 7) radius sums from municipality centres
const muniPts = MUNIS.map((m, i) => ({ i, ...(centre[i] ?? { lat: NaN, lon: NaN }) })).filter((p) => Number.isFinite(p.lat));
const muniIdx = new GridIndex(muniPts, 0.2);
const sumWithin = (q, r, arr) => muniIdx.within(q, r).reduce((s, p) => s + (Number.isFinite(arr[p.i]) ? arr[p.i] : 0), 0);

// ------------------------------------------------------------------ 8) J-SHIS at the population centre (cached)
const jCacheFile = resolve(RAW, 'risk/jshis-cache.json');
mkdirSync(dirname(jCacheFile), { recursive: true });
const jCache = existsSync(jCacheFile) ? JSON.parse(readFileSync(jCacheFile, 'utf8')) : {};
async function jshis(lon, lat) {
  const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;
  if (key in jCache) return jCache[key];
  const url = `https://www.j-shis.bosai.go.jp/map/api/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson?position=${lon.toFixed(5)},${lat.toFixed(5)}&epsg=4326&attr=T30_I55_PS`;
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' } });
      if (r.status === 404) return (jCache[key] = null);
      if (r.ok) { const v = Number((await r.json()).features?.[0]?.properties?.T30_I55_PS); return (jCache[key] = Number.isFinite(v) ? v : null); }
    } catch { /* retry */ }
    await sleep(1000 * (t + 1));
  }
  return null;
}
const quake = Array(N).fill(NaN);
/** most populated mesh of each municipality: J-SHIS fallback when the centre lies on water */
const topMesh = Array(N).fill(null);
for (const m of mesh) for (const c of m.codes) {
  const i = idxOf.get(c);
  if (i !== undefined && (!topMesh[i] || m.pop > topMesh[i].pop)) topMesh[i] = m;
}
{
  let k = 0;
  const todo = MUNIS.map((_, i) => i).filter((i) => centre[i]);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (k < todo.length) {
      const i = todo[k++];
      let v = await jshis(centre[i].lon, centre[i].lat);
      if (v === null && topMesh[i]) v = await jshis(topMesh[i].lon, topMesh[i].lat); // e.g. 大津市: centre in Lake Biwa
      quake[i] = v === null ? NaN : v * 100;
      if (k % 300 === 0) writeFileSync(jCacheFile, JSON.stringify(jCache));
    }
  }));
  writeFileSync(jCacheFile, JSON.stringify(jCache));
}

// ------------------------------------------------------------------ assemble municipal table
const ic = [], icName = [], pop10 = [], pop30 = [], pop60 = [], pool30 = [], cluster20 = [];
MUNIS.forEach((m, i) => {
  const q = centre[i];
  if (!q) { ic.push(NaN); icName.push(''); pop10.push(NaN); pop30.push(NaN); pop60.push(NaN); pool30.push(NaN); cluster20.push(NaN); return; }
  const n = icIdx.nearest(q, 250);
  ic.push(n.d); icName.push(n.p?.n ?? '');
  pop10.push(popWithin(q, 10)); pop30.push(popWithin(q, 30)); pop60.push(popWithin(q, 60));
  pool30.push(sumWithin(q, 30, workers)); cluster20.push(sumWithin(q, 20, logi));
});

// ------------------------------------------------------------------ DPL catchments
const dpl = JSON.parse(readFileSync(resolve(root, 'public/data/dpl.json'), 'utf8')).sites;
const sites = {};
for (const s of dpl) {
  const q = { lat: s.lat, lon: s.lon };
  const n = icIdx.nearest(q, 250);
  const land10 = landIdx.within(q, 10).map((p) => p.price);
  sites[s.name] = {
    pop10: round(popWithin(q, 10)), pop30: round(popWithin(q, 30)), pop60: round(popWithin(q, 60)),
    ic: round(n.d, 1), icName: n.p?.n ?? null, icSmart: n.p?.smart || undefined,
    land10: round(median(land10)), land10n: land10.length,
    pool30: round(sumWithin(q, 30, workers)), cluster20: round(sumWithin(q, 20, logi)),
  };
}
const siteKeys = ['pop10', 'pop30', 'pop60', 'ic', 'land10', 'pool30', 'cluster20'];
const siteMedian = Object.fromEntries(siteKeys.map((k) => [k, round(median(Object.values(sites).map((x) => x[k] ?? NaN)), k === 'ic' ? 1 : 0)]));

const out = {
  generated: new Date().toISOString().slice(0, 10),
  codes: MUNIS.map((m) => m.code),
  m: {
    pop: pop.map((v) => round(v)), pop10: pop10.map((v) => round(v)), pop30: pop30.map((v) => round(v)), pop60: pop60.map((v) => round(v)),
    ic: ic.map((v) => round(v, 1)), icName,
    land: landVal.map((v) => round(v)), landEst,
    zone: zoneHa.map((v) => round(v, 1)),
    workers: workers.map((v) => round(v)), pool30: pool30.map((v) => round(v)),
    logi: logi.map((v) => round(v)), cluster20: cluster20.map((v) => round(v)),
    quake: quake.map((v) => round(v, 1)),
  },
  prefLand: prefLand.map((v) => round(v)),
  sites,
  siteMedian,
  sources: {
    mesh: { ja: '国土数値情報 1kmメッシュ別将来推計人口（R6国政局推計）の2020年国勢調査人口', en: 'MLIT 1 km mesh population (2020 census base, mesh1000r6)', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-mesh1000r6.html' },
    land: { ja: '国土数値情報 地価公示（2026年）・都道府県地価調査（2026年）の工業地', en: 'MLIT official land prices 2026 (L01, L02), industrial sites', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L01-2026.html' },
    zone: { ja: '国土交通省 都市計画現況調査（2025年3月31日現在）', en: 'MLIT city planning survey (31 Mar 2025)', url: 'https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000217.html' },
    workers: { ja: '令和2年国勢調査 従業地・通学地集計 第12表（常住地、輸送・機械運転従事者＋運搬・清掃・包装等従事者）', en: '2020 Census, occupation by residence (transport/machine operators + carrying/cleaning/packaging)', url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00200521' },
    logi: { ja: '令和3年経済センサス‐活動調査 第9-1B表（道路貨物運送業＋倉庫業の従業者）', en: '2021 Economic Census, employees in road freight + warehousing', url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00200553' },
    jshis: { ja: 'J-SHIS 確率論的地震動予測地図（防災科研、2024年版）', en: 'J-SHIS (NIED, 2024)', url: 'https://www.j-shis.bosai.go.jp/' },
    ic: { ja: '国土数値情報 高速道路時系列データ（N06, 2024年度）', en: 'MLIT N06 expressways (FY2024)', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N06-2024.html' },
  },
};
writeFileSync(resolve(root, 'public/data/muni.json'), JSON.stringify(out));
const show = (code) => { const i = idxOf.get(code); return `${MUNIS[i].name}: pop ${round(pop[i])}, 30km ${round(pop30[i] / 1e6, 2)}M, IC ${round(ic[i], 1)}km (${icName[i]}), land ${round(landVal[i])}${landEst[i] ? '*' : ''}, zone ${round(zoneHa[i])}ha, workers ${round(workers[i])}, logi ${round(logi[i])}, quake ${round(quake[i], 1)}%`; };
for (const c of ['11203', '12207', '23206', '14131', '01101', '22138']) console.log(' ', show(c));
console.log('DPL median', siteMedian);
