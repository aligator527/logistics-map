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
  constructor(net: Network) {
    this.net = net;
    // adjacency as linked lists in typed arrays
    const m = net.edges.length / 3;
    this.head = new Int32Array(net.nodes).fill(-1);
    this.next = new Int32Array(2 * m);
    this.to = new Int32Array(2 * m);
    this.w = new Float32Array(2 * m);
    for (let k = 0; k < m; k++) {
      const a = net.edges[3 * k], b = net.edges[3 * k + 1], t = net.edges[3 * k + 2] / 10;
      this.link(2 * k, a, b, t);
      this.link(2 * k + 1, b, a, t);
    }
  }
  private link(e: number, a: number, b: number, t: number) {
    this.to[e] = b; this.w[e] = t; this.next[e] = this.head[a]; this.head[a] = e;
  }

  /** minutes on ordinary roads for a straight-line distance at a latitude/longitude */
  local(d: number, [lon, lat]: [number, number]) {
    const p = this.net.params;
    return (d * p.detour / (lat > 41.4 && lon > 139.3 ? p.localHk : p.local)) * 60;
  }

  /** node -> minutes from the nearest origin (multi-source Dijkstra with a binary heap) */
  private spread(origins: Place[]) {
    const dist = new Float64Array(this.net.nodes).fill(Infinity);
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
      if (t < dist[n]) { dist[n] = t; push(t, n); }
    }
    while (heap.length) {
      const [d, n] = pop();
      if (d > dist[n]) continue;
      for (let e = this.head[n]; e !== -1; e = this.next[e]) {
        const nd = d + this.w[e];
        if (nd < dist[this.to[e]]) { dist[this.to[e]] = nd; push(nd, this.to[e]); }
      }
    }
    return dist;
  }

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
