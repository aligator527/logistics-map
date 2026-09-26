// News on the map: items grouped by place (municipality, else prefecture, else national) and the
// placement of callout cards in the free space around the land.

export interface NewsCard {
  t: string;
  link: string;
  ex: string;
  img: string | null;
  date: string;
  src: string;
  isNew: boolean;
}
export interface NewsGroup {
  /** "m13101" municipality, "p13" prefecture, "jp" national */
  key: string;
  /** 5-digit municipality or 2-digit prefecture code ('' = national) */
  code: string;
  label: string;
  /** map position (viewBox units); null for national news */
  xy: [number, number] | null;
  items: NewsCard[];
  latest: string;
}

/** occupancy grid of the map in screen pixels (1 = land or an inset box), at 1/q resolution */
export interface Mask { w: number; h: number; q: number; sat: Uint32Array }

/** summed-area table for O(1) rectangle sums */
export function buildSat(occ: Uint8Array, w: number, h: number): Uint32Array {
  const sat = new Uint32Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += occ[(y - 1) * w + (x - 1)];
      sat[y * (w + 1) + x] = sat[(y - 1) * (w + 1) + x] + row;
    }
  }
  return sat;
}
/** share of a screen rectangle covered by land */
export function landShare(m: Mask, x0: number, y0: number, x1: number, y1: number) {
  const W = m.w + 1;
  const a = Math.max(0, Math.min(m.w, Math.floor(x0 / m.q))), b = Math.max(0, Math.min(m.h, Math.floor(y0 / m.q)));
  const c = Math.max(0, Math.min(m.w, Math.ceil(x1 / m.q))), d = Math.max(0, Math.min(m.h, Math.ceil(y1 / m.q)));
  const area = (c - a) * (d - b);
  if (area <= 0) return 1;
  return (m.sat[d * W + c] - m.sat[b * W + c] - m.sat[d * W + a] + m.sat[b * W + a]) / area;
}
function onLand(m: Mask, x: number, y: number) { return landShare(m, x - 1, y - 1, x + 1, y + 1) > 0.5; }

export interface Placed { key: string; x: number; y: number; w: number; h: number; px: number; py: number; path: string }

/**
 * Greedy placement: each card (in priority order) takes the free spot that is off the land, off the
 * other cards and news points, near its point, and whose leader line crosses the least land.
 */
export function placeCards(
  wanted: { key: string; p: [number, number] | null; h?: number }[],
  mask: Mask, W: number, H: number, size: { w: number; h: number },
  keepClear: [number, number, number, number][],
  points: [number, number][],
): Placed[] {
  const out: Placed[] = [];
  const boxes = [...keepClear];
  const hit = (x0: number, y0: number, x1: number, y1: number) =>
    boxes.some((b) => x0 < b[2] + 8 && x1 > b[0] - 8 && y0 < b[3] + 8 && y1 > b[1] - 8)
    || points.some(([px, py]) => px > x0 - 14 && px < x1 + 14 && py > y0 - 14 && py < y1 + 14);
  const STEP = 14, M = 8;
  for (const it of wanted) {
    const card = { w: size.w, h: it.h ?? size.h };
    let best = null as { x: number; y: number; s: number } | null;
    // sea first; when zoomed in there may be none, then over the land (cards are opaque)
    for (const tolerance of [0.02, 0.2, 1]) {
      for (let y = M; y + card.h <= H - M; y += STEP) {
        for (let x = M; x + card.w <= W - M; x += STEP) {
          if (hit(x, y, x + card.w, y + card.h)) continue;
          const land = landShare(mask, x, y, x + card.w, y + card.h);
          if (land > tolerance) continue;
          let s = land * 4000;
          if (it.p) {
            const [px, py] = it.p;
            const ax = Math.max(x, Math.min(px, x + card.w)), ay = Math.max(y, Math.min(py, y + card.h));
            const d = Math.hypot(ax - px, ay - py);
            s += Math.abs(d - 90) + (d < 40 ? 400 : 0);
            // land under the leader line
            let crossed = 0;
            for (let k = 1; k < 16; k++) if (onLand(mask, px + ((ax - px) * k) / 16, py + ((ay - py) * k) / 16)) crossed++;
            s += crossed * 45;
          } else s += x + y; // national: top-left corner
          if (!best || s < best.s) best = { x, y, s };
        }
      }
      if (best) break;
    }
    if (!best) continue;
    const { x, y } = best;
    boxes.push([x, y, x + card.w, y + card.h]);
    let path = '';
    let px = x, py = y;
    if (it.p) {
      [px, py] = it.p;
      // leader: from the point, a slanted leg, then a level leg into the card's nearer side
      const side = px < x ? x : px > x + card.w ? x + card.w : null;
      if (side !== null) {
        const ay = Math.max(y + 16, Math.min(py, y + card.h - 16));
        const ex = side + (side === x ? -18 : 18);
        path = `M${px.toFixed(1)},${py.toFixed(1)}L${ex.toFixed(1)},${ay.toFixed(1)}L${side.toFixed(1)},${ay.toFixed(1)}`;
      } else {
        const ay = py < y ? y : y + card.h;
        const ax = Math.max(x + 16, Math.min(px, x + card.w - 16));
        const ey = ay + (ay === y ? -18 : 18);
        path = `M${px.toFixed(1)},${py.toFixed(1)}L${ax.toFixed(1)},${ey.toFixed(1)}L${ax.toFixed(1)},${ay.toFixed(1)}`;
      }
    }
    out.push({ key: it.key, x, y, w: card.w, h: card.h, px, py, path });
  }
  return out;
}

/** PR TIMES serves the preview at any size: ask for what is shown (2× for sharp screens) */
export function sizedImage(url: string | null | undefined, cssWidth: number): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/prcdn|prtimes/.test(u.hostname)) return url;
    u.searchParams.set('width', String(cssWidth * 2)); u.searchParams.set('height', String(Math.round(cssWidth * 2))); u.searchParams.set('fit', 'bounds');
    return u.toString();
  } catch { return url; }
}
