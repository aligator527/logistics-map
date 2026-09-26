// 立地シミュレーション: greedy maximum coverage. Which N candidate places reach the most people
// within T minutes by road, on top of the places already there? Travel times from lib/travel.ts.
import { Router, type Network, type Place } from './travel';

export interface SimRequest {
  net: Network;
  pop: number[];
  candidates: number[];      // municipality indexes
  fixed: Place[];            // existing sites
  minutes: number;
  n: number;
}
export interface SimResult { picks: { i: number; gain: number; total: number }[]; base: number; all: number }

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { net, pop, candidates, fixed, minutes, n } = e.data;
  const r = new Router(net);
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
    if (k % 50 === 0) (self as unknown as Worker).postMessage({ progress: k / candidates.length });
  });
  const picks: SimResult['picks'] = [];
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
  (self as unknown as Worker).postMessage({ result: { picks, base, all } satisfies SimResult });
};
