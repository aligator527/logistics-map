// Expressway network for travel-time estimates -> public/geo/network.json
//
//   node scripts/build-network.mjs      (needs N06 in data/geo/ like build-roads, public/data/muni.json,
//                                        multimodal.json, dpl.json and data/raw/mesh/pop2020.json)
//
// A coarse, transparent model — not a route planner:
//   * expressways (N06, sections in service) at a flat speed per road type (SPEED below);
//   * getting on and off at IC / smart IC or at a dead end of a section, by ordinary roads:
//     straight-line distance × DETOUR at LOCAL km/h (Hokkaido LOCAL_HK), up to ACCESS_KM;
//     an access leg must not cross open water: every km along the straight line has to lie within
//     WATER_KM of a populated 1 km grid cell (else the nearest entry on the same land is used);
//   * a trip by ordinary roads only is allowed up to DIRECT_KM (checked in the browser);
//   * ordinary-road legs never cross the sea: both ends must be on the same "land component" —
//     municipalities that share a border, or whose populated grid cells lie within LINK_KM of each
//     other (bridges and tunnels over narrow straits such as 関門 or 天草 link up; 津軽海峡, 佐渡
//     or the Izu islands do not).
// Each origin or destination (municipality centre, port, airport, freight station, DPL site) gets
// its access legs here; the browser runs Dijkstra over the graph (src/lib/travel.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GridIndex, km } from './lib/geo-ll.mjs';
import { writeJson } from './lib/io.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, process.argv[2] ?? 'data/geo/N06-25/N06-25_GML/UTF-8');
const tag = dir.match(/N06-(\d+)/)?.[1] ?? '25';
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const SPEED = { 1: 80, 2: 65, 3: 60, 4: 80, 5: 45 }; // N06_008 road type -> km/h
const LOCAL = 30, LOCAL_HK = 40, DETOUR = 1.3, ACCESS_KM = 80, DIRECT_KM = 30, WATER_KM = 3, LINK_KM = 2.5, ACCESS_N = 6;

// ------------------------------------------------------------------ 1. graph from the sections
const sections = read(`${dir.replace(root + '/', '')}/N06-${tag}_HighwaySection.geojson`).features.filter((f) => f.properties.N06_003 === 9999);
const joints = read(`${dir.replace(root + '/', '')}/N06-${tag}_Joint.geojson`).features
  .filter((f) => f.properties.N06_014 === 9999 && ['1', '2', '3'].includes(String(f.properties.N06_019)));
const key = ([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`;
// Sections that meet do not always share an exact vertex (often off by < 1 m): snap each line end
// onto the nearest vertex of another line within SNAP_M, so that the roads connect.
const SNAP_M = Number(process.env.SNAP_M ?? 30), cellOf = ([lon, lat]) => `${Math.floor(lon * 1000)}|${Math.floor(lat * 1000)}`;
{
  const grid = new Map();
  sections.forEach((f, si) => f.geometry.coordinates.forEach((line, li) => line.forEach((p) => {
    const c = cellOf(p); (grid.get(c) ?? grid.set(c, []).get(c)).push([p, `${si}/${li}`]);
  })));
  let snapped = 0;
  sections.forEach((f, si) => f.geometry.coordinates.forEach((line, li) => {
    for (const end of [0, line.length - 1]) {
      const p = line[end];
      let best = null, bd = SNAP_M;
      const [cx, cy] = cellOf(p).split('|').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const [q, id] of grid.get(`${cx + dx}|${cy + dy}`) ?? []) {
          if (id === `${si}/${li}`) continue;
          const d = Math.hypot((q[0] - p[0]) * 111320 * Math.cos((p[1] * Math.PI) / 180), (q[1] - p[1]) * 110574);
          if (d < bd || (d === bd && best)) { bd = d; best = q; }
        }
      }
      if (best && key(best) !== key(p)) { line[end] = [...best]; snapped++; }
    }
  }));
  console.log(`snapped ${snapped} line ends onto neighbouring lines`);
}
// a vertex becomes a node when it ends a line, is shared by two lines, or is a joint
const uses = new Map();
for (const f of sections) for (const line of f.geometry.coordinates) for (const p of line) uses.set(key(p), (uses.get(key(p)) ?? 0) + 1);
const jointAt = new Map(joints.map((f) => [key(f.geometry.coordinates), String(f.properties.N06_019)]));
const nodes = [], nodeOf = new Map();
const node = (p) => {
  const k = key(p);
  if (!nodeOf.has(k)) { nodeOf.set(k, nodes.length); nodes.push({ lon: p[0], lat: p[1], adj: [], entry: false }); }
  return nodeOf.get(k);
};
const ends = new Map(); // vertex -> number of line ends there
for (const f of sections) for (const line of f.geometry.coordinates) for (const p of [line[0], line.at(-1)]) ends.set(key(p), (ends.get(key(p)) ?? 0) + 1);
for (const f of sections) {
  const v = SPEED[Number(f.properties.N06_008)] ?? 60;
  for (const line of f.geometry.coordinates) {
    let from = node(line[0]), len = 0;
    for (let i = 1; i < line.length; i++) {
      len += km({ lon: line[i - 1][0], lat: line[i - 1][1] }, { lon: line[i][0], lat: line[i][1] });
      const k = key(line[i]);
      if (i === line.length - 1 || uses.get(k) > 1 || jointAt.has(k)) {
        const to = node(line[i]), min = (len / v) * 60;
        nodes[from].adj.push([to, min]); nodes[to].adj.push([from, min]);
        from = to; len = 0;
      }
    }
  }
}
// entries: IC and smart IC (not JCT), and dead ends where a section runs into ordinary roads
for (const [k, kind] of jointAt) if (kind !== '3' && nodeOf.has(k)) nodes[nodeOf.get(k)].entry = true;
for (const [k, n] of ends) if (n === 1 && !jointAt.has(k)) nodes[nodeOf.get(k)].entry = true;

const pieces = (ns) => {
  const par = ns.map((_, i) => i), fr = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  ns.forEach((n, i) => { for (const [j] of n.adj) par[fr(i)] = fr(j); });
  const size = new Map(); ns.forEach((n, i) => { if (n.adj.length) size.set(fr(i), (size.get(fr(i)) ?? 0) + 1); });
  return [...size.values()].sort((a, b) => b - a).slice(0, 4).join(', ');
};
console.log(`road pieces before contraction: ${pieces(nodes)}`);
// contract pass-through nodes (two neighbours, not an entry) to keep the file small
for (const [i, n] of nodes.entries()) {
  if (n.entry || n.adj.length !== 2 || n.adj[0][0] === n.adj[1][0]) continue;
  const [[a, ta], [b, tb]] = n.adj;
  if (a === i || b === i) continue;
  const A = nodes[a], B = nodes[b];
  A.adj = A.adj.filter(([x]) => x !== i); B.adj = B.adj.filter(([x]) => x !== i);
  A.adj.push([b, ta + tb]); B.adj.push([a, ta + tb]);
  n.adj = []; n.gone = true;
}
const keep = nodes.map((n, i) => [n, i]).filter(([n]) => !n.gone && n.adj.length);
const newId = new Map(keep.map(([, i], j) => [i, j]));
const edges = [];
for (const [n, i] of keep) for (const [to, t] of n.adj) if (i < to && newId.has(to)) edges.push(newId.get(i), newId.get(to), Math.max(1, Math.round(t * 10)));
const graph = keep.map(([n]) => n);
console.log(`road pieces after: ${pieces(nodes)}`);
console.log(`network: ${graph.length} nodes (${graph.filter((n) => n.entry).length} entries), ${edges.length / 3} edges`);

// ------------------------------------------------------------------ 2. land components
const muni = read('public/data/muni.json');
const mIndex = new Map(muni.codes.map((c, i) => [c, i]));
const parent = Int32Array.from(muni.codes, (_, i) => i);
const findRoot = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
const union = (a, b) => { a = findRoot(a); b = findRoot(b); if (a !== b) parent[a] = b; };
{ // shared borders
  const topo = read('public/geo/japan.topo.json');
  const { neighbors } = await import('topojson-client');
  const geoms = topo.objects.muni.geometries;
  neighbors(geoms).forEach((ns, i) => {
    const a = mIndex.get(String(geoms[i].id));
    for (const j of ns) { const b = mIndex.get(String(geoms[j].id)); if (a !== undefined && b !== undefined) union(a, b); }
  });
}
// grid rows: [lat, lon, pop, …, codes from index 9]; a cell split between municipalities belongs to all
const mesh = read('data/raw/mesh/pop2020.json').map(([lat, lon, , , , , , , , ...codes], i) => ({ lat, lon, i, m: codes.map((c) => mIndex.get(c)).filter((x) => x !== undefined) }));
const meshIdx = new GridIndex(mesh, 0.1);
for (const m of mesh) {
  for (let k = 1; k < m.m.length; k++) union(m.m[0], m.m[k]);
  for (const o of meshIdx.within(m, LINK_KM)) if (o.m[0] !== m.m[0] && o.m.length && m.m.length) union(m.m[0], o.m[0]);
}
const compSize = new Map();
muni.codes.forEach((_, i) => compSize.set(findRoot(i), (compSize.get(findRoot(i)) ?? 0) + 1));
// number components by size (0 = the biggest, Honshu–Kyushu–Shikoku)
const compId = new Map([...compSize].sort((a, b) => b[1] - a[1]).map(([r], j) => [r, j]));
const muniComp = muni.codes.map((_, i) => compId.get(findRoot(i)));
const compAt = (q) => { const { p } = meshIdx.nearest(q, 40); return p?.m.length ? muniComp[p.m[0]] : -1; };
console.log(`land components: ${compId.size}; largest ${[...compSize.values()].sort((a, b) => b - a).slice(0, 5).join(', ')} municipalities`);
/** the straight line stays near populated land (no open water) */
const overLand = (a, b) => {
  const d = km(a, b), n = Math.floor(d);
  for (let k = 1; k < n; k++) {
    const q = { lat: a.lat + ((b.lat - a.lat) * k) / n, lon: a.lon + ((b.lon - a.lon) * k) / n };
    if (!meshIdx.within(q, WATER_KM).length) return false;
  }
  return true;
};

// ------------------------------------------------------------------ 2b. gaps between expressways
// N06 has pieces that meet only through ordinary roads (函館新道 and 道央道, 八戸久慈 …): link every
// piece to each other piece on the same land by its closest pair of entries within GAP_KM,
// travelled at the ordinary-road speed.
const GAP_KM = 60;
{
  const par = graph.map((_, i) => i), fr = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  for (let k = 0; k < edges.length; k += 3) par[fr(edges[k])] = fr(edges[k + 1]);
  const ents = graph.map((n, j) => ({ lat: n.lat, lon: n.lon, j })).filter((e) => graph[e.j].entry);
  for (const e of ents) { e.piece = fr(e.j); e.comp = compAt(e); }
  const idx = new GridIndex(ents, 0.1);
  const best = new Map(); // "pieceA|pieceB" -> [a, b, km]
  for (const e of ents) {
    for (const f of idx.within(e, GAP_KM)) {
      if (f.piece === e.piece || f.comp !== e.comp) continue;
      const key = e.piece < f.piece ? `${e.piece}|${f.piece}` : `${f.piece}|${e.piece}`;
      const d = km(e, f);
      if (!(best.get(key)?.[2] <= d)) best.set(key, [e, f, d]);
    }
  }
  let added = 0;
  for (const [e, f, d] of best.values()) {
    if (!overLand(e, f)) continue;
    const min = (d * DETOUR / (e.lat > 41.4 && e.lon > 139.3 ? LOCAL_HK : LOCAL)) * 60;
    edges.push(e.j, f.j, Math.max(1, Math.round(min * 10)));
    added++;
  }
  const par2 = graph.map((_, i) => i), fr2 = (i) => { while (par2[i] !== i) i = par2[i] = par2[par2[i]]; return i; };
  for (let k = 0; k < edges.length; k += 3) par2[fr2(edges[k])] = fr2(edges[k + 1]);
  const sizes = new Map(); graph.forEach((_, i) => sizes.set(fr2(i), (sizes.get(fr2(i)) ?? 0) + 1));
  console.log(`linked ${added} gaps between expressway pieces by ordinary roads; pieces now ${[...sizes.values()].sort((a, b) => b - a).slice(0, 5).join(', ')}`);
}

// ------------------------------------------------------------------ 3. access legs
const entries = graph.map((n, j) => ({ lat: n.lat, lon: n.lon, j })).filter((e) => graph[e.j].entry);
for (const e of entries) e.comp = compAt(e);
const entryIdx = new GridIndex(entries, 0.1);
const localMin = (d, lat, lon) => (d * DETOUR / (lat > 41.4 && lon > 139.3 ? LOCAL_HK : LOCAL)) * 60;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
function place(lon, lat) {
  const q = { lon, lat }, comp = compAt(q);
  const near = entryIdx.within(q, ACCESS_KM).filter((e) => e.comp === comp).sort((a, b) => km(q, a) - km(q, b));
  let pick = near.filter((e, k) => k < 30 && overLand(q, e)).slice(0, ACCESS_N);
  if (!pick.length) pick = near.slice(0, 1);
  const acc = pick.map((e) => [e.j, Math.max(1, Math.round(localMin(km(q, e), lat, lon) * 10))]);
  return { ll: [r4(lon), r4(lat)], comp, acc: acc.flat() };
}

// the grid-weighted centre of each municipality (etl-muni keeps it only as planar xy): recompute it
// from the grid rows, which carry the municipality code from index 9 on
const sum = new Map();
for (const [lat, lon, pop, , , , , , , ...codes] of read('data/raw/mesh/pop2020.json')) {
  if (!(pop > 0)) continue;
  for (const c of codes) { const s = sum.get(c) ?? sum.set(c, [0, 0, 0]).get(c); const w = pop / codes.length; s[0] += lat * w; s[1] += lon * w; s[2] += w; }
}
const pts = read('data/geo/tmp/muni-points.json').features;
const fallback = new Map();
{
  const { default: proj4 } = await import('proj4');
  const inv = proj4(read('public/geo/japan.topo.json').meta.proj, 'EPSG:4326');
  for (const f of pts) if (f.geometry) fallback.set(String(f.properties.code), inv.forward(f.geometry.coordinates));
}
const munis = muni.codes.map((c) => {
  const s = sum.get(c);
  const [lon, lat] = s && s[2] ? [s[1] / s[2], s[0] / s[2]] : fallback.get(c) ?? [NaN, NaN];
  return place(lon, lat);
});
const noAccess = munis.filter((m) => !m.acc.length).length;
console.log(`municipalities: ${munis.length}; without an expressway entry within ${ACCESS_KM} km on the same land: ${noAccess}`);

const mm = read('public/data/multimodal.json');
const pois = {};
for (const it of mm.items) pois[`${it.kind}:${it.name}`] = place(it.lon, it.lat);
for (const s of read('public/data/dpl.json').sites) pois[`site:${s.name}`] = place(s.lon, s.lat);

writeJson(resolve(root, 'public/geo/network.json'), {
  source: {
    ja: `国土数値情報（高速道路時系列データ N06, 20${tag}年度）から推計`,
    en: `Estimated from MLIT expressway data (N06, FY20${tag})`,
    url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N06-2025.html',
  },
  params: { speed: SPEED, local: LOCAL, localHk: LOCAL_HK, detour: DETOUR, accessKm: ACCESS_KM, directKm: DIRECT_KM, linkKm: LINK_KM },
  nodes: graph.length,
  edges,
  munis: { ll: munis.map((m) => m.ll), comp: muniComp, acc: munis.map((m) => m.acc) },
  pois,
  /** entries for origins picked anywhere on the map: [node, lon, lat, land component] */
  entries: entries.map((e) => [e.j, r4(e.lon), r4(e.lat), e.comp]),
  generated: new Date().toISOString().slice(0, 10),
});
console.log(`wrote public/geo/network.json`);

// ------------------------------------------------------------------ 4. 1 km population grid for reach maps
// public/geo/grid.bin.gz: four Uint16 arrays of n cells — (lat − 20)·1000, (lon − 120)·1000, 2020
// population (capped at 65535), land component — about 1.4 MB before compression.
{
  const raw = read('data/raw/mesh/pop2020.json');
  const cells = raw.map(([lat, lon, pop], i) => ({ lat, lon, pop, i })).filter((c) => c.pop > 0);
  const n = cells.length;
  const buf = new Uint16Array(4 * n);
  cells.forEach((c, k) => {
    const m = mesh[c.i].m;
    buf[k] = Math.round((c.lat - 20) * 1000);
    buf[n + k] = Math.round((c.lon - 120) * 1000);
    buf[2 * n + k] = Math.min(65535, Math.round(c.pop));
    buf[3 * n + k] = m.length ? muniComp[m[0]] : compAt(c);
  });
  // stored gzipped (GitHub Pages does not compress binary files); the browser inflates it
  writeFileSync(resolve(root, 'public/geo/grid.bin.gz'), gzipSync(Buffer.from(buf.buffer), { level: 9 }));
  console.log(`wrote public/geo/grid.bin.gz: ${n} cells`);
}
