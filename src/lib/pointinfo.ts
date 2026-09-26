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
  { ja: '切土地', en: 'Cut ground', risk: 'low', codes: ['11008', '4010101'], artificial: true },
  { ja: '盛土地・埋立地', en: 'Fill / reclaimed ground', risk: 'high', codes: ['11004', '11005', '11006', '11007', '11014', '4010201'], artificial: true },
  { ja: '干拓地', en: 'Reclaimed polder', risk: 'high', codes: ['11001', '11003', '11009', '11011', '4010301'], artificial: true },
  { ja: '人工改変地', en: 'Other artificial ground', risk: 'mid', codes: ['11002', '11010'], artificial: true },
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
