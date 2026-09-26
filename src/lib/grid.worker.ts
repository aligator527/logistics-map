// Access legs of every 1 km cell (lib/travel.ts cellAccess) off the main thread.
import { cellAccess, type CellAccessArgs } from './travel';

self.onmessage = async (e: MessageEvent<CellAccessArgs>) => {
  const r = await cellAccess(e.data);
  (self as unknown as Worker).postMessage(r, [r.node.buffer, r.min.buffer]);
};
