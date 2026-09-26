// lon/lat -> the map's planar metres in the browser (live layers: earthquakes, typhoons).
// Ellipsoidal Lambert conformal conic, 2 standard parallels (Snyder 1987, §15), GRS80 — the same
// projection as scripts/lib/project.mjs (proj4 '+proj=lcc +lat_1=33 +lat_2=41 +lat_0=37
// +lon_0=136.5 +ellps=GRS80'), plus the Okinawa / Ogasawara inset layout from the TopoJSON meta.

export interface Layout {
  okinawa: { c: [number, number]; k: number; d: [number, number]; daito: [number, number]; sakishima: [number, number] };
  ogasawara: { c: [number, number]; k: number; d: [number, number] };
}

const a = 6378137, f = 1 / 298.257222101, e = Math.sqrt(2 * f - f * f);
const rad = Math.PI / 180;
const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2);
const tf = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
const p1 = 33 * rad, p2 = 41 * rad, p0 = 37 * rad, l0 = 136.5 * rad;
const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(tf(p1)) - Math.log(tf(p2)));
const F = m(p1) / (n * tf(p1) ** n);
const r0 = a * F * tf(p0) ** n;

export function lcc(lon: number, lat: number): [number, number] {
  const r = a * F * tf(lat * rad) ** n, th = n * (lon * rad - l0);
  return [r * Math.sin(th), r0 - r * Math.cos(th)];
}

export type Space = 'main' | 'okinawa' | 'ogasawara' | 'outside';
/**
 * With the inset layout; `space` tells whether the point was moved into an inset. Open ocean south
 * of the Okinawa inset (below 23.8°N, west of 131.5°E) is 'outside': not on the map at all.
 */
export function project(lon: number, lat: number, L: Layout | undefined): { p: [number, number]; space: Space } {
  let [x, y] = lcc(lon, lat);
  if (!L) return { p: [x, y], space: 'main' };
  let S: { c: [number, number]; k: number; d: [number, number] } | null = null, space: Space = 'main';
  if (lat < 23.8 && lon > 118 && lon < 131.5) return { p: [x, y], space: 'outside' };
  if (lat < 27.0 && lon > 122 && lon < 131.5) {
    S = L.okinawa; space = 'okinawa';
    if (lon > 130.5) { x += L.okinawa.daito[0]; y += L.okinawa.daito[1]; }
    else if (lon < 125.6) { x += L.okinawa.sakishima[0]; y += L.okinawa.sakishima[1]; }
  } else if (lon > 139 && lat < 28) { S = L.ogasawara; space = 'ogasawara'; }
  if (S) { x = S.c[0] + (x - S.c[0]) * S.k + S.d[0]; y = S.c[1] + (y - S.c[1]) * S.k + S.d[1]; }
  return { p: [x, y], space };
}

/** inverse of lcc() (Snyder 15-10, 7-9 iterated) — main map space only */
export function lccInverse(x: number, y: number): [number, number] {
  const dy = r0 - y;
  const rho = Math.sign(n) * Math.hypot(x, dy);
  const th = Math.atan2(x, dy);
  const t = (rho / (a * F)) ** (1 / n);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) {
    const es = e * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(t * ((1 - es) / (1 + es)) ** (e / 2));
  }
  return [(th / n + l0) / rad, phi / rad];
}

/** like project(), but in a given space (a map tile is drawn whole in the space of its centre) */
export function projectIn(lon: number, lat: number, L: Layout, space: Space): [number, number] {
  let [x, y] = lcc(lon, lat);
  let S: { c: [number, number]; k: number; d: [number, number] } | null = null;
  if (space === 'okinawa') {
    S = L.okinawa;
    if (lon > 130.5) { x += L.okinawa.daito[0]; y += L.okinawa.daito[1]; }
    else if (lon < 125.6) { x += L.okinawa.sakishima[0]; y += L.okinawa.sakishima[1]; }
  } else if (space === 'ogasawara') S = L.ogasawara;
  if (S) { x = S.c[0] + (x - S.c[0]) * S.k + S.d[0]; y = S.c[1] + (y - S.c[1]) * S.k + S.d[1]; }
  return [x, y];
}
/** the geographic box shown in each inset (for picking map tiles) */
export const INSET_BOX: Record<'okinawa' | 'ogasawara', [number, number, number, number]> = {
  okinawa: [122.0, 23.8, 131.6, 28.0],
  ogasawara: [139.0, 24.0, 142.4, 28.0],
};

/** planar metres (as laid out on the map) -> lon/lat; insets are undone first. For the Okinawa inset
 *  the Daitō / Sakishima shifts are tried in turn and the one that projects back onto the point wins. */
export function unproject(p: [number, number], L: Layout, space: Space): [number, number] {
  if (space === 'main' || space === 'outside') return lccInverse(p[0], p[1]);
  const S = space === 'okinawa' ? L.okinawa : L.ogasawara;
  const x = S.c[0] + (p[0] - S.d[0] - S.c[0]) / S.k, y = S.c[1] + (p[1] - S.d[1] - S.c[1]) / S.k;
  if (space === 'ogasawara') return lccInverse(x, y);
  let best: [number, number] = lccInverse(x, y), bd = Infinity;
  for (const sh of [[0, 0], L.okinawa.daito, L.okinawa.sakishima] as [number, number][]) {
    const ll = lccInverse(x - sh[0], y - sh[1]);
    const back = projectIn(ll[0], ll[1], L, 'okinawa');
    const d = Math.hypot(back[0] - p[0], back[1] - p[1]);
    if (d < bd) { bd = d; best = ll; }
  }
  return best;
}
