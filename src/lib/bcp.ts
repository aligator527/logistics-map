// 緊急輸送道路 (N10) and 重要物流道路 (N12) — public/geo/logiroads.json (scripts/build-bcp-roads.mjs), loaded when the
// layer is switched on or a site memo needs distances. Lines are in the map's planar layout, 10 m units, delta-encoded.
import type { GeoData } from './geo';
import { project } from './project';

type Src = { ja: string; en: string; url: string };
export interface BcpRoads {
  emergency: Record<string, number[][]>;
  logistics: Record<string, number[][]>;
  source: { emergency: Src; logistics: Src; note: { ja: string; en: string } };
}
let pending: Promise<BcpRoads | null> | null = null;
export function loadBcp(): Promise<BcpRoads | null> {
  pending ??= fetch(`${import.meta.env.BASE_URL}geo/logiroads.json`).then((r) => (r.ok ? r.json() : null)).catch(() => { pending = null; return null; });
  return pending;
}
const decode = (flat: number[]) => {
  const pts: [number, number][] = [];
  let x = flat[0], y = flat[1];
  pts.push([x * 10, y * 10]);
  for (let i = 2; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; pts.push([x * 10, y * 10]); }
  return pts;
};
/** SVG paths (viewBox units) per layer and class: e1–e3 emergency, l1 key logistics road, l2 its alternatives */
export function bcpPaths(geo: GeoData, b: BcpRoads) {
  const d = (lines: number[][] | undefined) => (lines ?? []).map((f) => decode(f).map((p, i) => { const [sx, sy] = geo.P(p); return `${i ? 'L' : 'M'}${sx.toFixed(3)},${sy.toFixed(3)}`; }).join('')).join('');
  return { e1: d(b.emergency['1']), e2: d(b.emergency['2']), e3: d(b.emergency['3']), l1: d(b.logistics['1']), l2: d(b.logistics['2']) };
}
/** km from a point to the nearest line of a class (planar, the map's projection) */
export function nearestKm(b: BcpRoads, lon: number, lat: number, layer: 'emergency' | 'logistics', cls: string, layout: GeoData['layout']) {
  const { p } = project(lon, lat, layout);
  let best = Infinity;
  for (const f of b[layer][cls] ?? []) {
    const pts = decode(f);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = [pts[i - 1][0] - p[0], pts[i - 1][1] - p[1]], [bx, by] = [pts[i][0] - p[0], pts[i][1] - p[1]];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const u = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      best = Math.min(best, Math.hypot(ax + u * dx, ay + u * dy));
    }
  }
  return best / 1000;
}
