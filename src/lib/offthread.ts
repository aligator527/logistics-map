// Heavy calculations in a worker, with a plain fallback where workers are not available.
import { sensitivity, type Sensitivity } from './score';

let worker: Worker | null = null, seq = 0;
const waiting = new Map<number, (r: Sensitivity) => void>();
function get() {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./sens.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: Sensitivity }>) => { waiting.get(e.data.id)?.(e.data.result); waiting.delete(e.data.id); };
  } catch { worker = null; }
  return worker;
}
/** rank stability for these percentiles and weights (see lib/score.ts) */
export function sensitivityAsync(parts: number[][], weights: number[]): Promise<Sensitivity> {
  const w = get();
  if (!w) return Promise.resolve(sensitivity(parts, weights));
  const id = ++seq;
  return new Promise((res) => { waiting.set(id, res); w.postMessage({ id, parts, weights }); });
}
