// Theme: municipal data explorer — any municipal indicator of public/data/muni.json on the map
// (1,898 municipalities / wards), with ranks, a comparison of two municipalities and the table.

import { app } from '../lib/state.svelte';
import type { Label } from '../lib/data';
import { fmtCompact, fmtNum, makeClasses } from '../lib/scale';
import type { Tip } from '../components/Tooltip.svelte';
import type { CompareRow } from '../components/ComparePanel.svelte';
import type { MuniData } from './muniscore.svelte';
import type { Ctx, ThemeView } from './types';

export interface LocalMetric extends Label {
  key: string;
  group: 'people' | 'access' | 'land' | 'industry' | 'labour' | 'risk';
  /** value for municipality index i */
  get: (i: number) => number;
  fmt: (v: number) => string;
  /** change metrics use the diverging scale */
  diverging?: boolean;
  /** −1: lower is better for logistics (only used to word the rank) */
  better?: 1 | -1;
  hint: Label;
  source: string;
}

export class LocalTheme implements ThemeView {
  // assigned in the constructor; declared first so the lazy $derived fields below can use them
  private d: MuniData & { m: Record<string, (number | null)[]> };
  private ctx: Ctx;
  constructor(d: MuniData, ctx: Ctx) { this.d = d as never; this.ctx = ctx; }

  readonly flows = [];
  readonly trend = null;
  private get L() { return this.ctx.L; }
  muniName: (code: string) => string = (c) => c;
  setNamer(f: (code: string) => string) { this.muniName = f; }
  readonly codes = $derived.by(() => this.d.codes);
  indexOf = (code: string) => this.d.codes.indexOf(code);

  readonly metrics = $derived.by((): LocalMetric[] => {
    const L = this.L, m = this.d.m, S = this.d.sources;
    const v = (k: string) => (i: number) => { const x = m[k]?.[i]; return x === null || x === undefined ? NaN : x; };
    const pct = (d = 1) => (x: number) => `${fmtNum(L, x, d)}%`;
    const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${fmtNum(L, Math.abs(x), 1)}%`;
    const people = (x: number) => `${fmtCompact(L, x)}${L === 'ja' ? '人' : ''}`;
    const ha = (x: number) => `${fmtCompact(L, x)} ha`;
    const src = (k: string) => S[k]?.[L] ?? '';
    const share = (k: string) => (i: number) => { const a = m.area?.[i], x = m[k]?.[i]; return a && x !== null && x !== undefined ? (x / (a * 100)) * 100 : NaN; };
    return [
      { key: 'pop2050', ja: '人口の増減（2020→2050）', en: 'Population change 2020→2050', group: 'people', get: v('pop2050'), fmt: signed, diverging: true, better: 1,
        hint: { ja: '将来の消費需要の変化', en: 'Future demand trend' }, source: src('proj') },
      { key: 'pop2035', ja: '人口の増減（2020→2035）', en: 'Population change 2020→2035', group: 'people', get: v('pop2035'), fmt: signed, diverging: true, better: 1,
        hint: { ja: '中期の需要の変化', en: 'Medium-term demand trend' }, source: src('proj') },
      { key: 'pop30', ja: '30km圏人口', en: 'Population within 30 km', group: 'people', get: v('pop30'), fmt: people, better: 1,
        hint: { ja: '配送圏の需要（2020年）', en: 'Delivery-area demand (2020)' }, source: src('mesh') },
      { key: 'pop', ja: '人口（2020年）', en: 'Population (2020)', group: 'people', get: v('pop'), fmt: people, better: 1,
        hint: { ja: '市区町村の人口', en: 'Residents of the municipality' }, source: src('mesh') },
      { key: 'ic', ja: '最寄りICまでの距離', en: 'Distance to an interchange', group: 'access', get: v('ic'), fmt: (x) => `${fmtNum(L, x, 1)} km`, better: -1,
        hint: { ja: '人口重心から最寄りのIC・スマートICまで', en: 'From the population centre to the nearest IC' }, source: src('ic') },
      { key: 'land', ja: '工業地の地価', en: 'Industrial land price', group: 'land', get: v('land'), fmt: (x) => `${fmtCompact(L, x)}${L === 'ja' ? '円/㎡' : ' ¥/m²'}`, better: -1,
        hint: { ja: '地価公示・地価調査2026（地点がない市町村は周辺・県の中央値）', en: 'Official land prices 2026 (nearby / prefecture median where no point)' }, source: src('land') },
      { key: 'landChg', ja: '工業地地価の変動率', en: 'Industrial land price change', group: 'land', get: v('landChg'), fmt: signed, diverging: true, better: -1,
        hint: { ja: '前年比。上昇が続く地域は需要が強い一方、取得コストも上がる', en: 'Year on year: strong demand, but rising cost' }, source: src('land') },
      { key: 'zone', ja: '工業系用途地域', en: 'Industrial zoning', group: 'land', get: v('zone'), fmt: ha, better: 1,
        hint: { ja: '準工業・工業・工業専用地域の面積', en: 'Light-industrial, industrial and exclusively industrial zones' }, source: src('zone') },
      { key: 'urban', ja: '市街化区域の割合', en: 'Urbanisation area share', group: 'land', get: share('urban'), fmt: pct(0), better: 1,
        hint: { ja: '市区町村面積に占める市街化区域。市街化調整区域では倉庫の新設が原則難しい。空欄＝区域区分なし（非線引き）', en: 'Share of the area where building is promoted; warehouses are hard to build in 市街化調整区域. Blank = no split (非線引き)' }, source: src('zone') },
      { key: 'control', ja: '市街化調整区域の割合', en: 'Urbanisation control area share', group: 'land', get: share('control'), fmt: pct(0), better: -1,
        hint: { ja: '開発が抑制される区域の割合', en: 'Share where development is restrained' }, source: src('zone') },
      { key: 'truck', ja: '道路貨物運送業の従業者', en: 'Road-freight employees', group: 'industry', get: v('truck'), fmt: people, better: 1,
        hint: { ja: '市区町村内（2021年）', en: 'In the municipality (2021)' }, source: src('logi') },
      { key: 'wh', ja: '倉庫業の従業者', en: 'Warehousing employees', group: 'industry', get: v('wh'), fmt: people, better: 1,
        hint: { ja: '市区町村内（2021年）', en: 'In the municipality (2021)' }, source: src('logi') },
      { key: 'cold', ja: '冷蔵倉庫業の従業者', en: 'Cold-storage employees', group: 'industry', get: v('cold'), fmt: people, better: 1,
        hint: { ja: '低温物流の集積', en: 'Cold-chain cluster' }, source: src('logi') },
      { key: 'commute', ja: '就業者の流入比', en: 'Worker inflow ratio', group: 'labour', get: v('commute'), fmt: pct(0),
        hint: { ja: '従業地の就業者 ÷ 常住地の就業者。100%超は働きに来る人が多い地域', en: 'Workers employed here ÷ workers living here; above 100% = net inflow' }, source: src('workers') },
      { key: 'pool30', ja: '30km圏の輸送・運搬の就業者', en: 'Transport & handling workers within 30 km', group: 'labour', get: v('pool30'), fmt: people, better: 1,
        hint: { ja: '2020年国勢調査（常住地）', en: '2020 census, by residence' }, source: src('workers') },
      { key: 'work2050', ja: '生産年齢人口の増減（2025→2050）', en: 'Working-age change 2025→2050', group: 'labour', get: v('work2050'), fmt: signed, diverging: true, better: 1,
        hint: { ja: '15〜64歳。将来の人手の確保しやすさ', en: 'Ages 15–64: future labour supply' }, source: src('proj') },
      { key: 'old2025', ja: '高齢化率（2025年）', en: 'Share aged 65+ (2025)', group: 'labour', get: v('old2025'), fmt: pct(1), better: -1,
        hint: { ja: '65歳以上の割合', en: 'Share of residents aged 65+' }, source: src('proj') },
      { key: 'quake', ja: '地震リスク', en: 'Earthquake risk', group: 'risk', get: v('quake'), fmt: pct(0), better: -1,
        hint: { ja: '人口重心で今後30年に震度6弱以上の確率', en: 'Chance of intensity 6-lower+ within 30 years' }, source: src('jshis') },
    ];
  });
  readonly metric = $derived.by(() => this.metrics.find((x) => x.key === app.lmet) ?? this.metrics[0]);
  readonly raw = $derived.by(() => this.d.codes.map((_, i) => this.metric.get(i)));

  // ------------------------------------------------------------ ThemeView
  readonly periodLabel = $derived.by(() => this.metric[this.L]);
  /** prefecture (1..47): median over its municipalities; 0: all of Japan */
  readonly value = (code: number) => {
    const s = this.raw.filter((v, i) => isFinite(v) && (code === 0 || Number(this.d.codes[i].slice(0, 2)) === code)).sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : NaN;
  };
  readonly muniValue = (code: string) => this.raw[this.indexOf(code)] ?? NaN;
  readonly values = $derived.by(() => new Map(this.d.codes.map((c, i) => [c, this.raw[i]])));
  readonly classes = $derived.by(() => makeClasses(this.raw, !!this.metric.diverging, this.ctx.dark));
  readonly ranks = $derived.by(() => {
    const arr = this.raw.map((v, i) => ({ v, c: this.d.codes[i] })).filter((x) => isFinite(x.v)).sort((a, b) => b.v - a.v);
    return new Map(arr.map((x, i) => [x.c, i + 1]));
  });
  readonly fmt = (v: number) => (isFinite(v) ? this.metric.fmt(v) : '–');
  readonly legend = $derived.by(() => ({
    title: this.metric[this.L],
    fmt: (v: number) => {
      const m = this.metric;
      if (m.diverging) return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(this.L, Math.abs(v), 0)}%`;
      return /%$/.test(m.fmt(1)) ? `${fmtNum(this.L, v, 0)}%` : fmtCompact(this.L, v);
    },
    hint: this.metric.hint[this.L],
    flows: null,
  }));
  readonly source = $derived.by(() => ({ text: this.metric.source, url: '#sources' }));

  readonly prefTip = (code: string): Tip => {
    const i = this.indexOf(code);
    if (i < 0) return { title: code };
    const tt = this.ctx.tt, L = this.L;
    const r = this.ranks.get(code);
    const rows: [string, string][] = [];
    if (r) rows.push([tt('rank'), `${r} / ${this.ranks.size}`]);
    for (const k of ['pop', 'pop30', 'ic'].filter((k) => k !== this.metric.key)) {
      const mm = this.metrics.find((x) => x.key === k)!;
      rows.push([mm[L], mm.fmt(mm.get(i))]);
    }
    return {
      title: this.muniName(code),
      sub: this.metric[L],
      big: this.fmt(this.raw[i]),
      rows,
      action: app.muni !== code ? { label: tt('details'), run: () => { app.muni = code; app.pref = Number(code.slice(0, 2)); } } : undefined,
    };
  };

  readonly table = $derived.by(() => ({
    primary: this.metric.key,
    columns: this.metrics.map((m) => ({ key: m.key, label: m[this.L], get: (i: number) => m.get(i), fmt: (v: number) => (isFinite(v) ? m.fmt(v) : '–') })),
  }));

  /** compare two municipalities (app.ma / app.mb) */
  readonly compareRows = $derived.by((): CompareRow[] => {
    const a = this.indexOf(app.ma), b = this.indexOf(app.mb);
    if (a < 0 || b < 0) return [];
    return this.metrics.map((m) => {
      const av = m.get(a), bv = m.get(b);
      const d = bv - av;
      const diff = !isFinite(d) ? '–' : m.diverging || /%$/.test(m.fmt(1))
        ? `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmtNum(this.L, Math.abs(d), 1)}${m.diverging || /%$/.test(m.fmt(1)) ? (this.L === 'ja' ? 'pt' : ' pts') : ''}`
        : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${m.fmt(Math.abs(d))}`;
      return { label: m[this.L], av, bv, fa: isFinite(av) ? m.fmt(av) : '–', fb: isFinite(bv) ? m.fmt(bv) : '–', diff: m.diverging ? diff : diff };
    });
  });

  /** all metrics of one municipality with its rank (for the side panel) */
  profile(code: string) {
    const i = this.indexOf(code);
    return this.metrics.map((m) => {
      const v = m.get(i);
      const all = this.d.codes.map((_, j) => m.get(j)).filter(isFinite);
      const better = all.filter((x) => (m.better === -1 ? x < v : x > v)).length;
      return { m, v, rank: isFinite(v) ? better + 1 : 0, n: all.length };
    });
  }
}
