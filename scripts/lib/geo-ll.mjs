// Lon/lat helpers shared by the municipal ETL scripts.
//   muniPoints(): an interior point of every municipality (lon/lat), from the projected
//                 intermediate data/geo/tmp/muni.json written by `npm run geo` (before the
//                 Okinawa/Ogasawara inset layout, so the inverse projection is exact).
//   km(a, b):     great-circle distance.
//   GridIndex:    bucket points on a 0.1° grid for fast radius queries.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = resolve(root, 'data/geo/tmp');

export function muniPoints() {
  const src = `${tmp}/muni.json`, out = `${tmp}/muni-points.json`;
  if (!existsSync(src)) throw new Error('data/geo/tmp/muni.json missing — run `npm run geo` first');
  if (!existsSync(out) || statSync(out).mtimeMs < statSync(src).mtimeMs) {
    execFileSync(resolve(root, 'node_modules/.bin/mapshaper'), ['-i', src, '-points', 'inner', '-o', out, 'format=geojson', 'force'], { stdio: 'inherit' });
  }
  const meta = JSON.parse(readFileSync(resolve(root, 'public/geo/japan.topo.json'), 'utf8')).meta;
  const inv = proj4(meta.proj, 'EPSG:4326');
  return JSON.parse(readFileSync(out, 'utf8')).features
    .filter((f) => f.geometry && !String(f.properties.code).endsWith('000'))
    .map((f) => { const [lon, lat] = inv.forward(f.geometry.coordinates); return { code: String(f.properties.code), lon, lat }; });
}

const R = 6371.0088, rad = Math.PI / 180;
export function km(a, b) {
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export class GridIndex {
  constructor(points, cell = 0.1) {
    this.cell = cell;
    this.map = new Map();
    for (const p of points) {
      const k = `${Math.floor(p.lat / cell)}|${Math.floor(p.lon / cell)}`;
      (this.map.get(k) ?? this.map.set(k, []).get(k)).push(p);
    }
  }
  /** points within r km of q (visits the cells of the bounding box) */
  within(q, r) {
    const dLat = r / 111, dLon = r / (111 * Math.cos(q.lat * rad));
    const out = [];
    for (let i = Math.floor((q.lat - dLat) / this.cell); i <= Math.floor((q.lat + dLat) / this.cell); i++) {
      for (let j = Math.floor((q.lon - dLon) / this.cell); j <= Math.floor((q.lon + dLon) / this.cell); j++) {
        for (const p of this.map.get(`${i}|${j}`) ?? []) if (km(q, p) <= r) out.push(p);
      }
    }
    return out;
  }
  /** nearest point (expanding radius), with its distance */
  nearest(q, maxKm = 300) {
    for (let r = 5; r <= maxKm; r *= 2) {
      const c = this.within(q, r);
      if (c.length) {
        let best = null, d = Infinity;
        for (const p of c) { const x = km(q, p); if (x < d) { d = x; best = p; } }
        return { p: best, d };
      }
    }
    return { p: null, d: NaN };
  }
}
