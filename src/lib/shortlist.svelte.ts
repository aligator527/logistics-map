// Candidate shortlist (prefectures, municipalities, DPL sites), kept in this browser only.

export type ShortKind = 'pref' | 'muni' | 'site';
export interface ShortItem { kind: ShortKind; code: string }

const KEY = 'shortlist';
function read(): ShortItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && ['pref', 'muni', 'site'].includes(x.kind) && typeof x.code === 'string') : [];
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
}

export const shortlist = new Shortlist();
