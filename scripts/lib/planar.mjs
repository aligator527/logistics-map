// Planar geometry on the pre-projected TopoJSON (metres, Lambert conformal conic): point in
// polygon and polygon area. The map's projection is conformal, not equal-area, but its scale
// error within Japan is well under 1%, which is plenty for densities per 1,000 km².
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const topo = JSON.parse(readFileSync(resolve(root, 'public/geo/japan.topo.json'), 'utf8'));

const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (p, poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h));
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a) / 2; };

const polyArea = (ps) => ps.reduce((s, p) => s + ringArea(p[0]) - p.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);

// Okinawa and Ogasawara are enlarged in their insets (scripts/build-geo.mjs): undo the scale
// when measuring area, municipality by municipality.
const { okinawa, ogasawara } = topo.meta.layout;
const areaByPref = Array(47).fill(0);
for (const f of feature(topo, topo.objects.muni).features) {
  const code = String(f.id);
  const k = code === '13421' ? ogasawara.k : code.startsWith('47') ? okinawa.k : 1;
  areaByPref[Number(code.slice(0, 2)) - 1] += polyArea(polys(f.geometry)) / (k * k);
}

/** prefecture features with bbox for quick rejection; area in m² (inset scale removed) */
export const prefs = feature(topo, topo.objects.pref).features.map((f) => {
  const ps = polys(f.geometry);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ps) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { code: Number(f.id), polys: ps, bbox: [x0, y0, x1, y1], area: areaByPref[Number(f.id) - 1] };
}).sort((a, b) => a.code - b.code);

/** municipality features (planar, laid out like the map) with bbox, built on first use */
let muniFeatures = null;
/** 5-digit municipality code containing a planar point, or null */
export function muniAt(p) {
  muniFeatures ??= feature(topo, topo.objects.muni).features.filter((f) => f.geometry).map((f) => {
    const ps = polys(f.geometry);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of ps) for (const [x, y] of q[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { code: String(f.id), polys: ps, bbox: [x0, y0, x1, y1] };
  });
  for (const f of muniFeatures) {
    const [x0, y0, x1, y1] = f.bbox;
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
    if (f.polys.some((poly) => inPoly(p, poly))) return f.code;
  }
  return null;
}

/** prefecture code 1..47 containing a planar point, or 0 */
export function prefAt(p) {
  for (const f of prefs) {
    const [x0, y0, x1, y1] = f.bbox;
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
    if (f.polys.some((poly) => inPoly(p, poly))) return f.code;
  }
  return 0;
}
