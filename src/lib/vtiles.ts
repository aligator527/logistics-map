// Vector tiles at street level, drawn on a canvas under the map's points:
//   bld  — buildings (国土地理院 最適化ベクトルタイル, layer BldA, z16 carries the z17 detail)
//   fude — land parcels (法務省 登記所備付地図データ 2025, tiles by KotobaMedia; only parcels in a public
//          coordinate system — about half of Japan's — are in the data)
// Geometry is projected once per tile into map (viewBox) units and kept as Path2D, so panning and zooming only
// change the canvas transform.
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

export type VKind = 'bld' | 'fude';
export const VT_Z = 16;
export const VT_SOURCE = {
  bld: { url: (x: number, y: number) => `https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/16/${x}/${y}.pbf`, layer: 'BldA' },
  fude: { url: (x: number, y: number) => `https://tiles.kmproj.com/mojxml/2025/16/${x}/${y}.mvt`, layer: 'mojxml' },
} as const;

export interface Parcel { path: Path2D; c: [number, number]; box: [number, number, number, number]; chiban: string; place: string; muni: string; accuracy: string }
export interface VTile {
  /** buildings: [ordinary, solid / high-rise]; parcels: all in one */
  paths: Path2D[];
  parcels: Parcel[];
  empty: boolean;
}

const cache = new Map<string, VTile | null | 'loading'>();
const MAX = 400;

const x2lon = (x: number) => (x / 2 ** VT_Z) * 360 - 180;
const y2lat = (y: number) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** VT_Z; return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

/** the tile if loaded (null = failed or no data); starts loading otherwise and calls onload when done */
export function vtile(kind: VKind, x: number, y: number, toVB: (lon: number, lat: number) => [number, number] | null, onload: () => void): VTile | null | undefined {
  const key = `${kind}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit === 'loading') return undefined;
  if (hit !== undefined) { cache.delete(key); cache.set(key, hit); return hit; }
  cache.set(key, 'loading');
  fetch(VT_SOURCE[kind].url(x, y))
    .then(async (r) => (r.ok || r.status === 204 ? new Uint8Array(await r.arrayBuffer()) : null))
    .then((buf) => {
      cache.set(key, buf ? build(kind, buf, x, y, toVB) : null);
      while (cache.size > MAX) cache.delete(cache.keys().next().value!);
      onload();
    })
    .catch(() => { cache.delete(key); });
  return undefined;
}

function build(kind: VKind, buf: Uint8Array, tx: number, ty: number, toVB: (lon: number, lat: number) => [number, number] | null): VTile {
  const out: VTile = { paths: kind === 'bld' ? [new Path2D(), new Path2D()] : [new Path2D()], parcels: [], empty: true };
  if (!buf.length) return out;
  const layer = new VectorTile(new PbfReader(buf)).layers[VT_SOURCE[kind].layer];
  if (!layer) return out;
  const ext = layer.extent;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 3) continue;
    const p = f.properties as Record<string, string | number>;
    const path = new Path2D();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sx = 0, sy = 0, n = 0;
    for (const ring of f.loadGeometry()) {
      ring.forEach((pt, j) => {
        const vb = toVB(x2lon(tx + pt.x / ext), y2lat(ty + pt.y / ext));
        if (!vb) return;
        if (j) path.lineTo(vb[0], vb[1]); else path.moveTo(vb[0], vb[1]);
        x0 = Math.min(x0, vb[0]); x1 = Math.max(x1, vb[0]); y0 = Math.min(y0, vb[1]); y1 = Math.max(y1, vb[1]);
        sx += vb[0]; sy += vb[1]; n++;
      });
      path.closePath();
    }
    if (!n) continue;
    out.empty = false;
    if (kind === 'bld') out.paths[p.vt_code === 3102 || p.vt_code === 3103 ? 1 : 0].addPath(path);
    else {
      out.paths[0].addPath(path);
      out.parcels.push({ path, c: [sx / n, sy / n], box: [x0, y0, x1, y1], chiban: String(p['地番'] ?? ''),
        place: `${p['大字名'] ?? ''}${p['丁目名'] ?? ''}${p['小字名'] ?? ''}`, muni: String(p['市区町村名'] ?? ''), accuracy: String(p['精度区分'] ?? '') });
    }
  }
  return out;
}
