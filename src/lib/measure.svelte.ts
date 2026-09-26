// 距離・面積を測る: points clicked on the map (lon/lat). Distances on the sphere; the area of a closed polygon on a
// local plane around it (accurate for sites and districts, not for whole prefectures).
const R = 6_371_008.8;
const rad = Math.PI / 180;

export function distance([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function area(pts: [number, number][]) {
  if (pts.length < 3) return 0;
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length, kx = Math.cos(lat0 * rad) * R * rad, ky = R * rad;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(a) / 2;
}

/** 1 坪 = 400/121 m² */
export const TSUBO = 400 / 121;

class Measure {
  armed = $state(false);
  pts = $state<[number, number][]>([]);
  closed = $state(false);
  add(p: [number, number]) { if (!this.closed) this.pts = [...this.pts, p]; }
  undo() { if (this.closed) this.closed = false; else this.pts = this.pts.slice(0, -1); }
  clear() { this.pts = []; this.closed = false; }
  stop() { this.armed = false; this.clear(); }
  get length() {
    let d = 0;
    for (let i = 1; i < this.pts.length; i++) d += distance(this.pts[i - 1], this.pts[i]);
    if (this.closed && this.pts.length > 2) d += distance(this.pts[this.pts.length - 1], this.pts[0]);
    return d;
  }
  get area() { return this.closed ? area(this.pts) : 0; }
}
export const measure = new Measure();
