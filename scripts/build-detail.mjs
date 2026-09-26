// Detailed municipal boundaries for close zoom -> public/geo/detail/<pref>.json (TopoJSON, one per prefecture).
// The overview map (japan.topo.json) is simplified to 180 m; street-level zoom needs a few metres, so the same
// N03 polygons are simplified lightly here and loaded only for the prefectures on screen.
//
//   node scripts/build-detail.mjs [path/to/N03-YYYYMMDD.shp] [interval_m]
//
// Coordinates are laid out exactly like the overview (scripts/lib/project.mjs: LCC + Okinawa / Ogasawara insets).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project } from './lib/project.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, process.argv[2] ?? 'data/geo/N03-20260101.shp');
const interval = Number(process.argv[3] ?? 5);
const N06 = resolve(root, 'data/geo/N06-25/N06-25_GML/UTF-8/N06-25_HighwaySection.geojson');
const TMP = resolve(root, 'data/geo/tmp/detail'), OUT = resolve(root, 'public/geo/detail');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
const mapshaper = (args) => execFileSync(resolve(root, 'node_modules/.bin/mapshaper-xl'), ['-quiet', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

// 1) one feature per municipality, lightly simplified, split by prefecture (lon/lat)
mapshaper([
  '-i', src, 'encoding=utf8',
  '-rename-fields', 'code=N03_007',
  '-filter', 'code && !code.endsWith("000")',
  '-dissolve', 'code',
  '-filter-islands', 'min-area=500m2', 'remove-empty',
  '-simplify', 'dp', `interval=${interval}`, 'keep-shapes',
  '-each', 'pref=code.slice(0,2)',
  '-split', 'pref',
  '-o', `${TMP}/`, 'format=geojson', 'precision=0.0000001', 'force',
]);

// 2) expressways in service, same light simplification; later cut into short pieces and handed to every
//    prefecture whose box they touch (roads.json for the overview is simplified to 120 m)
execFileSync(resolve(root, 'node_modules/.bin/mapshaper'), ['-quiet', '-i', N06,
  '-filter', 'N06_003 === 9999',
  '-each', 'kind=Number(N06_008)',
  '-dissolve', 'kind',
  '-simplify', 'dp', `interval=${interval}`, 'keep-shapes',
  '-o', `${TMP}/roads.geojson`, 'format=geojson', 'precision=0.0000001', 'force'], { stdio: ['ignore', 'ignore', 'inherit'] });
const pieces = [];
for (const f of JSON.parse(readFileSync(`${TMP}/roads.geojson`, 'utf8')).features) {
  if (!f.geometry) continue;
  const t = f.properties.kind === 5 ? 3 : f.properties.kind === 1 || f.properties.kind === 4 ? 1 : 2;
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const part of parts) {
    const xy = part.map((c) => project(c).map(Math.round));
    for (let i = 0; i < xy.length - 1; i += 40) pieces.push({ t, xy: xy.slice(i, i + 41) });
  }
}

// 3) project each prefecture into the map's planar space, then build a TopoJSON (shared borders)
const bytes = {};
for (const f of readdirSync(TMP).filter((n) => /\d\d\.json$/.test(n)).sort()) {
  const pc = f.match(/(\d\d)\.json$/)[1];
  const gj = JSON.parse(readFileSync(resolve(TMP, f), 'utf8'));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ft of gj.features) {
    const g = ft.geometry;
    if (!g) continue;
    let polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    // Ogasawara village: only the Bonin group is on the map (as in build-geo.mjs)
    if (ft.properties.code === '13421') polys = polys.filter((p) => p[0].some(([, lat]) => lat > 26 && lat < 28));
    ft.geometry = { type: 'MultiPolygon', coordinates: polys.map((p) => p.map((ring) => ring.map((c) => {
      const [x, y] = project(c);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      return [Math.round(x), Math.round(y)];
    }))) };
    ft.properties = { code: ft.properties.code };
  }
  writeFileSync(resolve(TMP, `p${pc}.geojson`), JSON.stringify(gj));
  // ~1 m steps
  const q = Math.ceil(Math.max(x1 - x0, y1 - y0));
  mapshaper(['-i', resolve(TMP, `p${pc}.geojson`), 'name=muni', '-each', 'this.id = code', '-o', resolve(OUT, `${pc}.json`), 'format=topojson', `quantization=${q}`, 'id-field=code', 'force']);
  // roads touching the prefecture's box (+2 km): [class, x0, y0, dx1, dy1, …] in metres
  const topo = JSON.parse(readFileSync(resolve(OUT, `${pc}.json`), 'utf8'));
  const m = 2000;
  topo.roads = pieces.filter((r) => r.xy.some(([x, y]) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m)).map((r) => {
    const out = [r.t, r.xy[0][0], r.xy[0][1]];
    for (let i = 1; i < r.xy.length; i++) out.push(r.xy[i][0] - r.xy[i - 1][0], r.xy[i][1] - r.xy[i - 1][1]);
    return out;
  });
  writeFileSync(resolve(OUT, `${pc}.json`), JSON.stringify(topo));
  bytes[pc] = statSync(resolve(OUT, `${pc}.json`)).size;
  console.log(`${pc}: ${(bytes[pc] / 1024).toFixed(0)} KB`);
}
writeFileSync(resolve(OUT, 'index.json'), JSON.stringify({ interval, bytes }));
rmSync(TMP, { recursive: true, force: true });
