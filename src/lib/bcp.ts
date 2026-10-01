// 緊急輸送道路 (N10) and 重要物流道路 (N12), 国土数値情報 licensed 非商用: drawn from picture tiles only
// (public/tiles/logiroads, scripts/build-bcp-roads.mjs), so the browser never gets their coordinates. The site memo's
// distances come from the 1 km grid (public/geo/logidist.bin.gz: km to the nearest road for every grid cell).
import { loadGrid, type Grid } from './travel';

type Src = { ja: string; en: string; url: string };
export interface BcpSource { emergency: Src; logistics: Src; note: { ja: string; en: string } }
const base = () => import.meta.env.BASE_URL;

let src: Promise<BcpSource | null> | null = null;
export function loadBcpSource(): Promise<BcpSource | null> {
  src ??= fetch(`${base()}tiles/logiroads/source.json`).then((r) => (r.ok ? r.json() : null)).catch(() => { src = null; return null; });
  return src;
}

export interface BcpDist { grid: Grid; d: Uint16Array }
let dist: Promise<BcpDist | null> | null = null;
async function gunzip(res: Response) {
  let buf = await res.arrayBuffer();
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return buf;
}
export function loadBcpDist(): Promise<BcpDist | null> {
  dist ??= Promise.all([loadGrid(`${base()}geo/grid.bin.gz`), fetch(`${base()}geo/logidist.bin.gz`)])
    .then(async ([grid, r]) => (r.ok ? { grid, d: new Uint16Array(await gunzip(r)) } : null))
    .catch(() => { dist = null; return null; });
  return dist;
}
/** km to the nearest road of the class, read at the nearest 1 km cell (within 3 km; else null) */
export function nearestKm(b: BcpDist, lon: number, lat: number, layer: 'emergency' | 'logistics'): number | null {
  const { grid: g, d } = b, kx = Math.cos((lat * Math.PI) / 180);
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.n; i++) {
    const dy = g.lat[i] - lat;
    if (Math.abs(dy) > 0.03) continue;
    const dx = (g.lon[i] - lon) * kx, dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = i; }
  }
  if (best < 0 || Math.sqrt(bd) * 111 > 3) return null;
  const v = d[(layer === 'emergency' ? 0 : g.n) + best];
  return v === 0xffff ? null : v / 10;
}
