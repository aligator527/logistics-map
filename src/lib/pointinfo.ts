// What is under a point: elevation (国土地理院 標高API) and landform (地形分類 GeoJSON tiles of the GSI
// vector-tile experiment — natural landform and artificial ground), with a plain caution level for
// ground and flooding. Class names follow the published legend; the GSI Maps link lets the user
// check the class and its explanation at the source.

export type Risk = 'low' | 'mid' | 'high';
export interface Landform { code: string; ja: string; en: string; risk: Risk }
export interface PointInfo {
  lon: number; lat: number;
  elev: number | null; elevSrc: string;
  natural: Landform | null;
  artificial: Landform | null;
  gsiUrl: string;
}

// Codes grouped as in GSI's own style (experimental_landformclassification*/style.js), where every
// code of a class shares one colour: 7-digit codes (2022 data) and the older 5-digit ones.
type Cls = Omit<Landform, 'code'> & { codes: string[]; artificial?: boolean };
const CLASSES: Cls[] = [
  { ja: '山地', en: 'Mountain', risk: 'low', codes: ['10101', '1010101', '11201', '11202', '11203', '11204'] },
  { ja: '崖・段丘崖', en: 'Cliff / terrace scarp', risk: 'mid', codes: ['10202', '10204', '2010201'] },
  { ja: '地すべり地形', en: 'Landslide topography', risk: 'high', codes: ['10205', '10206'] },
  { ja: '台地・段丘', en: 'Upland / terrace', risk: 'low', codes: ['10301', '10302', '10303', '10304', '10305', '10306', '10307', '10308', '10310', '10312', '10314', '10508', '2010101'] },
  { ja: '山麓堆積地形', en: 'Foot-of-slope deposit', risk: 'mid', codes: ['10401', '10402', '10403', '10404', '10406', '10407', '3010101'] },
  { ja: '扇状地', en: 'Alluvial fan', risk: 'mid', codes: ['10501', '10502', '3020101'] },
  { ja: '自然堤防', en: 'Natural levee', risk: 'mid', codes: ['10503', '3040101'] },
  { ja: '微高地', en: 'Slightly raised ground', risk: 'mid', codes: ['10506', '10507', '10801'] },
  { ja: '砂州・砂丘', en: 'Sand bar / dune', risk: 'mid', codes: ['10504', '10505', '10512', '3050101'] },
  { ja: '凹地・浅い谷', en: 'Depression / shallow valley', risk: 'high', codes: ['10601', '2010301'] },
  { ja: '氾濫平野', en: 'Flood plain', risk: 'high', codes: ['10701', '10702', '10705', '3030101'] },
  { ja: '後背低地・湿地', en: 'Back marsh / wetland', risk: 'high', codes: ['10703', '10804', '3030201'] },
  { ja: '旧河道', en: 'Former river channel', risk: 'high', codes: ['10704', '3040201', '3040202'] },
  { ja: '落堀', en: 'Scour pool', risk: 'high', codes: ['3040301'] },
  { ja: '河川敷・浜', en: 'River bed / beach', risk: 'high', codes: ['10802', '10803', '10807', '10808'] },
  { ja: '水部', en: 'Water', risk: 'high', codes: ['10805', '10806', '10901', '10903', '5010201'] },
  { ja: '旧水部', en: 'Former water body', risk: 'high', codes: ['10904', '5010301'] },
  // artificial ground: only classes confirmed at known places get a name (埋立地 at お台場・此花区,
  // 盛土地 in 葛飾区; 人工平坦地 in 多摩ニュータウン and a flattened industrial site in 北本市). The other
  // codes share colours across classes in GSI's style, so they are not named here.
  { ja: '盛土地・埋立地', en: 'Fill / reclaimed ground', risk: 'high', codes: ['11004', '11005', '11006', '11007', '11014', '4010201'], artificial: true },
  { ja: '人工平坦地', en: 'Artificially levelled ground', risk: 'mid', codes: ['11001'], artificial: true },
  { ja: '人工改変地（詳細は地理院地図で）', en: 'Other artificial ground (see GSI Maps)', risk: 'mid', codes: ['11002', '11003', '11008', '11009', '11010', '11011', '4010101', '4010301'], artificial: true },
];
const BY_CODE = new Map(CLASSES.flatMap((c) => c.codes.map((k) => [k, c] as const)));
const classOf = (code: string | null): Landform | null => {
  const c = code ? BY_CODE.get(code) : undefined;
  return c && code ? { code, ja: c.ja, en: c.en, risk: c.risk } : null;
};

// ------------------------------------------------------------ point in polygon on GeoJSON tiles (z14)
type Feat = { properties: { code: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } };
const tileCache = new Map<string, Promise<Feat[]>>();
function tile(layer: 1 | 2, lon: number, lat: number) {
  const z = 14, n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const s = Math.sin((lat * Math.PI) / 180);
  const y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  const key = `${layer}/${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, fetch(`https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification${layer}/${z}/${x}/${y}.geojson`)
      .then((r) => (r.ok ? r.json() : { features: [] })).then((j) => j.features as Feat[]).catch(() => []));
  }
  return tileCache.get(key)!;
}
const inRing = (x: number, y: number, ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
function codeAt(feats: Feat[], lon: number, lat: number) {
  for (const f of feats) {
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
    if (polys.some((p) => inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h)))) return String(f.properties.code);
  }
  return null;
}

const infoCache = new Map<string, Promise<PointInfo>>();
export function pointInfo(lon: number, lat: number): Promise<PointInfo> {
  const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;
  if (infoCache.has(key)) return infoCache.get(key)!;
  const p = (async (): Promise<PointInfo> => {
    const [elevRes, nat, art] = await Promise.all([
      fetch(`https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}&outtype=JSON`)
        .then((r) => r.json()).catch(() => null) as Promise<{ elevation: number | string; hsrc: string } | null>,
      tile(1, lon, lat), tile(2, lon, lat),
    ]);
    const e = elevRes && typeof elevRes.elevation === 'number' ? elevRes.elevation : null;
    const nc = codeAt(nat, lon, lat), ac = codeAt(art, lon, lat);
    return {
      lon, lat,
      elev: e, elevSrc: elevRes?.hsrc && e !== null ? elevRes.hsrc : '',
      natural: classOf(nc),
      artificial: classOf(ac),
      gsiUrl: `https://maps.gsi.go.jp/#16/${lat.toFixed(6)}/${lon.toFixed(6)}/&base=std&ls=std%7Cexperimental_landformclassification1%7Cexperimental_landformclassification2&vs=c1g1j0h0k0l0u0t0z0r0s0m0f1`,
    };
  })();
  infoCache.set(key, p);
  return p;
}
/** the stricter of the two caution levels */
export function groundRisk(i: PointInfo): Risk | null {
  const r = [i.natural?.risk, i.artificial?.risk].filter(Boolean) as Risk[];
  return r.includes('high') ? 'high' : r.includes('mid') ? 'mid' : r.length ? 'low' : null;
}

// ------------------------------------------------------------ address, hazards at the point
/** GSI reverse geocoder: municipality code and the 大字・町丁目 name */
export async function addressAt(lon: number, lat: number): Promise<{ muni: string; town: string } | null> {
  try {
    const j = await (await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`)).json();
    const m = String(j?.results?.muniCd ?? '').padStart(5, '0');
    return /^\d{5}$/.test(m) && m !== '00000' ? { muni: m, town: j.results.lv01Nm === '－' ? '' : j.results.lv01Nm ?? '' } : null;
  } catch { return null; }
}
/** GSI address search: up to n matches */
export async function searchAddress(q: string, n = 6): Promise<{ title: string; lon: number; lat: number }[]> {
  try {
    const r = await (await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`)).json();
    return (r ?? []).slice(0, n).map((f: { properties: { title: string }; geometry: { coordinates: [number, number] } }) =>
      ({ title: f.properties.title, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  } catch { return []; }
}

// ハザードマップポータル open-data tiles, read at the point (5×5 pixels at zoom 16, deepest class)
const DEPTH: [number, number, number, number][] = [[247, 245, 169, 1], [255, 216, 192, 2], [255, 183, 183, 3], [255, 145, 145, 4], [242, 133, 201, 5], [220, 122, 220, 6]];
export const DEPTH_LABEL: Record<number, { ja: string; en: string }> = {
  1: { ja: '0.5m未満', en: '< 0.5 m' }, 2: { ja: '0.5〜3m', en: '0.5–3 m' }, 3: { ja: '3〜5m', en: '3–5 m' },
  4: { ja: '5〜10m', en: '5–10 m' }, 5: { ja: '10〜20m', en: '10–20 m' }, 6: { ja: '20m以上', en: '≥ 20 m' },
};
const pixelCache = new Map<string, Promise<ImageData | null>>();
function tilePixels(layer: string, x: number, y: number): Promise<ImageData | null> {
  const key = `${layer}/${x}/${y}`;
  if (!pixelCache.has(key)) {
    pixelCache.set(key, new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return res(null);
        ctx.drawImage(img, 0, 0);
        res(ctx.getImageData(0, 0, 256, 256));
      };
      img.onerror = () => res(null); // 404: no zone on this tile
      img.src = `https://disaportaldata.gsi.go.jp/raster/${layer}/16/${x}/${y}.png`;
    }));
  }
  return pixelCache.get(key)!;
}
async function sample(layer: string, lon: number, lat: number, depth: boolean): Promise<number> {
  const n = 2 ** 16, fx = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180), fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy), px = Math.floor((fx - tx) * 256), py = Math.floor((fy - ty) * 256);
  const img = await tilePixels(layer, tx, ty);
  if (!img) return 0;
  let best = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = px + dx, y = py + dy;
    if (x < 0 || y < 0 || x > 255 || y > 255) continue;
    const o = (y * 256 + x) * 4;
    if (img.data[o + 3] < 128) continue;
    if (!depth) return 1;
    let k = 0, bd = Infinity;
    for (const [R, G, B, r] of DEPTH) { const d = (R - img.data[o]) ** 2 + (G - img.data[o + 1]) ** 2 + (B - img.data[o + 2]) ** 2; if (d < bd) { bd = d; k = r; } }
    best = Math.max(best, k);
  }
  return best;
}
export interface Hazards { flood: number; surge: number; tsunami: boolean; sabo: boolean }
/** flood / storm-surge depth class (0 = outside), tsunami and landslide-warning zones at the point */
export async function hazardsAt(lon: number, lat: number): Promise<Hazards> {
  const [flood, surge, tsunami, s1, s2, s3] = await Promise.all([
    sample('01_flood_l2_shinsuishin_data', lon, lat, true), sample('03_hightide_l2_shinsuishin_data', lon, lat, true),
    sample('04_tsunami_newlegend_data', lon, lat, false),
    sample('05_dosekiryukeikaikuiki', lon, lat, false), sample('05_kyukeishakeikaikuiki', lon, lat, false), sample('05_jisuberikeikaikuiki', lon, lat, false),
  ]);
  return { flood, surge, tsunami: tsunami > 0, sabo: s1 + s2 + s3 > 0 };
}
