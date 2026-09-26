// Hazard exposure of the 1 km population grid -> data/raw/mesh/hazard.json (read by etl-muni)
//
//   node scripts/etl-hazard.mjs          (needs data/raw/mesh/pop2020.json from etl-mesh)
//
// Each populated 1 km mesh is sampled on a 4×4 grid (≈ 250 m apart) against the ハザードマップポータル
// open-data PNG tiles at zoom 12 (≈ 31 m per pixel at 35°N). A mesh scores 0–16 per layer, i.e. the
// share of its area inside the zone; etl-muni weights that by population per municipality.
//   flood   洪水浸水想定区域（想定最大規模）, depth 0.5 m or more
//   flood3  the same, 3 m or more (above the floor of a typical warehouse's ground storey)
//   surge   高潮浸水想定区域, 0.5 m or more
//   tsunami 津波浸水想定, any depth
//   sabo    土砂災害警戒区域 (土石流・急傾斜地の崩壊・地すべり), any
// Tiles are cached in data/raw/hazard/ (not committed). Terms:
// https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/hazard');
mkdirSync(RAW, { recursive: true });
const Z = 12, N = 2 ** Z;
const UA = { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// legend of the 想定最大規模 flood and storm-surge depth tiles
const DEPTH = [[247, 245, 169, 1], [255, 216, 192, 2], [255, 183, 183, 3], [255, 145, 145, 4], [242, 133, 201, 5], [220, 122, 220, 6]];
const rank = (r, g, b) => {
  let best = 0, bd = Infinity;
  for (const [R, G, B, k] of DEPTH) { const d = (R - r) ** 2 + (G - g) ** 2 + (B - b) ** 2; if (d < bd) { bd = d; best = k; } }
  return best;
};
// layer -> tile sets and a pixel test
const LAYERS = [
  { key: 'flood', tiles: ['01_flood_l2_shinsuishin_data'], hit: (r, g, b) => rank(r, g, b) >= 2 },
  { key: 'flood3', tiles: ['01_flood_l2_shinsuishin_data'], hit: (r, g, b) => rank(r, g, b) >= 3 },
  { key: 'surge', tiles: ['03_hightide_l2_shinsuishin_data'], hit: (r, g, b) => rank(r, g, b) >= 2 },
  { key: 'tsunami', tiles: ['04_tsunami_newlegend_data'], hit: () => true },
  { key: 'sabo', tiles: ['05_dosekiryukeikaikuiki', '05_kyukeishakeikaikuiki', '05_jisuberikeikaikuiki'], hit: () => true },
];

const missFile = resolve(RAW, 'missing.json');
const missing = new Set(existsSync(missFile) ? JSON.parse(readFileSync(missFile, 'utf8')) : []);
async function tile(key) {
  if (missing.has(key)) return null;
  const file = resolve(RAW, key.replace(/\//g, '_') + '.png');
  if (!existsSync(file)) {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`https://disaportaldata.gsi.go.jp/raster/${key}.png`, { headers: UA });
        if (r.status === 404) { missing.add(key); return null; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        break;
      } catch (e) {
        if (i === 3) throw new Error(`${key}: ${e.message}`);
        await sleep(2000 * (i + 1));
      }
    }
  }
  try { return PNG.sync.read(readFileSync(file)); } catch { return null; }
}

// rows: [lat, lon, pop2020, …] — lat/lon is the mesh centre (etl-mesh)
const mesh = JSON.parse(readFileSync(resolve(root, 'data/raw/mesh/pop2020.json'), 'utf8'));
// sample points grouped by tile: tile "x/y" -> [meshIndex, pixelX, pixelY][]
const byTile = new Map();
const OFF = [-0.375, -0.125, 0.125, 0.375];
mesh.forEach((m, i) => {
  if (!(m[2] > 0)) return;
  for (const oy of OFF) for (const ox of OFF) {
    const lat = m[0] + oy * (30 / 3600), lon = m[1] + ox * (45 / 3600);
    const fx = ((lon + 180) / 360) * N;
    const s = Math.sin((lat * Math.PI) / 180);
    const fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N;
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const k = `${tx}/${ty}`;
    if (!byTile.has(k)) byTile.set(k, []);
    byTile.get(k).push([i, Math.floor((fx - tx) * 256), Math.floor((fy - ty) * 256)]);
  }
});
console.log(`${mesh.length} meshes, ${byTile.size} tiles per layer at zoom ${Z}`);

const counts = LAYERS.map(() => new Uint8Array(mesh.length));
const tileKeys = [...byTile.keys()];
for (const [li, L] of LAYERS.entries()) {
  // a sample counts once even when several tile sets (the three 土砂 zone types) cover it
  const hitSet = new Set();
  for (const set of L.tiles) {
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (next < tileKeys.length) {
        const k = tileKeys[next++];
        const png = await tile(`${set}/${Z}/${k}`);
        if (png) {
          const pts = byTile.get(k);
          pts.forEach(([i, px, py], j) => {
            const o = (py * 256 + px) * 4;
            if (png.data[o + 3] >= 128 && L.hit(png.data[o], png.data[o + 1], png.data[o + 2])) hitSet.add(`${k}#${j}`);
          });
        }
        if (++done % 1000 === 0) {
          writeFileSync(missFile, JSON.stringify([...missing]));
          process.stdout.write(`  ${L.key} ${set}: ${done}/${tileKeys.length}\n`);
        }
      }
    }));
  }
  for (const id of hitSet) {
    const [k, j] = id.split('#');
    counts[li][byTile.get(k)[Number(j)][0]]++;
  }
  writeFileSync(missFile, JSON.stringify([...missing]));
  const pop = mesh.reduce((s, m, i) => s + (m[2] || 0) * counts[li][i] / 16, 0);
  console.log(`${L.key}: ${(pop / 1e6).toFixed(2)} M people inside (${((pop / 126.1e6) * 100).toFixed(1)}%)`);
}

writeFileSync(resolve(root, 'data/raw/mesh/hazard.json'), JSON.stringify({
  note: 'per mesh of pop2020.json (same order): samples of 16 inside each zone',
  generated: new Date().toISOString().slice(0, 10),
  layers: LAYERS.map((l) => l.key),
  rows: mesh.map((_, i) => LAYERS.map((__, li) => counts[li][i])),
}));
console.log('wrote data/raw/mesh/hazard.json');
