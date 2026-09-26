// 立地シミュレーション, two objectives:
//   coverage — greedy maximum coverage: which N candidate places reach the most people within T minutes by road,
//              on top of the places already there;
//   cost     — greedy p-median: which places make the yearly total lowest, where the total is the delivery runs
//              (each at the 標準的運賃 of its road distance from the nearest site, runs spread over the demand) plus
//              a fixed yearly cost per new site (land at a yearly rate, staff). Adding sites stops paying off
//              when the fixed cost outgrows the saving on runs: every step is reported, the best one marked.
// Travel times and road km from lib/travel.ts, with the map's options (ferries, rush hour, closures).
import { Router, type Network, type Place } from './travel';
import { fare, regionOf, type Vehicle } from './fares';

export interface SimRequest {
  net: Network;
  pop: number[];
  candidates: number[];      // municipality indexes
  fixed: Place[];            // existing sites
  minutes: number;
  n: number;
  ferries: boolean;
  peak: boolean;
  closed: number[];
  mode: 'coverage' | 'cost';
  /** cost mode: demand weight per municipality, runs a year over the whole network, vehicle, prefecture per
   *  municipality (for the fare region), fixed yearly cost per candidate (same order as candidates) */
  cost?: { demand: number[]; runs: number; vehicle: Vehicle; prefOf: number[]; fixedYen: number[] };
}
export interface SimStep { i: number; gain: number; total: number; transport?: number; fixedYen?: number }
export interface SimResult { picks: SimStep[]; base: number; all: number; best?: number; baseTransport?: number }

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const q = e.data;
  const r = new Router(q.net);
  r.ferries = q.ferries; r.peak = q.peak; r.closed = new Set(q.closed);
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  (q.mode === 'cost' ? cost : coverage)(q, r, post);
};

function coverage({ pop, candidates, fixed, minutes, n }: SimRequest, r: Router, post: (m: unknown) => void) {
  const all = pop.reduce((a, b) => a + (b || 0), 0);
  const covered = new Uint8Array(pop.length);
  if (fixed.length) r.toMunis(fixed).forEach((t, j) => { if (t <= minutes) covered[j] = 1; });
  const base = pop.reduce((a, p, j) => a + (covered[j] ? p || 0 : 0), 0);
  // reach of every candidate (the slow part: one Dijkstra each)
  const reach: Uint32Array[] = [];
  candidates.forEach((i, k) => {
    const t = r.toMunis([r.muni(i)]);
    const list: number[] = [];
    t.forEach((x, j) => { if (x <= minutes) list.push(j); });
    reach.push(Uint32Array.from(list));
    if (k % 50 === 0) post({ progress: k / candidates.length });
  });
  const picks: SimStep[] = [];
  let total = base;
  const used = new Set<number>();
  for (let step = 0; step < n; step++) {
    let best = -1, bestGain = 0;
    reach.forEach((list, k) => {
      if (used.has(k)) return;
      let g = 0;
      for (const j of list) if (!covered[j]) g += pop[j] || 0;
      if (g > bestGain) { bestGain = g; best = k; }
    });
    if (best < 0) break;
    used.add(best);
    for (const j of reach[best]) covered[j] = 1;
    total += bestGain;
    picks.push({ i: candidates[best], gain: bestGain, total });
  }
  post({ result: { picks, base, all } satisfies SimResult });
}

function cost(q: SimRequest, r: Router, post: (m: unknown) => void) {
  const c = q.cost!, N = q.pop.length;
  const dsum = c.demand.reduce((a, b) => a + Math.max(0, b || 0), 0) || 1;
  const runs = Float64Array.from(c.demand, (d) => (Math.max(0, d || 0) / dsum) * c.runs);
  // a run nobody can reach by road: priced as a very long one (keeps the first picks where the demand is)
  const penalty = fare(1500, c.vehicle, 'kanto');
  const rowOf = (site: Place, pref: number) => {
    const { t, km } = r.toMunisKm([site]);
    const region = regionOf(pref);
    return Float64Array.from({ length: N }, (_, j) => (isFinite(t[j]) && isFinite(km[j]) ? fare(km[j], c.vehicle, region) : penalty));
  };
  // current price of a run to each municipality: from the existing sites, else the penalty
  const cur = new Float64Array(N).fill(penalty);
  for (const f of q.fixed) {
    const near = r.toMunis([f]);
    // the region of an existing site: its nearest municipality's prefecture
    let bj = 0, bt = Infinity; near.forEach((x, j) => { if (x < bt) { bt = x; bj = j; } });
    const row = rowOf(f, c.prefOf[bj]);
    for (let j = 0; j < N; j++) if (row[j] < cur[j]) cur[j] = row[j];
  }
  const sum = (arr: Float64Array) => { let s = 0; for (let j = 0; j < N; j++) s += runs[j] * arr[j]; return s; };
  const baseTransport = q.fixed.length ? sum(cur) : NaN;
  const rows: Float64Array[] = [];
  q.candidates.forEach((i, k) => {
    rows.push(rowOf(r.muni(i), c.prefOf[i]));
    if (k % 50 === 0) post({ progress: k / q.candidates.length });
  });
  const picks: SimStep[] = [];
  const used = new Set<number>();
  let fixedYen = 0, bestTotal = Infinity, best = -1;
  for (let step = 0; step < q.n; step++) {
    let pick = -1, pickT = Infinity;
    rows.forEach((row, k) => {
      if (used.has(k)) return;
      let s = 0;
      for (let j = 0; j < N; j++) s += runs[j] * (row[j] < cur[j] ? row[j] : cur[j]);
      s += c.fixedYen[k];
      if (s < pickT) { pickT = s; pick = k; }
    });
    if (pick < 0) break;
    used.add(pick);
    const row = rows[pick];
    for (let j = 0; j < N; j++) if (row[j] < cur[j]) cur[j] = row[j];
    fixedYen += c.fixedYen[pick];
    const transport = sum(cur), total = transport + fixedYen;
    picks.push({ i: q.candidates[pick], gain: 0, total, transport, fixedYen });
    if (total < bestTotal) { bestTotal = total; best = step; }
  }
  post({ result: { picks, base: 0, all: 0, best, baseTransport } satisfies SimResult });
}
