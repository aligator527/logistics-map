// Theme: municipal site score (1,898 municipalities / wards). Same method as the prefecture score
// (src/lib/score.ts); criteria measured at each municipality's population-weighted centre
// (scripts/etl-muni.mjs). Some criteria only exist per prefecture and are repeated for its
// municipalities ("inherited"), so they rank whole prefectures, not places.

import { app } from '../lib/state.svelte';
import type { Jobs, Label } from '../lib/data';
import { fmtCompact, fmtMinutes, fmtNum, makeClasses } from '../lib/scale';
import { score, type Criterion, type Preset } from '../lib/score';
import type { Tip } from '../components/Tooltip.svelte';
import type { ExtraCriteria } from './score.svelte';
import type { Ctx, ThemeView } from './types';

export interface MuniData {
  codes: string[];
  m: Record<string, (number | null)[]> & { icName: string[]; landEst: number[] };
  prefLand: (number | null)[];
  sources: Record<string, Label & { url: string }>;
}

export const MUNI_PRESETS: Preset[] = [
  { key: 'balanced', ja: 'バランス', en: 'Balanced', weights: {} },
  { key: 'consumer', ja: '大消費地に近い', en: 'Near consumers', weights: { pop30: 4, pop60: 3, ic: 2, land: 1, zone: 1, cluster: 1, pool: 1, drivers: 0, handlers: 0 } },
  { key: 'hub', ja: '広域配送ハブ', en: 'Wide-area hub', weights: { ic: 4, pop60: 3, cluster: 2, zone: 2, land: 2, port: 2, pop30: 1, pool: 1 } },
  { key: 'cost', ja: 'コスト重視', en: 'Low cost', weights: { land: 5, zone: 3, ic: 2, pop30: 1, pop60: 1, cluster: 0, pool: 1 } },
  { key: 'labour', ja: '人手を確保しやすい', en: 'Easier hiring', weights: { pool: 5, drivers: 2, handlers: 2, pop30: 1, ic: 1, land: 1, zone: 1, cluster: 0 } },
  { key: 'safe', ja: '災害リスクを避ける', en: 'Low hazard', weights: {} },
];

export class MuniScoreTheme implements ThemeView {
  // assigned in the constructor; declared first so the lazy $derived fields below can use them
  private d: MuniData;
  private jobs: Jobs;
  private risk: ExtraCriteria[];
  private ctx: Ctx;
  constructor(d: MuniData, jobs: Jobs, risk: ExtraCriteria[], ctx: Ctx) { this.d = d; this.jobs = jobs; this.risk = risk; this.ctx = ctx; }

  readonly flows = [];
  readonly trend = null;
  /** minutes to the nearest main container port (from the road network, once loaded) */
  portTimes = $state.raw<Float32Array | null>(null);
  private get L() { return this.ctx.L; }
  readonly codes = $derived.by(() => this.d.codes);
  readonly prefIdx = $derived.by(() => this.d.codes.map((c) => Number(c.slice(0, 2)) - 1));

  /** municipality display name: 「川口市（埼玉県）」 / "Kawaguchi City, Saitama" */
  muniName: (code: string) => string = () => '';
  setNamer(f: (code: string) => string) { this.muniName = f; }

  readonly criteria = $derived.by((): Criterion[] => {
    const L = this.L, m = this.d.m, S = this.d.sources;
    const num = (a: (number | null)[]) => a.map((v) => (v === null ? NaN : v));
    const people = (v: number) => `${fmtCompact(L, v)}${L === 'ja' ? '人' : ''}`;
    const src = (k: string) => ({ ja: S[k].ja, en: S[k].en });
    const jp = this.jobs.periods.length - 1, jy = this.jobs.periods[jp];
    const inherit = (perPref: number[]) => this.prefIdx.map((i) => perPref[i] ?? NaN);
    const jbSrc = { ja: `職業安定業務統計（${jy.ja}、都道府県の値）`, en: `MHLW employment statistics (${jy.en}, prefecture value)` };
    const list: Criterion[] = [
      { key: 'pop30', ja: '30km圏人口', en: 'Population within 30 km', group: 'market', dir: 1, raw: num(m.pop30), fmt: people,
        hint: { ja: '配送圏の需要（2020年国勢調査、1kmメッシュ）', en: 'Delivery-area demand (2020 census, 1 km grid)' }, source: src('mesh') },
      { key: 'pop60', ja: '60km圏人口', en: 'Population within 60 km', group: 'market', dir: 1, raw: num(m.pop60), fmt: people,
        hint: { ja: '広域配送の需要', en: 'Demand for wide-area delivery' }, source: src('mesh') },
      { key: 'cluster', ja: '物流業の集積', en: 'Logistics cluster', group: 'market', dir: 1, raw: num(m.cluster20), fmt: people,
        hint: { ja: '20km圏の道路貨物運送業・倉庫業の従業者', en: 'Road-freight and warehousing employees within 20 km' }, source: src('logi') },
      { key: 'ic', ja: '最寄りICまでの距離', en: 'Distance to an interchange', group: 'access', dir: -1, raw: num(m.ic),
        fmt: (v) => `${fmtNum(L, v, 1)} km`, hint: { ja: '人口重心から最寄りのIC・スマートICまで（直線）', en: 'From the population centre to the nearest IC (straight line)' }, source: src('ic') },
      { key: 'land', ja: '工業地の地価', en: 'Industrial land price', group: 'cost', dir: -1, raw: num(m.land),
        fmt: (v) => `${fmtCompact(L, v)}${L === 'ja' ? '円/㎡' : ' ¥/m²'}`,
        hint: { ja: '低いほど有利。地点がない市町村は15km圏または都道府県の中央値', en: 'Lower is better; municipalities without points use the 15 km or prefecture median' }, source: src('land') },
      { key: 'zone', ja: '工業系用途地域', en: 'Industrial zoning', group: 'cost', dir: 1, raw: num(m.zone),
        fmt: (v) => `${fmtCompact(L, v)} ha`, hint: { ja: '準工業・工業・工業専用地域の面積', en: 'Area zoned light-industrial, industrial or exclusively industrial' }, source: src('zone') },
      { key: 'pool', ja: '輸送・運搬の労働力', en: 'Transport & handling workforce', group: 'labour', dir: 1, raw: num(m.pool30), fmt: people,
        hint: { ja: '30km圏に住む輸送・機械運転、運搬・清掃・包装等の就業者', en: 'Transport/machine operators and carrying/packaging workers living within 30 km' }, source: src('workers') },
      { key: 'drivers', ja: 'ドライバーの採用しやすさ', en: 'Driver hiring', group: 'labour', dir: -1, inherited: true,
        raw: inherit(this.jobs.ratio.driver[jp]), fmt: (v) => `${fmtNum(L, v, 2)}${L === 'ja' ? '倍' : '×'}`,
        hint: { ja: '自動車運転の有効求人倍率（都道府県の値）', en: 'Driver job openings ratio (prefecture value)' }, source: jbSrc },
      { key: 'handlers', ja: '倉庫作業員の採用しやすさ', en: 'Warehouse-staff hiring', group: 'labour', dir: -1, inherited: true,
        raw: inherit(this.jobs.ratio.handling[jp]), fmt: (v) => `${fmtNum(L, v, 2)}${L === 'ja' ? '倍' : '×'}`,
        hint: { ja: '運搬の職業の有効求人倍率（都道府県の値）', en: 'Cargo-handling job openings ratio (prefecture value)' }, source: jbSrc },
      { key: 'quake', ja: '地震リスク', en: 'Earthquake risk', group: 'risk', dir: -1, raw: num(m.quake), fmt: (v) => `${fmtNum(L, v, 0)}%`,
        hint: { ja: '人口重心で今後30年に震度6弱以上の確率', en: 'Chance of intensity 6-lower+ within 30 years at the population centre' }, source: src('jshis') },
      ...(this.portTimes ? [{ key: 'port', ja: '主要コンテナ港までの時間', en: 'Time to a container port', group: 'access' as const, dir: -1 as const,
        raw: Array.from(this.portTimes, (v) => (isFinite(v) ? v : NaN)), fmt: (v: number) => fmtMinutes(L, v),
        hint: { ja: '年10万TEU以上の港までのトラック推計時間', en: 'Truck-time estimate to a port handling ≥ 100k TEU a year' },
        source: { ja: '国土数値情報 N06・港湾統計から推計', en: 'Estimated from MLIT N06 and port statistics' } }] : []),
      ...('hz_flood' in m ? [
        { key: 'mflood', ja: '洪水浸水想定区域', en: 'Flood zones', group: 'risk', dir: -1 as const, raw: num(m.hz_flood), fmt: (v: number) => `${fmtNum(L, v, 0)}%`,
          hint: { ja: '0.5m以上の浸水想定区域に住む人の割合（想定最大規模）', en: 'Residents where the maximum-scenario flood reaches 0.5 m+' }, source: src('hazard') },
        { key: 'mcoast', ja: '高潮・津波浸水想定区域', en: 'Storm-surge & tsunami zones', group: 'risk', dir: -1 as const,
          raw: m.hz_surge.map((v, i) => Math.max(v ?? NaN, m.hz_tsunami[i] ?? NaN)), fmt: (v: number) => `${fmtNum(L, v, 0)}%`,
          hint: { ja: '高潮・津波の浸水想定区域に住む人の割合（大きい方）', en: 'Residents in storm-surge or tsunami zones (the larger share)' }, source: src('hazard') },
        { key: 'msabo', ja: '土砂災害警戒区域', en: 'Landslide-warning zones', group: 'risk', dir: -1 as const, raw: num(m.hz_sabo), fmt: (v: number) => `${fmtNum(L, v, 1)}%`,
          hint: { ja: '土砂災害警戒区域に住む人の割合', en: 'Residents in landslide-warning zones' }, source: src('hazard') },
      ] as Criterion[] : []),
      // prefecture-level hazards only where no municipal figure replaces them
      ...this.risk.filter((r) => r.key !== 'quake' && !('hz_flood' in m && (r.key === 'flood' || r.key === 'sediment'))).map((r) => ({
        ...r, inherited: true, raw: inherit(r.raw),
        hint: { ja: `${r.hint.ja}（都道府県の値）`, en: `${r.hint.en} (prefecture value)` },
        fmt: (v: number) => `${fmtNum(L, v, r.digits)}${r.unit[L]}`,
      })),
    ];
    return list;
  });
  readonly keys = $derived.by(() => this.criteria.map((c) => c.key));

  presetWeights(key: string): Record<string, number> {
    const p = MUNI_PRESETS.find((x) => x.key === key) ?? MUNI_PRESETS[0];
    const risk = this.criteria.filter((c) => c.group === 'risk').map((c) => c.key);
    const base: Record<string, number> = Object.fromEntries(this.keys.map((k) => [k, 1]));
    if (p.key === 'safe') return { ...base, ...Object.fromEntries(risk.map((k) => [k, 4])) };
    return { ...base, ...p.weights };
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
  indexOf = (code: string) => this.d.codes.indexOf(code);

  // ------------------------------------------------------------ ThemeView
  readonly periodLabel = $derived.by(() => (this.L === 'ja' ? '市区町村・各指標の最新値' : 'municipalities, latest figures'));
  /** prefecture (1..47): median score of its municipalities — 0: all of Japan */
  readonly value = (code: number) => {
    const s = this.result.total.filter((v, i) => isFinite(v) && (code === 0 || this.prefIdx[i] === code - 1)).sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : NaN;
  };
  readonly muniValue = (code: string) => { const i = this.indexOf(code); return i >= 0 ? this.result.total[i] : NaN; };
  readonly values = $derived.by(() => new Map(this.d.codes.map((c, i) => [c, this.result.total[i]])));
  readonly classes = $derived.by(() => makeClasses([...this.values.values()], false, this.ctx.dark));
  readonly ranks = $derived.by(() => {
    const arr = [...this.values.entries()].filter(([, v]) => isFinite(v)).sort((a, b) => b[1] - a[1]);
    return new Map(arr.map(([c], i) => [c, i + 1]));
  });
  readonly fmt = (v: number) => (isFinite(v) ? fmtNum(this.L, v, 0) : '–');
  readonly legend = $derived.by(() => ({
    title: this.L === 'ja' ? '立地スコア・市区町村（0〜100）' : 'Site score by municipality (0–100)',
    fmt: (v: number) => fmtNum(this.L, v, 0),
    hint: this.ctx.tt('muniScoreHint'),
    flows: null,
  }));
  readonly source = $derived.by(() => ({ text: this.ctx.tt('scoreSource'), url: '#sources' }));

  strengths(i: number) {
    return this.criteria.map((c, k) => ({ c, k, p: this.result.parts[k][i], w: this.weights[k] }))
      .filter((x) => x.w > 0 && isFinite(x.p) && !x.c.inherited).sort((a, b) => b.p - a.p);
  }

  readonly prefTip = (code: string): Tip => {
    const tt = this.ctx.tt, L = this.L;
    const i = this.indexOf(code);
    if (i < 0) return { title: code };
    const s = this.strengths(i);
    const r = this.ranks.get(code);
    const rows: [string, string][] = [];
    if (r) rows.push([tt('rank'), `${r} / ${this.ranks.size}`]);
    for (const x of s.slice(0, 2)) rows.push([`＋ ${x.c[L]}`, x.c.fmt(x.c.raw[i])]);
    for (const x of s.slice(-2).reverse()) rows.push([`− ${x.c[L]}`, x.c.fmt(x.c.raw[i])]);
    return {
      title: this.muniName(code),
      sub: this.legend.title,
      big: this.fmt(this.result.total[i]),
      rows,
      note: this.d.m.landEst[i] ? tt(this.d.m.landEst[i] === 1 ? 'landEst15' : 'landEstPref') : undefined,
      action: app.muni !== code ? { label: tt('details'), run: () => { app.muni = code; app.pref = Number(code.slice(0, 2)); } } : undefined,
    };
  };

  /** the table lists municipalities of the focused prefecture (all 1,898 otherwise) */
  readonly table = $derived.by(() => ({
    primary: 'score',
    columns: [
      { key: 'score', label: this.legend.title, get: (i: number) => this.result.total[i], fmt: this.fmt },
      ...this.criteria.filter((c) => !c.inherited).map((c) => ({
        key: c.key, label: c[this.L], get: (i: number) => c.raw[i], fmt: c.fmt,
      })),
    ],
  }));
  readonly compareRows = [];
}
