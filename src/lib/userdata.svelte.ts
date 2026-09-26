// 自社データ: the user's own places (customers, stores, plants, shipments) from a CSV / TSV file — name, coordinates or
// an address, and a volume. Addresses are geocoded with the GSI address search; every point is assigned to the
// municipality whose outline contains it, and the volumes summed per municipality become a demand the delivery cost,
// the simulation and the screening can use. Nothing leaves the browser except the address lookups; the data is kept
// in this browser only (never in the URL).
import { store } from './store.svelte';
import { project as projectLL } from './project';
import { searchAddress } from './pointinfo';

export interface UserPoint { name: string; lon: number; lat: number; w: number; muni: string; addr?: string }
export interface UserData { file: string; points: UserPoint[]; failed: string[]; loaded: string }

const KEY = 'userData';
function read(): UserData | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && Array.isArray(v.points) ? v : null; } catch { return null; }
}

// ------------------------------------------------------------ CSV
/** text of a file: UTF-8 (with or without BOM), else Shift_JIS (Excel's Japanese default) */
export async function decodeFile(f: File) {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { return new TextDecoder('shift_jis').decode(buf); }
}
/** rows of a CSV / TSV (quoted fields with commas, quotes and line breaks) */
export function parseCsv(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/\t/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
const COLS = {
  name: /^(name|名称|名前|店舗名|顧客名|拠点名|施設名|取引先|会社名)$/i,
  lat: /^(lat|latitude|緯度|y)$/i,
  lon: /^(lon|lng|long|longitude|経度|x)$/i,
  addr: /^(address|addr|住所|所在地|納品先住所)$/i,
  w: /^(weight|volume|qty|quantity|amount|count|件数|数量|物量|出荷量|重量|売上|金額|ケース数|個数)$/i,
};
export function columns(head: string[]) {
  const find = (re: RegExp) => head.findIndex((h) => re.test(h.trim()));
  return { name: find(COLS.name), lat: find(COLS.lat), lon: find(COLS.lon), addr: find(COLS.addr), w: find(COLS.w) };
}
/** a number from a cell; an empty cell is no value (not 0) */
const num = (s: string | undefined) => { const x = String(s ?? '').replace(/[,\s，]/g, ''); if (!x) return NaN; const v = Number(x); return isFinite(v) ? v : NaN; };

// ------------------------------------------------------------ municipality of a point (its outline on the map)
let hitCtx: CanvasRenderingContext2D | null = null;
const paths = new Map<string, Path2D>();
export function muniAt(lon: number, lat: number): string {
  const geo = store.geo;
  if (!geo?.layout || !geo.munis.length) return '';
  const { p, space } = projectLL(lon, lat, geo.layout);
  if (space === 'outside') return '';
  const [x, y] = geo.P(p);
  hitCtx ??= document.createElement('canvas').getContext('2d');
  let best = '', bd = Infinity;
  for (const m of geo.munis) {
    const [[x0, y0], [x1, y1]] = m.bbox;
    if (x < x0 - 0.5 || x > x1 + 0.5 || y < y0 - 0.5 || y > y1 + 0.5) continue;
    let path = paths.get(m.code);
    if (!path) { path = new Path2D(m.d); paths.set(m.code, path); }
    if (hitCtx!.isPointInPath(path, x, y)) return m.code;
    // on the coast just outside a simplified outline: the nearest centre among the boxes that are close
    const d = Math.hypot(m.centroid[0] - x, m.centroid[1] - y);
    if (d < bd) { bd = d; best = m.code; }
  }
  return best;
}

// ------------------------------------------------------------ the loaded data
class UserStore {
  data = $state.raw<UserData | null>(read());
  busy = $state<{ done: number; total: number } | null>(null);
  error = $state('');
  private save() {
    try { if (this.data) localStorage.setItem(KEY, JSON.stringify(this.data)); else localStorage.removeItem(KEY); } catch { /* too large or private mode: kept for this visit */ }
  }
  clear() { this.data = null; this.save(); }
  /** volume per municipality (same order as muni.codes), or null */
  readonly perMuni = $derived.by(() => {
    const m = store.muni, d = this.data;
    if (!m || !d?.points.length) return null;
    const idx = new Map(m.codes.map((c, i) => [c, i]));
    const out = new Array<number>(m.codes.length).fill(0);
    for (const p of d.points) { const i = idx.get(p.muni); if (i !== undefined) out[i] += p.w; }
    return out;
  });
  readonly total = $derived(this.data?.points.reduce((s, p) => s + p.w, 0) ?? 0);

  async load(f: File) {
    this.error = '';
    const rows = parseCsv(await decodeFile(f));
    if (rows.length < 2) { this.error = 'empty'; return; }
    const c = columns(rows[0]);
    if ((c.lat < 0 || c.lon < 0) && c.addr < 0) { this.error = 'columns'; return; }
    const body = rows.slice(1, 5001);
    const points: UserPoint[] = [], failed: string[] = [];
    const cache = new Map<string, [number, number] | null>();
    this.busy = { done: 0, total: body.length };
    for (const [k, r] of body.entries()) {
      const name = (c.name >= 0 ? r[c.name] : '')?.trim() || `#${k + 1}`;
      const w = c.w >= 0 ? num(r[c.w]) : 1;
      let lon = c.lon >= 0 ? num(r[c.lon]) : NaN, lat = c.lat >= 0 ? num(r[c.lat]) : NaN;
      const addr = c.addr >= 0 ? r[c.addr]?.trim() : '';
      if (!(isFinite(lon) && isFinite(lat)) && addr) {
        // one lookup per distinct address, politely spaced
        if (!cache.has(addr)) {
          const hit = (await searchAddress(addr, 1))[0];
          cache.set(addr, hit ? [hit.lon, hit.lat] : null);
          await new Promise((res) => setTimeout(res, 120));
        }
        const ll = cache.get(addr);
        if (ll) [lon, lat] = ll;
      }
      if (isFinite(lon) && isFinite(lat) && lon > 120 && lon < 155 && lat > 20 && lat < 46) {
        const muni = muniAt(lon, lat);
        if (muni) points.push({ name, lon, lat, w: isFinite(w) && w > 0 ? w : 0, muni, ...(addr ? { addr } : {}) });
        else failed.push(name);
      } else failed.push(name);
      if (k % 10 === 0) this.busy = { done: k + 1, total: body.length };
    }
    this.busy = null;
    this.data = { file: f.name, points, failed, loaded: new Date().toISOString().slice(0, 10) };
    this.save();
  }
}
export const userData = new UserStore();

/** a demand array for a key: a municipal metric, or the user's own volumes ('user') */
export function demandArray(key: string): number[] {
  const m = store.muni;
  if (!m) return [];
  if (key === 'user' && userData.perMuni) return userData.perMuni;
  return ((m.m as Record<string, (number | null)[]>)[key] ?? m.m.pop).map((v) => v ?? 0);
}

export const TEMPLATE = 'name,address,lat,lon,volume\n例：名古屋支店,愛知県名古屋市中区三の丸3-1-1,,,120\n例：春日井倉庫,,35.2474,136.9722,80\n';
