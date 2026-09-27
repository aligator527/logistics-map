// Travel-time estimates by road: Dijkstra over the expressway graph of public/geo/network.json
// (see scripts/build-network.mjs for the model). Times are minutes for a car or truck at
// typical speeds, not a route plan: no congestion, ferries, or truck restrictions.

export interface Place { ll: [number, number]; comp: number; acc: number[] }
export interface Network {
  source: { ja: string; en: string; url: string };
  params: { local: number; localHk: number; detour: number; accessKm: number; directKm: number; speed: Record<string, number> };
  nodes: number;
  edges: number[];
  munis: { ll: [number, number][]; comp: number[]; acc: number[][] };
  pois: Record<string, Place>;
  /** ferry links [nodeA, nodeB, minutes×10, route index] */
  ferries?: number[][];
  ferryRoutes?: { a: string; b: string; hours: number }[];
  /** per edge: rush-hour minutes × 10, road km × 10; node positions */
  edgePeak?: number[];
  edgeKm?: number[];
  nodeLL?: [number, number][];
  nodeName?: string[];
  edgeRoute?: number[];
  routeNames?: string[];
  speedSource?: { ja: string; en: string; url: string; measuredShare: number };
  generated: string;
}

const R = 6371.0088, rad = Math.PI / 180;
export function km(a: [number, number], b: [number, number]) {
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export class Router {
  readonly net: Network;
  private head: Int32Array;
  private next: Int32Array;
  private to: Int32Array;
  private w: Float32Array;
  /** rush-hour minutes and road km per directed edge; the undirected edge id (closures) */
  private wPeak: Float32Array;
  private kmE: Float32Array;
  private eid: Int32Array;
  /** 1 on edges that are ferry crossings */
  private ferry: Uint8Array;
  /** use the long-distance ferries (on by default) */
  ferries = true;
  /** rush-hour truck speeds (7–9, 17–19 h) instead of daytime ones */
  peak = false;
  /** closed road edges (index into net.edges / 3) */
  closed = new Set<number>();
  constructor(net: Network) {
    this.net = net;
    // adjacency as linked lists in typed arrays; ferry links after the roads
    const m = net.edges.length / 3, f = net.ferries?.length ?? 0;
    this.head = new Int32Array(net.nodes).fill(-1);
    this.next = new Int32Array(2 * (m + f));
    this.to = new Int32Array(2 * (m + f));
    this.w = new Float32Array(2 * (m + f));
    this.wPeak = new Float32Array(2 * (m + f));
    this.kmE = new Float32Array(2 * (m + f));
    this.eid = new Int32Array(2 * (m + f)).fill(-1);
    this.ferry = new Uint8Array(2 * (m + f));
    for (let k = 0; k < m; k++) {
      const a = net.edges[3 * k], b = net.edges[3 * k + 1], t = net.edges[3 * k + 2] / 10;
      const tp = net.edgePeak ? net.edgePeak[k] / 10 : t, d = net.edgeKm ? net.edgeKm[k] / 10 : 0;
      this.link(2 * k, a, b, t, tp, d, k);
      this.link(2 * k + 1, b, a, t, tp, d, k);
    }
    (net.ferries ?? []).forEach(([a, b, t10], k) => {
      const e = 2 * (m + k);
      this.link(e, a, b, t10 / 10, t10 / 10, 0, -1); this.link(e + 1, b, a, t10 / 10, t10 / 10, 0, -1);
      this.ferry[e] = 1; this.ferry[e + 1] = 1;
    });
  }
  private link(e: number, a: number, b: number, t: number, tp: number, d: number, id: number) {
    this.to[e] = b; this.w[e] = t; this.wPeak[e] = tp; this.kmE[e] = d; this.eid[e] = id; this.next[e] = this.head[a]; this.head[a] = e;
  }
  /** the edges of a node pair (for closures picked on the map) */
  edgeBetween(a: number, b: number) {
    for (let e = this.head[a]; e !== -1; e = this.next[e]) if (this.to[e] === b && this.eid[e] >= 0) return this.eid[e];
    return -1;
  }

  /** minutes on ordinary roads for a straight-line distance at a latitude/longitude */
  local(d: number, [lon, lat]: [number, number]) {
    const p = this.net.params;
    return (d * p.detour / (lat > 41.4 && lon > 139.3 ? p.localHk : p.local)) * 60;
  }

  /** node -> minutes from the nearest origin (multi-source Dijkstra with a binary heap) */
  private spread(origins: Place[], withKm = false, withPrev = false) {
    const dist = new Float64Array(this.net.nodes).fill(Infinity);
    // the directed edge each node was reached by (-1: an origin's access leg)
    const prev = withPrev ? new Int32Array(this.net.nodes).fill(-1) : null;
    // road km along the quickest path (access legs: straight line × detour)
    const dkm = withKm ? new Float64Array(this.net.nodes).fill(Infinity) : null;
    const W = this.peak ? this.wPeak : this.w, closed = this.closed.size ? this.closed : null;
    const heap: [number, number][] = [];
    const push = (d: number, n: number) => {
      heap.push([d, n]);
      for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let s = i;
          if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
          if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
          if (s === i) break;
          [heap[s], heap[i]] = [heap[i], heap[s]]; i = s;
        }
      }
      return top;
    };
    for (const o of origins) for (let k = 0; k < o.acc.length; k += 2) {
      const n = o.acc[k], t = o.acc[k + 1] / 10;
      if (t < dist[n]) { dist[n] = t; if (dkm) dkm[n] = this.localKm(t, o.ll); push(t, n); }
    }
    while (heap.length) {
      const [d, n] = pop();
      if (d > dist[n]) continue;
      for (let e = this.head[n]; e !== -1; e = this.next[e]) {
        if (!this.ferries && this.ferry[e]) continue;
        if (closed && closed.has(this.eid[e])) continue;
        const nd = d + W[e];
        if (nd < dist[this.to[e]]) { dist[this.to[e]] = nd; if (dkm) dkm[this.to[e]] = dkm[n] + this.kmE[e]; if (prev) { prev[this.to[e]] = e; this.from[e] = n; } push(nd, this.to[e]); }
      }
    }
    this.lastKm = dkm;
    this.lastPrev = prev;
    return dist;
  }
  private lastPrev: Int32Array | null = null;
  /** the node an edge leaves from (filled while tracking paths) */
  private from = new Int32Array(0);

  /** the quickest path from the nearest origin to a place: nodes passed (with names and times), trunk roads used */
  route(origins: Place[], p: Place) {
    if (this.from.length !== this.to.length) this.from = new Int32Array(this.to.length);
    const dist = this.spread(origins, true, true), dkm = this.lastKm!, prev = this.lastPrev!;
    const t = this.reach(dist, origins, p);
    if (!isFinite(t)) return null;
    // the entry of the destination the quickest path comes in by
    let end = -1, best = Infinity;
    for (let k = 0; k < p.acc.length; k += 2) { const x = dist[p.acc[k]] + p.acc[k + 1] / 10; if (x < best) { best = x; end = p.acc[k]; } }
    if (end < 0 || best > t + 1e-6) return { direct: true, t, km: this.reachKm(dist, origins, p), nodes: [], roads: [] };
    const nodes: number[] = [], edges: number[] = [];
    for (let n = end; n >= 0;) { nodes.push(n); const e = prev[n]; if (e < 0) break; edges.push(e); n = this.from[e]; }
    nodes.reverse(); edges.reverse();
    // trunk roads in order, with the km on each
    const roads: { name: string; km: number; ferry?: boolean }[] = [];
    for (const e of edges) {
      const id = this.eid[e], ferry = this.ferry[e] === 1;
      const name = ferry ? 'ferry' : id >= 0 && this.net.edgeRoute && this.net.routeNames ? this.net.routeNames[this.net.edgeRoute[id]] ?? '' : '';
      const km = this.kmE[e];
      const last = roads.at(-1);
      if (last && last.name === name) last.km += km; else roads.push({ name, km, ...(ferry ? { ferry } : {}) });
    }
    return { direct: false, t, km: this.reachKm(dist, origins, p), nodes, times: nodes.map((n) => dist[n]), roads: roads.filter((r) => r.km > 0.5 || r.ferry) };
  }
  private lastKm: Float64Array | null = null;
  /** road km of an ordinary-road leg that takes t minutes (the inverse of local()) */
  private localKm(t: number, [lon, lat]: [number, number]) {
    const p = this.net.params;
    return (t / 60) * (lat > 41.4 && lon > 139.3 ? p.localHk : p.local);
  }

  /** node -> minutes from the nearest origin */
  nodeTimes(origins: Place[]) { return this.spread(origins); }

  /** minutes from the nearest of `origins` to a place */
  private reach(dist: Float64Array, origins: Place[], p: Place) {
    let best = Infinity;
    for (let k = 0; k < p.acc.length; k += 2) best = Math.min(best, dist[p.acc[k]] + p.acc[k + 1] / 10);
    for (const o of origins) {
      if (o.comp !== p.comp) continue;
      const d = km(o.ll, p.ll);
      if (d <= this.net.params.directKm) best = Math.min(best, this.local(d, o.ll));
    }
    return best;
  }

  /** road km from the nearest-in-time origin to a place (after a spread with km) */
  private reachKm(dist: Float64Array, origins: Place[], p: Place) {
    const dkm = this.lastKm!;
    let best = Infinity, bestKm = Infinity;
    for (let k = 0; k < p.acc.length; k += 2) {
      const t = dist[p.acc[k]] + p.acc[k + 1] / 10;
      if (t < best) { best = t; bestKm = dkm[p.acc[k]] + this.localKm(p.acc[k + 1] / 10, p.ll); }
    }
    for (const o of origins) {
      if (o.comp !== p.comp) continue;
      const d = km(o.ll, p.ll);
      if (d <= this.net.params.directKm && this.local(d, o.ll) < best) { best = this.local(d, o.ll); bestKm = d * this.net.params.detour; }
    }
    return bestKm;
  }
  /** minutes and road km from the nearest origin to every municipality */
  toMunisKm(origins: Place[]) {
    const dist = this.spread(origins, true);
    const { ll, comp, acc } = this.net.munis;
    const t = new Float32Array(ll.length), d = new Float32Array(ll.length);
    for (let i = 0; i < ll.length; i++) {
      const p = { ll: ll[i], comp: comp[i], acc: acc[i] };
      t[i] = this.reach(dist, origins, p); d[i] = isFinite(t[i]) ? this.reachKm(dist, origins, p) : Infinity;
    }
    return { t, km: d };
  }

  /** minutes from the nearest origin to every municipality (Infinity: not by road) */
  toMunis(origins: Place[]) {
    const dist = this.spread(origins);
    const { ll, comp, acc } = this.net.munis;
    return Float32Array.from(ll, (_, i) => this.reach(dist, origins, { ll: ll[i], comp: comp[i], acc: acc[i] }));
  }
  /** minutes from the nearest origin to each of `places` */
  toPlaces(origins: Place[], places: Place[]) {
    const dist = this.spread(origins);
    return places.map((p) => this.reach(dist, origins, p));
  }

  muni(i: number): Place { const m = this.net.munis; return { ll: m.ll[i], comp: m.comp[i], acc: m.acc[i] }; }
  poi(key: string): Place | null { return this.net.pois[key] ?? null; }
}

/** hubs used for the "time to …" indicators: container ports (≥ 100k TEU a year), cargo airports
 *  (≥ 10,000 t a year) and every rail freight station / off-rail station */
export interface HubItem { kind: 'air' | 'port' | 'rail'; name: string; t: number | null; teu?: number | null }
export function hubGroups(items: HubItem[]) {
  return {
    port: items.filter((h) => h.kind === 'port' && (h.teu ?? 0) >= 100_000).map((h) => `port:${h.name}`),
    air: items.filter((h) => h.kind === 'air' && (h.t ?? 0) >= 10_000).map((h) => `air:${h.name}`),
    rail: items.filter((h) => h.kind === 'rail').map((h) => `rail:${h.name}`),
  };
}

// ------------------------------------------------------------ origins anywhere, 1 km grid
export interface Entry { node: number; ll: [number, number]; comp: number }
export interface Grid {
  n: number;
  lat: Float32Array;
  lon: Float32Array;
  pop: Uint16Array;
  comp: Uint16Array;
}
/** public/geo/grid.bin.gz → cells (see scripts/build-network.mjs) */
export async function loadGrid(url: string): Promise<Grid> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`grid ${res.status}`);
  let buf = await res.arrayBuffer();
  // some servers (the Vite dev server) already send it with Content-Encoding: gzip
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const u = new Uint16Array(buf), n = u.length / 4;
  return {
    n,
    lat: Float32Array.from(u.subarray(0, n), (v) => 20 + v / 1000),
    lon: Float32Array.from(u.subarray(n, 2 * n), (v) => 120 + v / 1000),
    pop: u.slice(2 * n, 3 * n),
    comp: u.slice(3 * n, 4 * n),
  };
}

/** entries bucketed on a 0.25° grid for radius queries */
class EntryIndex {
  private cells = new Map<string, Entry[]>();
  constructor(entries: Entry[]) {
    for (const e of entries) {
      const k = `${Math.floor(e.ll[1] * 4)}|${Math.floor(e.ll[0] * 4)}`;
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(e);
    }
  }
  near(lon: number, lat: number, km: number) {
    const dy = Math.ceil((km / 111) * 4), dx = Math.ceil((km / (111 * Math.cos(lat * rad))) * 4);
    const cy = Math.floor(lat * 4), cx = Math.floor(lon * 4), out: Entry[] = [];
    for (let y = cy - dy; y <= cy + dy; y++) for (let x = cx - dx; x <= cx + dx; x++) {
      const c = this.cells.get(`${y}|${x}`);
      if (c) out.push(...c);
    }
    return out;
  }
}
/** fast distance (equirectangular), plenty within 100 km */
const kmFast = (lon1: number, lat1: number, lon2: number, lat2: number) => {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * rad), y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * 111.195;
};

export class Reach {
  readonly router: Router;
  private idx: EntryIndex;
  readonly entries: Entry[];
  constructor(router: Router) {
    this.router = router;
    const raw = (router.net as Network & { entries?: [number, number, number, number][] }).entries ?? [];
    this.entries = raw.map(([node, lon, lat, comp]) => ({ node, ll: [lon, lat], comp }));
    this.idx = new EntryIndex(this.entries);
  }
  /** a place anywhere: access legs to the entries on the same land within the access radius
   *  (no open-water check here, unlike the precomputed places) */
  place(lon: number, lat: number, comp: number): Place {
    const p = this.router.net.params;
    const acc = this.idx.near(lon, lat, p.accessKm)
      .map((e) => ({ e, d: kmFast(lon, lat, e.ll[0], e.ll[1]) }))
      .filter((x) => x.e.comp === comp && x.d <= p.accessKm).sort((a, b) => a.d - b.d).slice(0, 6)
      .flatMap((x) => [x.e.node, Math.max(1, Math.round(this.router.local(x.d, [lon, lat]) * 10))]);
    return { ll: [lon, lat], comp, acc };
  }
  /** per cell, its access legs to the nearest entries on the same land (origin-independent):
   *  computed once per grid, in slices so the page stays responsive */
  private cellAcc: { node: Int32Array; min: Float32Array } | null = null;
  static readonly K = 6;
  async prepare(g: Grid) {
    if (this.cellAcc) return;
    const p = this.router.net.params;
    const args = { lat: g.lat, lon: g.lon, comp: g.comp, entries: this.entries, accessKm: p.accessKm, detour: p.detour, local: p.local, localHk: p.localHk };
    // in a worker when possible (a few seconds of work on a phone), else here in slices
    if (typeof Worker !== 'undefined') {
      try {
        const w = new Worker(new URL('./grid.worker.ts', import.meta.url), { type: 'module' });
        this.cellAcc = await new Promise((res, rej) => {
          w.onmessage = (e) => { res(e.data); w.terminate(); };
          w.onerror = (e) => { rej(e); w.terminate(); };
          w.postMessage(args);
        });
        return;
      } catch { /* fall through */ }
    }
    this.cellAcc = await cellAccess(args, () => new Promise((r) => setTimeout(r, 0)));
  }
  get ready() { return !!this.cellAcc; }
  /** minutes from the nearest origin to every grid cell (Infinity: not by road); needs prepare() */
  toGrid(origins: Place[], g: Grid): Float32Array {
    const dist = this.router.nodeTimes(origins);
    const p = this.router.net.params, K = Reach.K, { node, min } = this.cellAcc!;
    const out = new Float32Array(g.n);
    for (let i = 0; i < g.n; i++) {
      let best = Infinity;
      for (let k = i * K; k < i * K + K; k++) {
        const nd = node[k];
        if (nd < 0) break;
        const tt = dist[nd] + min[k];
        if (tt < best) best = tt;
      }
      out[i] = best;
    }
    // ordinary roads only, near an origin
    for (const o of origins) {
      const dLat = p.directKm / 111;
      for (let i = 0; i < g.n; i++) {
        if (Math.abs(g.lat[i] - o.ll[1]) > dLat || g.comp[i] !== o.comp) continue;
        const d = kmFast(g.lon[i], g.lat[i], o.ll[0], o.ll[1]);
        if (d <= p.directKm) {
          const speed = g.lat[i] > 41.4 && g.lon[i] > 139.3 ? p.localHk : p.local;
          out[i] = Math.min(out[i], (d * p.detour / speed) * 60);
        }
      }
    }
    return out;
  }
}

export interface CellAccessArgs { lat: Float32Array; lon: Float32Array; comp: Uint16Array; entries: Entry[]; accessKm: number; detour: number; local: number; localHk: number }
/** per grid cell, the K nearest expressway entries on the same land and the minutes to reach them;
 *  `pause` lets a caller on the main thread yield between slices */
export async function cellAccess(a: CellAccessArgs, pause?: () => Promise<void>) {
  const K = Reach.K, n = a.lat.length;
  const idx = new EntryIndex(a.entries);
  const node = new Int32Array(n * K).fill(-1), min = new Float32Array(n * K).fill(Infinity);
  for (let start = 0; start < n; start += 15000) {
    for (let i = start; i < Math.min(n, start + 15000); i++) {
      const lon = a.lon[i], lat = a.lat[i], comp = a.comp[i];
      const speed = lat > 41.4 && lon > 139.3 ? a.localHk : a.local;
      const near = idx.near(lon, lat, a.accessKm).filter((e) => e.comp === comp)
        .map((e) => ({ e, d: kmFast(lon, lat, e.ll[0], e.ll[1]) })).filter((x) => x.d <= a.accessKm)
        .sort((x, y) => x.d - y.d).slice(0, K);
      near.forEach((x, k) => { node[i * K + k] = x.e.node; min[i * K + k] = (x.d * a.detour / speed) * 60; });
    }
    if (pause) await pause();
  }
  return { node, min };
}
