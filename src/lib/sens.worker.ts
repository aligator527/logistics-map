// Rank stability of the site score (lib/score.ts sensitivity) off the main thread.
import { sensitivity } from './score';

self.onmessage = (e: MessageEvent<{ id: number; parts: number[][]; weights: number[] }>) => {
  const { id, parts, weights } = e.data;
  (self as unknown as Worker).postMessage({ id, result: sensitivity(parts, weights) });
};
