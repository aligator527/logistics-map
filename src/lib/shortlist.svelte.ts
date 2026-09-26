// Candidate shortlist (prefectures, municipalities, DPL sites), kept in this browser only.

/** point = a place picked on the map, code 'lon,lat'; plot = a measured area, code 'lon,lat_lon,lat_…' */
export type ShortKind = 'pref' | 'muni' | 'site' | 'point' | 'plot';
/** where a candidate stands in the project */
export const STATUSES = ['cand', 'survey', 'nego', 'hold', 'drop'] as const;
export type Status = (typeof STATUSES)[number];
export interface ShortItem { kind: ShortKind; code: string; status?: Status; note?: string }

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
    return Array.isArray(v) ? v.filter((x) => x && ['pref', 'muni', 'site', 'point', 'plot'].includes(x.kind) && typeof x.code === 'string')
      .map((x) => ({ kind: x.kind, code: x.code, ...(STATUSES.includes(x.status) ? { status: x.status } : {}), ...(typeof x.note === 'string' && x.note ? { note: x.note.slice(0, 2000) } : {}) })) : [];
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
  private edit(it: ShortItem, patch: Partial<ShortItem>) {
    this.items = this.items.map((x) => (x.kind === it.kind && x.code === it.code ? { ...x, ...patch } : x));
    this.save();
  }
  setStatus(it: ShortItem, status: Status) { this.edit(it, { status }); }
  setNote(it: ShortItem, note: string) { this.edit(it, { note: note.slice(0, 2000) || undefined }); }
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
export type SharedToken = { kind: ShortKind; code?: string; name?: string; status?: Status };
function readShared(): SharedToken[] {
  try {
    const v = new URLSearchParams(location.hash.replace(/^#/, '')).get('sl');
    if (!v) return [];
    return v.split('~').slice(0, 30).map((raw): SharedToken | null => {
      // "…*2": status index
      const m = raw.match(/^(.*)\*([0-4])$/), t = m ? m[1] : raw, status = m ? STATUSES[Number(m[2])] : undefined;
      const tok: SharedToken | null =
      /^q-?\d+\.\d+,-?\d+\.\d+$/.test(t) ? { kind: 'point', code: t.slice(1) } : PLOT_RE.test(t.slice(1)) && t[0] === 'g' ? { kind: 'plot', code: t.slice(1) } : /^m\d{5}$/.test(t) ? { kind: 'muni', code: t.slice(1) } : /^p\d{1,2}$/.test(t) ? { kind: 'pref', code: String(Number(t.slice(1))) }
        : t.startsWith('s:') && t.length < 80 ? { kind: 'site', name: t.slice(2) } : null;
      return tok && status ? { ...tok, status } : tok;
    }).filter((x): x is SharedToken => !!x);
  } catch { return []; }
}
/** a list opened from a shared link, waiting for the user to add or replace (read before the app rewrites the URL) */
export const shared = $state<{ tokens: SharedToken[] }>({ tokens: readShared() });

export function shareLink(items: ShortItem[], siteName: (i: number) => string | undefined) {
  const tokens = items.map((it) => [it, (it.kind === 'muni' ? `m${it.code}` : it.kind === 'pref' ? `p${it.code}` : it.kind === 'point' ? `q${it.code}` : it.kind === 'plot' ? `g${it.code}` : `s:${siteName(Number(it.code)) ?? ''}`)] as const)
    .filter(([, x]) => x !== 's:').map(([it, x]) => (it.status && it.status !== 'cand' ? `${x}*${STATUSES.indexOf(it.status)}` : x));
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  p.set('sl', tokens.join('~'));
  return `${location.origin}${location.pathname}#${p.toString()}`;
}
export function resolveShared(tokens: SharedToken[], siteIndex: (name: string) => number): ShortItem[] {
  return tokens.map((t): ShortItem | null => {
    const it: ShortItem | null = t.kind === 'site' ? (siteIndex(t.name!) >= 0 ? { kind: 'site', code: String(siteIndex(t.name!)) } : null) : { kind: t.kind, code: t.code! };
    return it && t.status ? { ...it, status: t.status } : it;
  })
    .filter((x): x is ShortItem => !!x);
}
