// Natural-hazard indicators -> public/data/risk.json (criteria for the site score + DPL site checks)
//
//   node scripts/etl-risk.mjs          (needs data/geo/tmp/muni.json from `npm run geo`)
//
// 1. Earthquake — J-SHIS 確率論的地震動予測地図 (NIED, version Y2024), 30-year probability of
//    seismic intensity 6-lower or more (T30_I55_PS). J-SHIS answers per 250 m mesh, and values
//    swing with local ground (Mito: 48% at the prefectural office, 81% at the city hall), so a
//    prefecture gets the MEDIAN over the centroids of all its municipalities ("the typical
//    municipality"). Raw API answers are cached in data/raw/risk/ (not committed: the J-SHIS terms
//    forbid redistributing the raw data as is — only derived figures are published).
// 2. Sediment disasters — MLIT 砂防部 「土砂災害警戒区域等の指定状況」, snapshot in
//    data/risk/sabo.csv (the source is an encrypted PDF; update the CSV by hand), per km².
// 3. Flood damage — MLIT 水害統計 表-2, mean over the years in data/risk/suigai.json, per km².
// 4. DPL sites — J-SHIS at the site, plus flood (想定最大規模) and storm-surge depth ranks read
//    from the ハザードマップポータル open-data PNG tiles at zoom 16.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/risk');
mkdirSync(RAW, { recursive: true });
const topoMeta = JSON.parse(readFileSync(resolve(root, 'public/geo/japan.topo.json'), 'utf8')).meta;
const prefStats = JSON.parse(readFileSync(resolve(root, 'public/geo/prefstats.json'), 'utf8'));
const UA = { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ------------------------------------------------------------------ helpers: cached HTTP
const cacheFile = resolve(RAW, 'jshis-cache.json');
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
async function jshis(lon, lat) {
  const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;
  if (key in cache) return cache[key];
  const url = `https://www.j-shis.bosai.go.jp/map/api/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson?position=${lon.toFixed(5)},${lat.toFixed(5)}&epsg=4326&attr=T30_I55_PS`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 404) return (cache[key] = null); // outside the J-SHIS mesh (e.g. 北方領土)
      if (r.ok) {
        const j = await r.json();
        const v = Number(j.features?.[0]?.properties?.T30_I55_PS);
        return (cache[key] = Number.isFinite(v) ? v : null); // null: sea / outside the mesh
      }
    } catch { /* retry */ }
    await sleep(1000 * (i + 1));
  }
  throw new Error(`J-SHIS failed for ${key}`);
}
/** run `fn` over items with a small concurrency, saving the cache now and then */
async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const it = items[i++];
      await fn(it);
      if (++done % 200 === 0) { writeFileSync(cacheFile, JSON.stringify(cache)); process.stdout.write(`  ${done}/${items.length}\n`); }
    }
  }));
  writeFileSync(cacheFile, JSON.stringify(cache));
}

// ------------------------------------------------------------------ 1) earthquake by prefecture
const tmp = resolve(root, 'data/geo/tmp');
execFileSync(resolve(root, 'node_modules/.bin/mapshaper'), [
  '-i', `${tmp}/muni.json`, '-points', 'inner', '-o', `${tmp}/muni-points.json`, 'format=geojson', 'force',
], { stdio: 'inherit' });
const toLonLat = proj4(topoMeta.proj, 'EPSG:4326');
const munis = JSON.parse(readFileSync(`${tmp}/muni-points.json`, 'utf8')).features
  .filter((f) => f.geometry && !String(f.properties.code).endsWith('000'))
  .map((f) => ({ code: String(f.properties.code), ll: toLonLat.forward(f.geometry.coordinates) }));
console.log(`J-SHIS: ${munis.length} municipality points`);
await pool(munis, 4, async (m) => { m.p = await jshis(m.ll[0], m.ll[1]); });
const quake = Array.from({ length: 47 }, (_, i) => median(munis.filter((m) => Number(m.code.slice(0, 2)) === i + 1 && m.p !== null).map((m) => m.p * 100)));

// ------------------------------------------------------------------ 2) sediment-disaster zones
const saboRows = readFileSync(resolve(root, 'data/risk/sabo.csv'), 'utf8').trim().split('\n');
const saboMeta = JSON.parse(readFileSync(resolve(root, 'data/risk/sabo.meta.json'), 'utf8'));
const saboHead = saboRows[0].split(',');
const sabo = Array(47).fill(NaN);
const PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県',
  '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県',
  '宮崎県', '鹿児島県', '沖縄県'];
for (const line of saboRows.slice(1)) {
  const r = line.split(',');
  const i = PREFS.indexOf(r[0]);
  if (i >= 0) sabo[i] = Number(r[saboHead.indexOf('total')]) / prefStats.area[i];
}
if (sabo.some((v) => !Number.isFinite(v))) throw new Error('sabo.csv: missing prefectures');

// ------------------------------------------------------------------ 3) flood damage (optional until the years are in)
const suigaiFile = resolve(root, 'data/risk/suigai.json');
const suigai = existsSync(suigaiFile) ? JSON.parse(readFileSync(suigaiFile, 'utf8')) : null;
const flood = suigai
  ? Array.from({ length: 47 }, (_, i) => (suigai.years.reduce((s, y) => s + y.total[i], 0) / suigai.years.length) / prefStats.area[i])
  : null;

// ------------------------------------------------------------------ 4) DPL sites
// ハザードマップポータル tiles: colour -> depth rank (legend of 想定最大規模 flood; storm surge uses the same)
const DEPTH = [
  { rgb: [247, 245, 169], rank: 1, ja: '0.5m未満', en: '< 0.5 m' },
  { rgb: [255, 216, 192], rank: 2, ja: '0.5〜3m', en: '0.5–3 m' },
  { rgb: [255, 183, 183], rank: 3, ja: '3〜5m', en: '3–5 m' },
  { rgb: [255, 145, 145], rank: 4, ja: '5〜10m', en: '5–10 m' },
  { rgb: [242, 133, 201], rank: 5, ja: '10〜20m', en: '10–20 m' },
  { rgb: [220, 122, 220], rank: 6, ja: '20m以上', en: '≥ 20 m' },
];
const tileCache = new Map();
async function tile(layer, z, x, y) {
  const key = `${layer}/${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const file = resolve(RAW, `tile_${key.replace(/\//g, '_')}.png`);
  let buf = null;
  if (existsSync(file)) buf = readFileSync(file);
  else if (!existsSync(file + '.404')) {
    const r = await fetch(`https://disaportaldata.gsi.go.jp/raster/${key}.png`, { headers: UA });
    if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); writeFileSync(file, buf); }
    else writeFileSync(file + '.404', '');
    await sleep(150);
  }
  const png = buf ? PNG.sync.read(buf) : null;
  tileCache.set(key, png);
  return png;
}
/** deepest depth rank in a 5×5 pixel window around the point (0 = none) */
async function depthAt(layer, lon, lat, z = 16) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await tile(layer, z, tx, ty);
  if (!png) return 0;
  const px = Math.floor((fx - tx) * 256), py = Math.floor((fy - ty) * 256);
  let best = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = px + dx, y = py + dy;
    if (x < 0 || y < 0 || x > 255 || y > 255) continue;
    const o = (y * 256 + x) * 4;
    if (png.data[o + 3] < 128) continue;
    const c = [png.data[o], png.data[o + 1], png.data[o + 2]];
    const hit = DEPTH.find((d) => d.rgb.every((v, k) => Math.abs(v - c[k]) <= 6));
    if (hit && hit.rank > best) best = hit.rank;
  }
  return best;
}
const dpl = JSON.parse(readFileSync(resolve(root, 'public/data/dpl.json'), 'utf8')).sites;
const sites = {};
await pool(dpl, 3, async (s) => {
  const q = await jshis(s.lon, s.lat);
  sites[s.name] = {
    quake: q === null ? null : Math.round(q * 1000) / 10,
    flood: await depthAt('01_flood_l2_shinsuishin_data', s.lon, s.lat),
    surge: await depthAt('03_hightide_l2_shinsuishin_data', s.lon, s.lat),
  };
});

// ------------------------------------------------------------------ write
const jshisSrc = { ja: 'J-SHIS 確率論的地震動予測地図（防災科学技術研究所、2024年版）', en: 'J-SHIS probabilistic seismic hazard map (NIED, 2024)' };
const criteria = [
  { key: 'quake', ja: '地震リスク', en: 'Earthquake risk', group: 'risk', dir: -1, digits: 0, unit: { ja: '%', en: '%' },
    raw: quake.map((v) => Math.round(v * 10) / 10),
    hint: { ja: '今後30年に震度6弱以上の確率（市区町村の中央値）', en: 'Chance of intensity 6-lower+ within 30 years (median municipality)' },
    source: jshisSrc },
  { key: 'sediment', ja: '土砂災害リスク', en: 'Landslide risk', group: 'risk', dir: -1, digits: 1, unit: { ja: '区域/㎢', en: ' zones/km²' },
    raw: sabo.map((v) => Math.round(v * 100) / 100),
    hint: { ja: '土砂災害警戒区域の数（面積あたり）', en: 'Designated landslide-warning zones per km²' },
    source: { ja: `国土交通省 土砂災害警戒区域等の指定状況（${saboMeta.asOf}時点）`, en: `MLIT landslide-warning zones (as of ${saboMeta.asOf})` } },
  ...(flood ? [{ key: 'flood', ja: '水害リスク', en: 'Flood risk', group: 'risk', dir: -1, digits: 1, unit: { ja: '百万円/㎢', en: ' ¥m/km²' },
    raw: flood.map((v) => Math.round(v * 100) / 100),
    hint: { ja: `水害被害額の年平均（${suigai.years[0].year}〜${suigai.years.at(-1).year}年、面積あたり）`, en: `Mean annual flood damage ${suigai.years[0].year}–${suigai.years.at(-1).year}, per km²` },
    source: { ja: '国土交通省 水害統計調査（表-2 都道府県別水害被害）', en: 'MLIT flood damage statistics (table 2)' } }] : []),
];
writeFileSync(resolve(root, 'public/data/risk.json'), JSON.stringify({
  criteria,
  sites,
  depthLegend: DEPTH.map(({ rank, ja, en }) => ({ rank, ja, en })),
  sources: {
    jshis: { ...jshisSrc, url: 'https://www.j-shis.bosai.go.jp/', terms: 'https://www.j-shis.bosai.go.jp/agreement' },
    sabo: { ja: '国土交通省 砂防部', en: 'MLIT Sabo Dept.', url: saboMeta.url },
    suigai: suigai ? { ja: '国土交通省 水害統計調査', en: 'MLIT flood damage statistics', url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00600590' } : null,
    hazardmap: { ja: 'ハザードマップポータルサイト（国土交通省）', en: 'Hazard Map Portal (MLIT)', url: 'https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html' },
  },
  generated: new Date().toISOString().slice(0, 10),
}));
const show = (c) => [13, 11, 23].map((k) => `${k}:${c.raw[k - 1]}`).join(' ');
console.log('risk.json:', criteria.map((c) => `${c.key} [${show(c)}]`).join('; '), `| ${Object.keys(sites).length} DPL sites`);
