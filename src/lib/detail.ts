// Street-level detail for one prefecture (public/geo/detail/<pref>.json, scripts/build-detail.mjs): municipal
// boundaries simplified to a few metres and the expressways at the same precision. Loaded only when the map is
// zoomed in close, for the prefectures on screen; the overview shapes (180 m) are used otherwise.
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { GeoData } from './geo';

export interface Detail {
  /** municipality code -> SVG path */
  munis: Map<string, string>;
  /** the whole prefecture */
  pref: string;
  /** borders between its municipalities */
  borders: string;
  /** its outline (coast and prefectural borders) */
  outline: string;
  /** expressways by class (1 national, 2 other motorways, 3 urban) */
  roads: Record<1 | 2 | 3, string>;
}

type DetailTopo = Topology & { roads?: number[][] };
const cache = new Map<string, Promise<Detail | null>>();

export function loadDetail(geo: GeoData, pref: string): Promise<Detail | null> {
  let p = cache.get(pref);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}geo/detail/${pref}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<DetailTopo>) : null))
      .then((topo) => (topo ? build(geo, topo) : null))
      .catch(() => { cache.delete(pref); return null; });
    cache.set(pref, p);
  }
  return p;
}

function build(geo: GeoData, topo: DetailTopo): Detail {
  const obj = topo.objects.muni as GeometryCollection;
  const munis = new Map<string, string>();
  for (const f of (feature(topo, obj) as unknown as GeoJSON.FeatureCollection).features) munis.set(String(f.id), geo.finePath(f));
  const roads: Record<1 | 2 | 3, string> = { 1: '', 2: '', 3: '' };
  for (const r of topo.roads ?? []) {
    let x = r[1], y = r[2], d = '';
    for (let i = 1; i < r.length; i += 2) {
      if (i > 1) { x += r[i]; y += r[i + 1]; }
      const [sx, sy] = geo.P([x, y]);
      d += `${i > 1 ? 'L' : 'M'}${sx.toFixed(5)},${sy.toFixed(5)}`;
    }
    roads[r[0] as 1 | 2 | 3] += d;
  }
  return {
    munis,
    pref: geo.finePath(merge(topo, obj.geometries as never)),
    borders: geo.finePath(mesh(topo, obj as never, (a, b) => a !== b)),
    outline: geo.finePath(mesh(topo, obj as never, (a, b) => a === b)),
    roads,
  };
}
