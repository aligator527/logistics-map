// Labour around a site: transport and handling workers (国勢調査 2020, by residence: 輸送・機械運転 + 運搬・清掃・包装等)
// living in municipalities whose population centre is within a car commute, and the logistics floor space competing
// for them (other developers' facilities from press releases, built or planned).
import { store } from './store.svelte';

export const COMMUTE_MIN = [20, 30, 45] as const;

/** workers and residents within each commute limit, from minutes per municipality */
export function commuteFrom(times: ArrayLike<number>) {
  const m = store.muni;
  if (!m) return null;
  return COMMUTE_MIN.map((lim) => {
    let workers = 0, pop = 0;
    for (let i = 0; i < times.length; i++) if (times[i] <= lim) { workers += m.m.workers[i] ?? 0; pop += m.m.pop[i] ?? 0; }
    return { lim, workers, pop };
  });
}

/** floor area (m²) of other developers' facilities in municipalities within `lim` minutes, split by stage */
export function competingFloor(times: ArrayLike<number>, lim = 30) {
  const m = store.muni, fac = store.facilities;
  if (!m || !fac) return null;
  const idx = new Map(m.codes.map((c, i) => [c, i]));
  let built = 0, planned = 0, n = 0;
  for (const f of fac) {
    const i = f.muni ? idx.get(f.muni) : undefined;
    if (i === undefined || !(times[i] <= lim) || !f.floor) continue;
    const last = f.events.at(-1)?.stage;
    if (last === 'done' || last === 'open') built += f.floor; else planned += f.floor;
    n++;
  }
  return { built, planned, n };
}
