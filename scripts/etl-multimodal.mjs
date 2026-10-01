// Multimodal freight infrastructure -> public/data/multimodal.json
//
//   node scripts/etl-multimodal.mjs                  airports only (commercial use allowed)
//   node scripts/etl-multimodal.mjs --noncommercial  + ports and rail freight stations
//
// Airports: 国土数値情報 C28 (2021, 商用可) points + MLIT 航空局「空港管理状況調書」 2025 cargo
//   (data/raw/multimodal/C28-21_GML.zip, airport_R7.xlsx from https://www.mlit.go.jp/koku/15_bf_000185.html).
// Ports and rail freight stations exist as official points only in 国土数値情報 C02 (2014) and P31
// (2013), both licensed for NON-COMMERCIAL use. They are left out unless --noncommercial is given
// (only for a non-commercial deployment). Port cargo / TEU 2025: e-Stat 港湾統計（港別集計値）
// statInfId 000040251292 (government standard terms), joined on prefecture + port name.
// Ports and stations reach the browser only as picture tiles (public/tiles/hubs): multimodal.json keeps their names and
// statistics but no coordinates (国土情報提供サイト運営事務局, 2026-10: data the viewer can download may count as
// redistribution). Their positions stay in data/geo/hubs-nc.json for the road network build (not published).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { project, r10 } from './lib/project.mjs';
import { GridIndex } from './lib/geo-ll.mjs';
import { renderTiles } from './lib/raster-tiles.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/multimodal');
const NONCOMMERCIAL = process.argv.includes('--noncommercial');
const mapshaper = resolve(root, 'node_modules/.bin/mapshaper');
const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');
mkdirSync(RAW, { recursive: true });

function shpToJson(zip, re, dir) {
  const out = resolve(RAW, dir);
  if (!existsSync(out)) execFileSync('unzip', ['-q', '-o', resolve(RAW, zip), '-d', out]);
  const shp = execFileSync('find', [out, '-path', '*UTF-8*', '-name', '*.shp']).toString().split('\n').find((f) => re.test(f))
    ?? execFileSync('find', [out, '-name', '*.shp']).toString().split('\n').find((f) => re.test(f));
  if (!shp) throw new Error(`${zip}: no ${re}`);
  const enc = /UTF-8/.test(shp) ? 'utf8' : 'shiftjis';
  const json = resolve(RAW, `${dir}.json`);
  execFileSync(mapshaper, ['-i', shp, `encoding=${enc}`, '-o', json, 'format=geojson', 'force'], { stdio: 'ignore' });
  return JSON.parse(readFileSync(json, 'utf8')).features;
}

const items = [];

// ------------------------------------------------------------------ airports
{
  const polys = shpToJson('C28-21_GML.zip', /C28-21_Airport\.shp$/, 'c28a');
  const points = new Map(shpToJson('C28-21_GML.zip', /AirportReferencePoint\.shp$/, 'c28p').map((f) => [f.properties.C28_000, f.geometry.coordinates]));
  // cargo 2025: block header 「空港名：成田国際（会社管理）」, calendar-year row 「成田暦２」: C..E international, F..H domestic, I total (t)
  const wb = XLSX.read(readFileSync(resolve(RAW, 'airport_R7.xlsx')), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['空港管理状況調書'], { header: 1, defval: '' });
  const cargo = new Map();
  let cur = null;
  for (const r of rows) {
    if (/^空港名[:：]$/.test(norm(r[1]))) cur = norm(r[2]).replace(/[（(].*$/, '');
    if (cur && /暦[２2]$/.test(norm(r[0]))) { cargo.set(cur, { intl: Number(r[4]) || 0, total: Number(r[8]) || 0 }); cur = null; }
  }
  const key = (s) => norm(s).replace(/空港$/, '').replace(/国際$/, '').replace(/飛行場$/, '').replace(/^新石垣$/, '石垣');
  const byKey = new Map([...cargo].map(([k, v]) => [key(k), v]));
  const CLS = { 1: '会社管理', 2: '国管理', 3: '特定地方管理', 4: '地方管理', 5: 'その他', 6: '共用' };
  const seen = new Set();
  for (const f of polys) {
    const p = f.properties;
    if (p.C28_004 !== '供用中') continue;
    const name = norm(p.C28_005);
    if (seen.has(name) || /\(.*地区\)$/.test(name)) continue; // secondary polygons such as 福岡空港(奈多地区)
    seen.add(name);
    const ll = points.get(String(p.C28_101).split(',')[0].replace(/^#/, ''));
    if (!ll) continue;
    const c = byKey.get(key(name));
    items.push({ kind: 'air', name, cls: CLS[p.C28_003] ?? '', t: c?.total ?? null, intl: c?.intl ?? null,
                 lat: +ll[1].toFixed(5), lon: +ll[0].toFixed(5), p: r10(project(ll)) });
  }
}

// ------------------------------------------------------------------ ports (non-commercial source)
if (NONCOMMERCIAL) {
  const ports = shpToJson('C02-14_GML.zip', /PortAndHarbor\.shp$/, 'c02');
  const wb = XLSX.read(readFileSync(resolve(RAW, 'port_2025.xlsx')), { type: 'buffer' });
  const sumSheet = (name, hasKind) => {
    const a = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const h = a.findIndex((r) => norm(r[0]) === '都道府県');
    const cols = a[h].map((v, c) => (norm(v) === '合計' ? c : -1)).filter((c) => c >= 0);
    const out = new Map();
    let pref = '';
    for (const r of a.slice(h + 1)) {
      if (norm(r[0])) pref = norm(r[0]);
      const port = norm(r[2]);
      if (!port || (hasKind && norm(r[3]) !== '計')) continue;
      out.set(`${pref}|${port}`, cols.reduce((s, c) => s + (Number(r[c]) || 0), 0));
    }
    return out;
  };
  const tons = sumSheet('海上出入貨物', true), teu = sumSheet('コンテナ個数', false);
  const PREF = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟', '富山', '石川',
    '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根', '岡山', '広島', '山口', '徳島',
    '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];
  const prefKey = (s) => { const x = norm(s).replace(/[都府県]$/, ''); return x === '北海道' ? x : x; };
  const lookup = (m, prefCode, name) => {
    for (const [k, v] of m) { const [pp, nn] = k.split('|'); if (prefKey(pp) === PREF[prefCode - 1] && nn.replace(/港$/, '') === name) return v; }
    return null;
  };
  const CLS = { 11: '国際戦略港湾', 12: '国際拠点港湾', 13: '重要港湾' };
  for (const f of ports) {
    const p = f.properties;
    if (!CLS[p.C02_002]) continue; // 地方港湾 / 56条港湾 are left out
    const ll = f.geometry.coordinates, pc = Number(String(p.C02_003).slice(0, 2));
    items.push({ kind: 'port', name: `${norm(p.C02_005)}港`, cls: CLS[p.C02_002], t: lookup(tons, pc, norm(p.C02_005)), teu: lookup(teu, pc, norm(p.C02_005)),
                 lat: +ll[1].toFixed(5), lon: +ll[0].toFixed(5), p: r10(project(ll)) });
  }
  // rail freight stations: P31 class 31 (一般貨物駅) and 33 (オフレールステーション)
  const p31 = JSON.parse(readFileSync(resolve(RAW, 'p31_all.geojson'), 'utf8')).features;
  for (const f of p31) {
    const c = Number(f.properties.P31_003);
    if (c !== 31 && c !== 33) continue;
    const ll = f.geometry.coordinates;
    items.push({ kind: 'rail', name: norm(f.properties.P31_001), cls: c === 31 ? '貨物駅' : 'オフレールステーション', t: null,
                 lat: +ll[1].toFixed(5), lon: +ll[0].toFixed(5), p: r10(project(ll)) });
  }
}

// ------------------------------------------------------------------ nearest airport / port to each DPL site
const dpl = JSON.parse(readFileSync(resolve(root, 'public/data/dpl.json'), 'utf8')).sites;
const idx = (kind, minT) => new GridIndex(items.filter((x) => x.kind === kind && (minT === 0 || (x.t ?? 0) >= minT)), 0.2);
const cargoAir = idx('air', 1000), bigPort = NONCOMMERCIAL ? idx('port', 0) : null;
const sites = {};
for (const s of dpl) {
  const a = cargoAir.nearest({ lat: s.lat, lon: s.lon }, 800);
  const b = bigPort?.nearest({ lat: s.lat, lon: s.lon }, 800);
  sites[s.name] = {
    air: a.p ? { n: a.p.name, km: Math.round(a.d * 10) / 10 } : null,
    ...(b?.p ? { port: { n: b.p.name, km: Math.round(b.d * 10) / 10 } } : {}),
  };
}

// 非商用 positions: tiles for the map, a private copy for build-network.mjs
const nc = items.filter((x) => x.kind !== 'air');
mkdirSync(resolve(root, 'data/geo'), { recursive: true });
writeFileSync(resolve(root, 'data/geo/hubs-nc.json'), JSON.stringify(nc.map(({ kind, name, lon, lat }) => ({ kind, name, lon, lat }))));
const TILES = resolve(root, 'public/tiles/hubs');
if (nc.length) {
  const maxPort = Math.max(1, ...nc.filter((x) => x.kind === 'port').map((x) => x.t ?? 0));
  // the vector markers' sizes (App.svelte hubPois), a little smaller when zoomed far out
  const scale = (z) => (z <= 6 ? 0.7 : z <= 8 ? 0.85 : 1);
  const { files, bytes } = await renderTiles({ out: TILES, zooms: [5, 16], palette: ['#2e5f6e', '#ffffff', '#97afb6'],
    points: nc.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).map((x) => ({ lon: x.lon, lat: x.lat, kind: x.kind, color: '#2e5f6e',
      minZ: x.kind === 'rail' ? 7 : 5,
      r: (z) => scale(z) * (x.kind === 'rail' ? 4 : 4 + 7 * Math.sqrt((x.t ?? 0) / maxPort)) })) });
  console.log(`hub tiles: ${files} files, ${(bytes / 1024).toFixed(0)} KB`);
} else rmSync(TILES, { recursive: true, force: true });

writeFileSync(resolve(root, 'public/data/multimodal.json'), JSON.stringify({
  noncommercial: NONCOMMERCIAL,
  items: items.map((x) => (x.kind === 'air' ? x : { kind: x.kind, name: x.name, cls: x.cls, t: x.t, ...(x.teu !== undefined ? { teu: x.teu } : {}) })),
  sites,
  sources: {
    air: { ja: '国土数値情報 空港データ（C28, 2021年）、国土交通省航空局「空港管理状況調書」（2025年）', en: 'MLIT airports (C28, 2021); Civil Aviation Bureau airport statistics (2025)', url: 'https://www.mlit.go.jp/koku/15_bf_000185.html' },
    ...(NONCOMMERCIAL ? {
      port: { ja: '国土数値情報 港湾データ（C02, 2014年・非商用）、港湾統計（港別集計値, 2025年）', en: 'MLIT ports (C02, 2014, non-commercial); port statistics 2025', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C02-2014.html' },
      rail: { ja: '国土数値情報 物流拠点（P31, 2013年・非商用）', en: 'MLIT logistics hubs (P31, 2013, non-commercial)', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P31.html' },
    } : {}),
  },
  generated: new Date().toISOString().slice(0, 10),
}));
const by = (k) => items.filter((x) => x.kind === k);
console.log(`multimodal.json: ${by('air').length} airports (${by('air').filter((x) => x.t).length} with cargo)` +
  (NONCOMMERCIAL ? `, ${by('port').length} ports (${by('port').filter((x) => x.t).length} with cargo), ${by('rail').length} rail stations` : ' — ports/rail skipped (non-commercial sources)'));
for (const n of ['成田国際空港', '東京国際空港', '関西国際空港', '東京港', '横浜港', '名古屋港']) {
  const x = items.find((i) => i.name === n);
  if (x) console.log(' ', n, x.cls, x.t, x.teu ?? '');
}
