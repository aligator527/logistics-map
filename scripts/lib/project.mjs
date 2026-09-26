// lon/lat -> the map's planar coordinates (metres), including the Okinawa / Ogasawara insets
// laid out by scripts/build-geo.mjs. Used for everything drawn on top of the boundaries
// (roads, interchanges, DPL sites), so all layers line up with the pre-projected TopoJSON.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const meta = JSON.parse(readFileSync(resolve(root, 'public/geo/japan.topo.json'), 'utf8')).meta;
const toXY = proj4('EPSG:4326', meta.proj);
const { okinawa, ogasawara } = meta.layout;

// Okinawa prefecture south of Yoron (Kagoshima) + the Daito islands; Ogasawara's Bonin group.
const inOkinawa = (lon, lat) => lat < 27.0 && lon > 122 && lon < 131.5;
const inOgasawara = (lon, lat) => lon > 139 && lat < 28;

export function project([lon, lat]) {
  let [x, y] = toXY.forward([lon, lat]);
  let L = null;
  if (inOkinawa(lon, lat)) {
    L = okinawa;
    if (lon > 130.5) { x += okinawa.daito[0]; y += okinawa.daito[1]; }
    else if (lon < 125.6) { x += okinawa.sakishima[0]; y += okinawa.sakishima[1]; }
  } else if (inOgasawara(lon, lat)) L = ogasawara;
  if (L) {
    x = L.c[0] + (x - L.c[0]) * L.k + L.d[0];
    y = L.c[1] + (y - L.c[1]) * L.k + L.d[1];
  }
  return [x, y];
}

/** rounded to 10 m: plenty for a 1000-px-wide map, keeps the JSON small */
export const r10 = ([x, y]) => [Math.round(x / 10) * 10, Math.round(y / 10) * 10];
