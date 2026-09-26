// Loads the pre-projected TopoJSON (scripts/build-geo.mjs) and turns it into SVG path strings
// once. Coordinates are already in a Lambert projection with the Okinawa / Ogasawara insets laid
// out, so only a flip + scale is applied here. Roads and DPL points (scripts/lib/project.mjs) are
// in the same planar space and go through the same transform.

import { geoIdentity, geoPath } from 'd3-geo';
import { feature, mesh, neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Roads } from './data';
import type { Layout } from './project';

export const WIDTH = 1000;

export interface Shape {
  code: string;         // "13" for prefectures, "13101" for municipalities
  name: string;
  nameEn: string;
  d: string;
  bbox: [[number, number], [number, number]];
  centroid: [number, number];
}

export interface GeoData {
  width: number;
  height: number;
  prefs: Shape[];
  munis: Shape[];
  prefBorders: string;
  insets: { x: number; y: number; w: number; h: number; key: string }[];
  /** bbox to frame when zooming to a prefecture (outlying islands left out) */
  prefFrame: Map<string, Shape['bbox']>;
  /** borders between the municipalities of one prefecture (built on demand) */
  muniBorders: (pref: string) => string;
  /** planar metres -> SVG coordinates */
  P: (p: [number, number]) => [number, number];
  /** prefectural office positions (SVG coordinates), index 0..46 — flow arc anchors */
  anchors: [number, number][];
  /** prefectures sharing a border: "11-13" (codes as numbers, smaller first) */
  adjacent: Set<string>;
  /** SVG units per metre on the mainland (× inset scale in Okinawa / Ogasawara) */
  unitsPerMetre: number;
  /** inset layout, for projecting lon/lat in the browser (src/lib/project.ts) */
  layout?: Layout;
  insetScale: { okinawa: number; ogasawara: number };
  source: string;
}

type Meta = {
  bounds: { x0: number; y0: number; x1: number; y1: number };
  insets: Record<string, { x0: number; y0: number; x1: number; y1: number }>;
  layout?: Layout;
  source: string;
};

type Topo = Topology & { meta: Meta };

/** projection of the pre-projected TopoJSON coordinates onto the SVG canvas */
function projector(meta: Meta) {
  const { bounds } = meta;
  const pad = 8;
  const k = (WIDTH - 2 * pad) / (bounds.x1 - bounds.x0);
  const height = Math.ceil((bounds.y1 - bounds.y0) * k + 2 * pad);
  const proj = geoIdentity().reflectY(true).scale(k).translate([pad - bounds.x0 * k, pad + bounds.y1 * k]);
  return { k, height, path: geoPath(proj), P: (p: [number, number]) => proj(p) as [number, number] };
}

function shapes(topo: Topo, obj: GeometryCollection, path: ReturnType<typeof geoPath>, enName: (code: string) => string): Shape[] {
  return (feature(topo, obj) as unknown as GeoJSON.FeatureCollection).features.map((f) => {
    const code = String(f.id);
    return {
      code,
      name: (f.properties as { n: string }).n,
      nameEn: enName(code),
      d: path(f) ?? '',
      bbox: path.bounds(f) as Shape['bbox'],
      centroid: path.centroid(f) as [number, number],
    };
  });
}

async function json<T>(name: string, fallback?: T): Promise<T> {
  const r = await fetch(`${import.meta.env.BASE_URL}geo/${name}`);
  if (!r.ok) { if (fallback !== undefined) return fallback; throw new Error(`geo ${name}: ${r.status}`); }
  return r.json() as Promise<T>;
}

/**
 * First paint: prefectures only (geo/pref.topo.json, ~120 KB gzip). Municipalities come later
 * from loadMunis(); until then `munis` is empty and prefFrame is the prefecture bounding box.
 */
export async function loadGeo(): Promise<GeoData> {
  const [topo, anchorsRaw] = await Promise.all([json<Topo>('pref.topo.json'), json<[number, number][]>('anchors.json', [])]);
  const { insets } = topo.meta;
  const { k, height, path, P } = projector(topo.meta);
  const prefObj = topo.objects.pref as GeometryCollection;
  const prefs = shapes(topo, prefObj, path, () => '').sort((a, b) => Number(a.code) - Number(b.code));

  const frame = (key: string) => {
    const b = insets[key];
    const m = 12_000;
    const [x0, y0] = P([b.x0 - m, b.y1 + m]);
    const [x1, y1] = P([b.x1 + m, b.y0 - m]);
    return { key, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  return {
    width: WIDTH,
    height,
    prefs,
    munis: [],
    prefBorders: path(mesh(topo, prefObj as never, (a, b) => a !== b)) ?? '',
    insets: Object.keys(insets).map(frame),
    prefFrame: new Map(prefs.map((p) => [p.code, p.bbox])),
    muniBorders: () => '',
    P,
    unitsPerMetre: k,
    layout: topo.meta.layout,
    insetScale: { okinawa: topo.meta.layout?.okinawa.k ?? 1, ogasawara: topo.meta.layout?.ogasawara.k ?? 1 },
    adjacent: (() => {
      const set = new Set<string>();
      const gs = prefObj.geometries;
      neighbors(gs as never).forEach((ns, i) => ns.forEach((j) => {
        const a = Number(gs[i].id), b = Number(gs[j].id);
        set.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
      }));
      return set;
    })(),
    // fall back to polygon centroids if anchors.json is missing
    anchors: anchorsRaw.length === 47 ? anchorsRaw.map(P) : prefs.map((p) => p.centroid),
    source: topo.meta.source,
  };
}

/** Adds the municipalities (geo/japan.topo.json, ~310 KB gzip) to a loaded GeoData. */
export async function loadMunis(geo: GeoData): Promise<GeoData> {
  const [topo, en] = await Promise.all([json<Topo>('japan.topo.json'), json<Record<string, string>>('muni-en.json', {})]);
  const { path } = projector(topo.meta);
  const muniObj = topo.objects.muni as GeometryCollection;
  // 1,898 paths: built in slices so the page stays responsive while they load
  const feats = (feature(topo, muniObj) as unknown as GeoJSON.FeatureCollection).features;
  const munis: Shape[] = [];
  for (let i = 0; i < feats.length; i += 150) {
    for (const f of feats.slice(i, i + 150)) {
      const code = String(f.id);
      munis.push({ code, name: (f.properties as { n: string }).n, nameEn: en[code] ?? '', d: path(f) ?? '',
                   bbox: path.bounds(f) as Shape['bbox'], centroid: path.centroid(f) as [number, number] });
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  // Tokyo's Izu and Ogasawara islands lie hundreds of km south of the city (and Ogasawara sits
  // in an inset), so framing all of Tokyo would make the wards tiny.
  const outlying = (code: string) => code.startsWith('13') && Number(code) >= 13360;
  const prefFrame = new Map<string, Shape['bbox']>();
  for (const s of munis) {
    if (outlying(s.code)) continue;
    const pc = s.code.slice(0, 2);
    const b = prefFrame.get(pc);
    prefFrame.set(pc, b ? [[Math.min(b[0][0], s.bbox[0][0]), Math.min(b[0][1], s.bbox[0][1])],
                           [Math.max(b[1][0], s.bbox[1][0]), Math.max(b[1][1], s.bbox[1][1])]] : s.bbox);
  }

  const cache = new Map<string, string>();
  const muniBorders = (pref: string) => {
    let d = cache.get(pref);
    if (d === undefined) {
      const inPref = (g: { id?: string | number }) => String(g.id).startsWith(pref);
      d = path(mesh(topo, muniObj as never, (a, b) => a !== b && inPref(a) && inPref(b))) ?? '';
      cache.set(pref, d);
    }
    return d;
  };
  return { ...geo, munis, prefFrame, muniBorders };
}

/** Expressways as three SVG paths (by road class), interchanges as SVG points. */
export function roadPaths(geo: GeoData, roads: Roads) {
  const d: Record<1 | 2 | 3, string> = { 1: '', 2: '', 3: '' };
  for (const r of roads.roads) {
    for (const part of r.c) {
      d[r.t] += part.map((p, i) => {
        const [x, y] = geo.P(p);
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join('');
    }
  }
  const joints = roads.joints.map((j, id) => ({ ...j, id, xy: geo.P(j.p) }));
  return { d, joints };
}
