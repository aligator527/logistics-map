// Theme: weighted site score (Phase 3). Combines the other themes' latest figures (and hazard
// indicators) into one 0–100 score per prefecture; see src/lib/score.ts for the method.

import { app } from '../lib/state.svelte';
import { valueOf, type Jobs, type Label, type Ssw, type Warehouse } from '../lib/data';
import { fmtCompact, fmtNum, fmtPct, makeClasses } from '../lib/scale';
import { score, sensitivity, type Criterion, type Preset } from '../lib/score';
import type { Tip } from '../components/Tooltip.svelte';
import type { CompareRow } from '../components/ComparePanel.svelte';
import { FlowsTheme } from './flows.svelte';
import { pad2, rankMap, type Ctx, type ThemeView } from './types';

export interface PrefStats { area: number[]; ic: number[]; sic: number[]; jct: number[] }
/** extra criteria contributed by other data (hazards), already per prefecture */
export type ExtraCriteria = Omit<Criterion, 'fmt'> & { unit: Label; digits: number };

export const PRESETS: Preset[] = [
  { key: 'balanced', ja: 'バランス', en: 'Balanced', weights: {} },
  { key: 'consumer', ja: '大消費地に近い', en: 'Near consumers', weights: { demand: 4, roads: 2, stock: 2, supply: 0, drivers: 1, handlers: 1, ssw: 0, vacancy: 1 } },
  { key: 'hub', ja: '広域配送ハブ', en: 'Wide-area hub', weights: { roads: 4, demand: 2, supply: 2, stock: 2, vacancy: 1, drivers: 1, handlers: 1, ssw: 0 } },
  { key: 'labour', ja: '人手を確保しやすい', en: 'Easier hiring', weights: { drivers: 4, handlers: 4, ssw: 2, demand: 1, roads: 1, stock: 0, supply: 0, vacancy: 1 } },
  { key: 'safe', ja: '災害リスクを避ける', en: 'Low hazard', weights: {} /* filled with the risk keys */ },
];

export class ScoreTheme implements ThemeView {
  // assigned in the constructor; declared first so the lazy $derived fields below can use them
  private w: Warehouse;
  private fl: FlowsTheme;
  private jobs: Jobs;
  private ssw: Ssw;
  private stats: PrefStats;
  private extra: ExtraCriteria[];
  private ctx: Ctx;
  constructor(w: Warehouse, fl: FlowsTheme, jobs: Jobs, ssw: Ssw, stats: PrefStats, extra: ExtraCriteria[], ctx: Ctx) {
    this.w = w; this.fl = fl; this.jobs = jobs; this.ssw = ssw; this.stats = stats; this.extra = extra; this.ctx = ctx;
  }

  readonly flows = [];
  readonly trend = null;
  /** median industrial land price per prefecture (from public/data/muni.json, loaded later) */
  landRaw = $state.raw<number[] | null>(null);
  private get L() { return this.ctx.L; }

  // ------------------------------------------------------------ criteria (latest data of each source)
  readonly criteria = $derived.by((): Criterion[] => {
    const L = this.L, w = this.w, q = w.quarters.length - 1;
    const qLabel = (lang: 'ja' | 'en') => w.quarters[q][lang];
    const lastYear = this.fl.years.at(-1)!;
    const M = this.fl.data.get(lastYear)?.annual.all ?? null;
    const tot = M ? FlowsTheme.totals(M) : null;
    const jp = this.jobs.periods.length - 1, jy = this.jobs.periods[jp];
    const sp = this.ssw.periods.length - 1, sy = this.ssw.periods[sp];
    const people = (v: number) => (L === 'ja' ? `${fmtCompact(L, v)}人` : fmtCompact(L, v));
    const tons = (v: number) => `${fmtCompact(L, v)}${L === 'ja' ? 'トン' : ' t'}`;
    const range = (n: number) => Array.from({ length: 47 }, (_, i) => n + i);
    const whSrc = { ja: `倉庫統計季報（${qLabel('ja')}）`, en: `MLIT warehouse statistics (${qLabel('en')})` };
    const flSrc = { ja: `物流センサス（${lastYear}年調査・年間）`, en: `Net Freight Flow Census (${lastYear}, annual)` };
    const jbSrc = { ja: `職業安定業務統計（${jy.ja}）`, en: `MHLW employment statistics (${jy.en})` };
    const list: Criterion[] = [
      { key: 'stock', ja: '倉庫ストック', en: 'Warehouse stock', group: 'market', dir: 1,
        raw: range(0).map((i) => valueOf(w, 'area', q, i)), fmt: (v) => `${fmtCompact(L, v * 1000)}${L === 'ja' ? '㎡' : ' m²'}`,
        hint: { ja: '営業倉庫の所管面積。物流集積の厚み', en: 'Commercial warehouse floor area: depth of the logistics cluster' }, source: whSrc },
      { key: 'vacancy', ja: '空きスペース', en: 'Free space', group: 'market', dir: 1,
        raw: range(0).map((i) => valueOf(w, 'vacancy', q, i)), fmt: (v) => fmtPct(L, v),
        hint: { ja: '空面積率。高いほど借りやすい', en: 'Vacancy rate: higher = easier to lease' }, source: whSrc },
      { key: 'demand', ja: '貨物の到着（需要）', en: 'Freight received (demand)', group: 'market', dir: 1,
        raw: range(0).map((i) => (tot ? tot.in[i] + tot.intra[i] : NaN)), fmt: tons,
        hint: { ja: '県外からの到着＋県内流動（年間）。消費・生産の需要', en: 'Received from other prefectures + within (annual): demand' }, source: flSrc },
      { key: 'supply', ja: '貨物の発送（出荷拠点）', en: 'Freight shipped out', group: 'market', dir: 1,
        raw: range(0).map((i) => (tot ? tot.out[i] : NaN)), fmt: tons,
        hint: { ja: '県外への発送（年間）。生産・出荷拠点の厚み', en: 'Shipped to other prefectures (annual): production base' }, source: flSrc },
      { key: 'roads', ja: '高速道路アクセス', en: 'Expressway access', group: 'access', dir: 1,
        raw: range(0).map((i) => ((this.stats.ic[i] + this.stats.sic[i]) / this.stats.area[i]) * 1000),
        fmt: (v) => `${fmtNum(L, v, 1)}${L === 'ja' ? ' IC/千㎢' : ' ICs per 1,000 km²'}`,
        hint: { ja: '面積あたりのIC・スマートIC数', en: 'Interchanges (incl. smart ICs) per area' },
        source: { ja: '国土数値情報 N06（2025年度）', en: 'MLIT N06 expressways (FY2025)' } },
      { key: 'drivers', ja: 'ドライバーの採用しやすさ', en: 'Driver hiring', group: 'labour', dir: -1,
        raw: range(1).map((c) => this.jobs.ratio.driver[jp][c - 1]), fmt: (v) => `${fmtNum(L, v, 2)}${L === 'ja' ? '倍' : '×'}`,
        hint: { ja: '自動車運転の有効求人倍率。低いほど採用しやすい', en: 'Job openings ratio for drivers: lower = easier to hire' }, source: jbSrc },
      { key: 'handlers', ja: '倉庫作業員の採用しやすさ', en: 'Warehouse-staff hiring', group: 'labour', dir: -1,
        raw: range(1).map((c) => this.jobs.ratio.handling[jp][c - 1]), fmt: (v) => `${fmtNum(L, v, 2)}${L === 'ja' ? '倍' : '×'}`,
        hint: { ja: '運搬の職業の有効求人倍率。低いほど採用しやすい', en: 'Job openings ratio for cargo handling: lower = easier to hire' }, source: jbSrc },
      { key: 'ssw', ja: '外国人材の厚み', en: 'Foreign workforce', group: 'labour', dir: 1,
        raw: range(0).map((i) => this.ssw.s1.total?.[sp]?.[i] ?? NaN), fmt: people,
        hint: { ja: '特定技能1号の在留者数（全分野）', en: 'Specified Skilled Workers (i), all fields' },
        source: { ja: `特定技能在留外国人数（${sy.ja}）`, en: `Specified Skilled Workers (${sy.en})` } },
      ...(this.landRaw ? [{ key: 'land', ja: '工業地の地価', en: 'Industrial land price', group: 'cost' as const, dir: -1 as const,
        raw: this.landRaw, fmt: (v: number) => `${fmtCompact(L, v)}${L === 'ja' ? '円/㎡' : ' ¥/m²'}`,
        hint: { ja: '工業地（地価公示・地価調査2026）の中央値。低いほど有利', en: 'Median industrial land price (2026). Lower is better' },
        source: { ja: '国土数値情報 地価公示・都道府県地価調査（2026年）', en: 'MLIT official land prices (2026)' } }] : []),
      ...this.extra.map((x) => ({ ...x, fmt: (v: number) => `${fmtNum(L, v, x.digits)}${x.unit[L]}` })),
    ];
    return list;
  });
  readonly keys = $derived.by(() => this.criteria.map((c) => c.key));

  // ------------------------------------------------------------ weights
  presetWeights(key: string): Record<string, number> {
    const p = PRESETS.find((x) => x.key === key) ?? PRESETS[0];
    const risk = this.criteria.filter((c) => c.group === 'risk').map((c) => c.key);
    const base: Record<string, number> = Object.fromEntries(this.keys.map((k) => [k, 1]));
    if (p.key === 'safe') return { ...base, ...Object.fromEntries(risk.map((k) => [k, 4])) };
    // presets written before hazards existed give them a light default weight
    return { ...base, ...Object.fromEntries(risk.map((k) => [k, 1])), ...p.weights };
  }
  readonly weights = $derived.by(() => {
    const w = app.preset ? this.presetWeights(app.preset) : { ...this.presetWeights('balanced'), ...app.weights };
    return this.keys.map((k) => w[k] ?? 1);
  });
  setWeight(key: string, v: number) {
    const cur = Object.fromEntries(this.keys.map((k, i) => [k, this.weights[i]]));
    app.weights = { ...cur, [key]: v };
    app.preset = '';
  }

  readonly result = $derived.by(() => score(this.criteria, this.weights));
  /** rank stability under ±50% changes of every weight (computed when the panel shows it) */
  readonly sens = $derived.by(() => sensitivity(this.result.parts, this.weights));

  // ------------------------------------------------------------ ThemeView
  readonly periodLabel = $derived.by(() => (this.L === 'ja' ? '各指標の最新値' : 'latest figure of each criterion'));
  readonly value = (code: number) => (code > 0 ? this.result.total[code - 1] : NaN);
  readonly values = $derived.by(() => new Map(Array.from({ length: 47 }, (_, i) => [pad2(i + 1), this.result.total[i]])));
  readonly classes = $derived.by(() => makeClasses([...this.values.values()], false, this.ctx.dark));
  readonly ranks = $derived.by(() => rankMap(this.values));
  readonly fmt = (v: number) => (isFinite(v) ? fmtNum(this.L, v, 0) : '–');
  readonly legend = $derived.by(() => ({
    title: this.L === 'ja' ? '立地スコア（0〜100）' : 'Site score (0–100)',
    fmt: (v: number) => fmtNum(this.L, v, 0),
    hint: this.ctx.tt('scoreHint'),
    flows: null,
  }));
  readonly source = $derived.by(() => ({ text: this.ctx.tt('scoreSource'), url: '#sources' }));

  /** criteria sorted by this prefecture's percentile (weighted ones only) */
  strengths(code: number) {
    return this.criteria.map((c, k) => ({ c, k, p: this.result.parts[k][code - 1], w: this.weights[k] }))
      .filter((x) => x.w > 0 && isFinite(x.p)).sort((a, b) => b.p - a.p);
  }

  readonly prefTip = (code: string): Tip => {
    const c = Number(code), tt = this.ctx.tt, L = this.L;
    const s = this.strengths(c);
    const r = this.ranks.get(code);
    const rows: [string, string][] = [];
    if (r) rows.push([tt('rank'), L === 'ja' ? `${r}${tt('rankOf')}` : `${r} ${tt('rankOf')}`]);
    for (const x of s.slice(0, 2)) rows.push([`＋ ${x.c[L]}`, `${fmtNum(L, x.p, 0)}`]);
    for (const x of s.slice(-2).reverse()) rows.push([`− ${x.c[L]}`, `${fmtNum(L, x.p, 0)}`]);
    return {
      title: this.ctx.pname(c),
      badge: app.compare ? (c === app.a ? 'a' : c === app.b ? 'b' : undefined) : undefined,
      sub: this.legend.title,
      big: this.fmt(this.value(c)),
      rows,
      note: tt('scorePctNote'),
      action: !app.compare && app.pref !== c ? { label: tt('details'), run: () => app.pick(c) } : undefined,
    };
  };

  readonly table = $derived.by(() => ({
    primary: 'score',
    columns: [
      { key: 'score', label: this.legend.title, get: (c: number) => this.value(c), fmt: this.fmt },
      ...this.criteria.map((cr, k) => ({
        key: cr.key, label: `${cr[this.L]}${this.weights[k] ? '' : this.L === 'ja' ? '（重み0）' : ' (weight 0)'}`,
        get: (c: number) => cr.raw[c - 1], fmt: cr.fmt,
      })),
    ],
  }));

  readonly compareRows = $derived.by((): CompareRow[] => {
    if (!app.a || !app.b) return [];
    const a = app.a, b = app.b, L = this.L;
    const pts = (v: number) => (isFinite(v) ? `${fmtNum(L, v, 0)}${L === 'ja' ? '点' : ' pts'}` : '–');
    const sgn = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmtNum(L, Math.abs(d), 0)}`;
    return [
      { label: this.legend.title, av: this.value(a), bv: this.value(b), fa: this.fmt(this.value(a)), fb: this.fmt(this.value(b)),
        diff: sgn(this.value(b) - this.value(a)) },
      ...this.criteria.map((cr, k) => {
        const pa = this.result.parts[k][a - 1], pb = this.result.parts[k][b - 1];
        return { label: `${cr[L]}${this.weights[k] ? ` ×${this.weights[k]}` : ` ×0`}`, av: pa, bv: pb,
                 fa: cr.fmt(cr.raw[a - 1]), fb: cr.fmt(cr.raw[b - 1]), sa: pts(pa), sb: pts(pb),
                 diff: isFinite(pa) && isFinite(pb) ? sgn(pb - pa) : '–' };
      }),
    ];
  });
}
