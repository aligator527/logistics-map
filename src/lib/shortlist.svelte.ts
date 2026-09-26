// Candidate shortlist (prefectures, municipalities, DPL sites), kept in this browser only.

/** point = a place picked on the map, code 'lon,lat'; plot = a measured area, code 'lon,lat_lon,lat_…' */
export type ShortKind = 'pref' | 'muni' | 'site' | 'point' | 'plot';
export interface ShortItem { kind: ShortKind; code: string }

const KEY = 'shortlist';
const PLOT_RE = /^(-?\d+\.\d+,-?\d+\.\d+_){2,39}-?\d+\.\d+,-?\d+\.\d+$/;

// ------------------------------------------------------------ plots
export const plotCode = (pts: [number, number][]) => pts.map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join('_');
export const plotRing = (code: string) => code.split('_').map((s) => s.split(',').map(Number) as [number, number]);
/** the place that stands for an item on the map: a point itself, a plot's centre ('lon,lat'), else null */
export function ptOf(it: ShortItem): string | null {
  if (it.kind === 'point') return it.code;
  if (it.kind !== 'plot') return null;
  const r = plotRing(it.code);
  return `${(r.reduce((s, p) => s + p[0], 0) / r.length).toFixed(5)},${(r.reduce((s, p) => s + p[1], 0) / r.length).toFixed(5)}`;
}
function read(): ShortItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && ['pref', 'muni', 'site', 'point', 'plot'].includes(x.kind) && typeof x.code === 'string') : [];
  } catch {
    return [];
  }
}

class Shortlist {
  items = $state<ShortItem[]>(read());
  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* private mode */ }
  }
  has(kind: ShortKind, code: string) { return this.items.some((x) => x.kind === kind && x.code === code); }
  toggle(kind: ShortKind, code: string) {
    this.items = this.has(kind, code) ? this.items.filter((x) => !(x.kind === kind && x.code === code)) : [...this.items, { kind, code }];
    this.save();
  }
  clear() { this.items = []; this.save(); }
  /** add several (shared list); replace = drop the current ones first */
  addAll(list: ShortItem[], replace = false) {
    const base = replace ? [] : this.items;
    this.items = [...base, ...list.filter((x) => !base.some((y) => y.kind === x.kind && y.code === x.code))];
    this.save();
  }
}

export const shortlist = new Shortlist();

// ------------------------------------------------------------ sharing by link
// #…&sl=m23206~p13~s:DPL札幌南Ⅱ — DPL sites by name (their index changes when the list is updated)
export type SharedToken = { kind: ShortKind; code?: string; name?: string };
function readShared(): SharedToken[] {
  try {
    const v = new URLSearchParams(location.hash.replace(/^#/, '')).get('sl');
    if (!v) return [];
    return v.split('~').slice(0, 30).map((t): SharedToken | null =>
      /^q-?\d+\.\d+,-?\d+\.\d+$/.test(t) ? { kind: 'point', code: t.slice(1) } : PLOT_RE.test(t.slice(1)) && t[0] === 'g' ? { kind: 'plot', code: t.slice(1) } : /^m\d{5}$/.test(t) ? { kind: 'muni', code: t.slice(1) } : /^p\d{1,2}$/.test(t) ? { kind: 'pref', code: String(Number(t.slice(1))) }
        : t.startsWith('s:') && t.length < 80 ? { kind: 'site', name: t.slice(2) } : null).filter((x): x is SharedToken => !!x);
  } catch { return []; }
}
/** a list opened from a shared link, waiting for the user to add or replace (read before the app rewrites the URL) */
export const shared = $state<{ tokens: SharedToken[] }>({ tokens: readShared() });

export function shareLink(items: ShortItem[], siteName: (i: number) => string | undefined) {
  const tokens = items.map((it) => (it.kind === 'muni' ? `m${it.code}` : it.kind === 'pref' ? `p${it.code}` : it.kind === 'point' ? `q${it.code}` : it.kind === 'plot' ? `g${it.code}` : `s:${siteName(Number(it.code)) ?? ''}`)).filter((x) => x !== 's:');
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  p.set('sl', tokens.join('~'));
  return `${location.origin}${location.pathname}#${p.toString()}`;
}
export function resolveShared(tokens: SharedToken[], siteIndex: (name: string) => number): ShortItem[] {
  return tokens.map((t): ShortItem | null => (t.kind === 'site' ? (siteIndex(t.name!) >= 0 ? { kind: 'site', code: String(siteIndex(t.name!)) } : null) : { kind: t.kind, code: t.code! }))
    .filter((x): x is ShortItem => !!x);
}
