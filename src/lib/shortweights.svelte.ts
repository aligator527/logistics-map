// Your own weighting of the shortlist: criteria (municipal metrics, 10-year cost, commute pool) and weights 0–5,
// kept in this browser. Each criterion ranks the candidates 0 (worst) – 100 (best) by its better direction; the
// score is the weighted mean.
const KEY = 'shortWeights';
function read(): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
class ShortWeights {
  w = $state<Record<string, number>>(read());
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.w)); } catch { /* private mode */ } }
  set(k: string, v: number) { this.w = { ...this.w, [k]: v }; this.save(); }
  remove(k: string) { const { [k]: _, ...rest } = this.w; this.w = rest; this.save(); }
  replace(w: Record<string, number>) { this.w = { ...w }; this.save(); }
  get keys() { return Object.keys(this.w); }
}
export const shortWeights = new ShortWeights();

/** presets: criteria and weights for common priorities */
export const WEIGHT_PRESETS: { key: string; ja: string; en: string; w: Record<string, number> }[] = [
  { key: 'cost', ja: 'コスト重視', en: 'Cost first', w: { tco: 5, land: 2, compete: 2, pop30: 1 } },
  { key: 'reach', ja: '配送・アクセス重視', en: 'Reach first', w: { pop30: 4, ic: 3, tPort: 2, tco: 2 } },
  { key: 'labour', ja: '人手重視', en: 'Labour first', w: { commute30: 5, compete: 4, tco: 2 } },
  { key: 'risk', ja: '災害リスク重視', en: 'Safety first', w: { hz_flood: 4, hz_liq: 3, quake: 3, dEmerg: 2, tco: 1 } },
];

/** 0–100 per candidate for one criterion (NaN where unknown); dir 1 = more is better */
export function normalise(vals: number[], dir: 1 | -1) {
  const f = vals.filter(isFinite);
  if (!f.length) return vals.map(() => NaN);
  const lo = Math.min(...f), hi = Math.max(...f);
  return vals.map((v) => (!isFinite(v) ? NaN : hi === lo ? 100 : dir === 1 ? ((v - lo) / (hi - lo)) * 100 : ((hi - v) / (hi - lo)) * 100));
}
