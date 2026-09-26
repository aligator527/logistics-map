// 地理院タイル (GSI map tiles, Web Mercator) drawn under the map's own Lambert projection: each 256 px
// tile covers a small area, so it is placed with an affine transform through three of its corners
// projected like the boundaries (error well under a pixel). Terms: 国土地理院コンテンツ利用規約, with
// the source shown as 「地理院タイル」 (https://maps.gsi.go.jp/development/ichiran.html).

import { INSET_BOX, lccInverse, projectIn, type Layout, type Space } from './project';
import type { Label } from './data';

export interface TileLayer extends Label {
  key: string;
  path: string;
  ext: 'png' | 'jpg';
  minZ: number;
  maxZ: number;
  /** thematic layers are transparent where there is no data: drawn over the pale map */
  thematic?: boolean;
  /** darken in the dark theme (light base maps) */
  invertDark?: boolean;
  group: 'base' | 'relief' | 'ground';
}

export const TILE_LAYERS: TileLayer[] = [
  { key: 'pale', path: 'pale', ext: 'png', minZ: 5, maxZ: 18, ja: '淡色地図', en: 'Pale map', group: 'base', invertDark: true },
  { key: 'std', path: 'std', ext: 'png', minZ: 5, maxZ: 18, ja: '標準地図', en: 'Standard map', group: 'base', invertDark: true },
  { key: 'photo', path: 'seamlessphoto', ext: 'jpg', minZ: 2, maxZ: 18, ja: '写真', en: 'Aerial photos', group: 'base' },
  { key: 'hillshade', path: 'hillshademap', ext: 'png', minZ: 2, maxZ: 16, ja: '陰影起伏図', en: 'Hillshade', group: 'relief' },
  { key: 'relief', path: 'relief', ext: 'png', minZ: 5, maxZ: 15, ja: '色別標高図', en: 'Elevation colours', group: 'relief' },
  { key: 'slope', path: 'slopemap', ext: 'png', minZ: 3, maxZ: 15, ja: '傾斜量図', en: 'Slope', group: 'relief' },
  { key: 'lcmfc', path: 'lcmfc2', ext: 'png', minZ: 11, maxZ: 16, ja: '治水地形分類図', en: 'Flood-control landform map', group: 'ground', thematic: true },
  { key: 'swale', path: 'swale', ext: 'png', minZ: 10, maxZ: 16, ja: '明治期の低湿地', en: 'Meiji-era wetlands', group: 'ground', thematic: true },
  { key: 'lcm', path: 'lcm25k_2012', ext: 'png', minZ: 10, maxZ: 16, ja: '土地条件図', en: 'Land condition map', group: 'ground', thematic: true },
];
const BASE = 'https://cyberjapandata.gsi.go.jp/xyz';
export const tileUrl = (l: TileLayer, z: number, x: number, y: number) => `${BASE}/${l.path}/${z}/${x}/${y}.${l.ext}`;

// ------------------------------------------------------------ Web Mercator tile maths
const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z; };
const x2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const y2lat = (y: number, z: number) => { const nn = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(Math.sinh(nn)); };

/** a tile and its (n+1)×(n+1) grid of projected points: drawn as n×n small affine pieces, so that
 *  large tiles at small scales follow the projection too */
export interface Tile { key: string; z: number; x: number; y: number; space: Space; n: number; grid: [number, number][] }

/**
 * Tiles covering the visible part of the map.
 *   view: visible rectangle in planar metres (main space), inset rectangles that are on screen,
 *   pxPerMetre: screen pixels per metre (for the zoom level).
 */
export function visibleTiles(layer: TileLayer, L: Layout, view: { x0: number; y0: number; x1: number; y1: number },
  insetsOnScreen: ('okinawa' | 'ogasawara')[], pxPerMetre: number, maxTiles = 160): { tiles: Tile[]; z: number; tooFar: boolean } {
  // zoom where a tile pixel is about a screen pixel at 36°N (Mercator: 156543 m/px at z0 on the equator)
  let z = Math.round(Math.log2(pxPerMetre * 156543.03 * Math.cos((36 * Math.PI) / 180)));
  const tooFar = z < layer.minZ - 1;
  z = Math.max(layer.minZ, Math.min(layer.maxZ, z));
  const boxes: { space: Space; b: [number, number, number, number] }[] = [];
  // main space: invert the corners and edge midpoints of the view
  const pts: [number, number][] = [];
  for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) pts.push(lccInverse(view.x0 + (view.x1 - view.x0) * fx, view.y0 + (view.y1 - view.y0) * fy));
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  boxes.push({ space: 'main', b: [Math.max(120, Math.min(...lons)), Math.max(20, Math.min(...lats)), Math.min(156, Math.max(...lons)), Math.min(47, Math.max(...lats))] });
  for (const k of insetsOnScreen) boxes.push({ space: k, b: INSET_BOX[k] });
  for (;;) {
    const tiles: Tile[] = [];
    for (const { space, b } of boxes) {
      if (b[0] >= b[2] || b[1] >= b[3]) continue;
      const tx0 = Math.floor(lon2x(b[0], z)), tx1 = Math.floor(lon2x(b[2], z));
      const ty0 = Math.floor(lat2y(b[3], z)), ty1 = Math.floor(lat2y(b[1], z));
      for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
        const w = x2lon(x, z), e = x2lon(x + 1, z), nLat = y2lat(y, z), s = y2lat(y + 1, z);
        // the main space must not repeat what the insets show
        if (space === 'main' && ((nLat < 27.2 && w > 122 && e < 131.6) || (w > 139 && s < 27.9 && nLat < 28.1 && e < 143))) continue;
        // pieces per side: more for big tiles (low zoom)
        const n = z <= 6 ? 8 : z <= 8 ? 4 : z <= 10 ? 2 : 1;
        const grid: [number, number][] = [];
        for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) grid.push(projectIn(x2lon(x + i / n, z), y2lat(y + j / n, z), L, space));
        tiles.push({ key: `${z}/${x}/${y}`, z, x, y, space, n, grid });
      }
    }
    if (tiles.length <= maxTiles || z <= layer.minZ) return { tiles, z, tooFar };
    z--;
  }
}

// ------------------------------------------------------------ image cache
const cache = new Map<string, HTMLImageElement>();
/** a tile image, loaded once; `onload` asks the map to redraw */
export function tileImage(url: string, onload: () => void): HTMLImageElement | null {
  const hit = cache.get(url);
  if (hit) return hit.complete && hit.naturalWidth ? hit : null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = onload;
  img.src = url;
  cache.set(url, img);
  if (cache.size > 600) cache.delete(cache.keys().next().value!);
  return null;
}
