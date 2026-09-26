// Theme: municipal data explorer — any municipal indicator of public/data/muni.json on the map
// (1,898 municipalities / wards), with ranks, a comparison of two municipalities and the table.

import { app } from '../lib/state.svelte';
import type { Label } from '../lib/data';
import { SEQ, fmtCompact, fmtMinutes, fmtNum, makeClasses, type Classes } from '../lib/scale';
import { hubGroups, Reach, type Grid, type HubItem, type Place, type Router } from '../lib/travel';
import { store } from '../lib/store.svelte';
import { shortlist } from '../lib/shortlist.svelte';
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
  /** travel time in minutes: fixed classes (30 min steps) */
  time?: boolean;
  /** categories 1..3 (trip type) */
  category?: boolean;
  hint: Label;
  source: string;
}

export class LocalTheme implements ThemeView {
  // assigned in the constructor; declared first so the lazy $derived fields below can use them
  private d: MuniData & { m: Record<string, (number | null)[]> };
  private ctx: Ctx;
  constructor(d: MuniData, ctx: Ctx) { this.d = d as never; this.ctx = ctx; }

  // ------------------------------------------------------------ travel times (road network loads lazily)
  router = $state.raw<Router | null>(null);
  reach = $state.raw<Reach | null>(null);
  private groups = $state.raw<ReturnType<typeof hubGroups> | null>(null);
  setTravel(r: Router, hubs: HubItem[]) { this.groups = hubGroups(hubs); this.router = r; this.reach = new Reach(r); }
  /** the 1 km grid, once loaded and prepared (App loads it when the grid view is asked for) */
  grid = $state.raw<Grid | null>(null);
  private places = (keys: string[]) => keys.map((k) => this.router!.poi(k)).filter((p): p is Place => !!p);
  /** minutes from every municipality to the nearest hub of each group */
  readonly hubTimes = $derived.by(() => {
    const r = this.router, g = this.groups;
    if (!r || !g) return null;
    return { port: r.toMunis(this.places(g.port)), air: r.toMunis(this.places(g.air)), rail: r.toMunis(this.places(g.rail)) };
  });
  /** origin of the reach map: app.iso, else the selected municipality */
  readonly originKey = $derived.by(() => app.iso || (app.muni ? `muni:${app.muni}` : ''));
  /** one place, or several for a network origin (every DPL site / the shortlist) */
  originPlaces(key: string): Place[] {
    const r = this.router;
    if (!r || !key) return [];
    const one = (k: string): Place | null => {
      if (k.startsWith('muni:')) { const i = this.indexOf(k.slice(5)); return i >= 0 ? r.muni(i) : null; }
      if (k.startsWith('pt:') && this.reach) { const [lon, lat, comp] = k.slice(3).split(',').map(Number); return this.reach.place(lon, lat, comp); }
      return r.poi(k);
    };
    if (key === 'net:dpl') return store.sites.map((s) => r.poi(`site:${s.name}`)).filter((p): p is Place => !!p);
    if (key === 'net:short') {
      return shortlist.items.map((it) => (it.kind === 'muni' ? one(`muni:${it.code}`) : it.kind === 'site' ? one(`site:${store.sites[Number(it.code)]?.name}`) : null))
        .filter((p): p is Place => !!p);
    }
    const p = one(key);
    return p ? [p] : [];
  }
  originPlace(key: string): Place | null { return this.originPlaces(key)[0] ?? null; }
  readonly isNetwork = $derived.by(() => this.originKey.startsWith('net:'));
  readonly isoTimes = $derived.by(() => {
    const o = this.originPlaces(this.originKey);
    return o.length ? this.router!.toMunis(o) : null;
  });
  /** minutes per 1 km cell (grid view) */
  readonly gridTimes = $derived.by(() => {
    if (!app.igrid || !this.grid || !this.reach?.ready) return null;
    const o = this.originPlaces(this.originKey);
    return o.length ? this.reach.toGrid(o, this.grid) : null;
  });
  /** hubs (ports / airports / rail stations) nearest the origin by time */
  hubsFrom(key: string, group: 'port' | 'air' | 'rail', n = 2) {
    const o = this.originPlace(key), g = this.groups;
    if (!o || !g) return [];
    const keys = g[group].filter((k) => this.router!.poi(k));
    const times = this.router!.toPlaces([o], this.places(keys));
    return keys.map((k, j) => ({ name: k.slice(k.indexOf(':') + 1), t: times[j] })).filter((x) => isFinite(x.t)).sort((a, b) => a.t - b.t).slice(0, n);
  }
  /** people within 30 / 60 / 90 / 120 / 180 min of the origin (1 km grid when loaded, else by
   *  municipality population centre) */
  readonly isoPop = $derived.by(() => {
    const lims = [30, 60, 90, 120, 180];
    const g = this.gridTimes, grid = this.grid;
    if (g && grid) return lims.map((lim) => { let s = 0; for (let i = 0; i < grid.n; i++) if (g[i] <= lim) s += grid.pop[i]; return { lim, pop: s }; });
    const t = this.isoTimes, pop = this.d.m.pop;
    if (!t) return null;
    return lims.map((lim) => ({ lim, pop: t.reduce((s, x, i) => s + (x <= lim ? pop[i] ?? 0 : 0), 0) }));
  });
  /** 2024 driving-time rules (改善基準告示, from April 2024): a day is at most 13 h on duty and
   *  9 h at the wheel, with 30 min rest per 4 h of driving. Loading and unloading ≈ 1 h each end.
   *  1 = there and back in one shift (日帰り往復), 2 = one way in a shift, 3 = two days or a relay. */
  static tripClass(min: number) {
    if (!isFinite(min)) return NaN;
    const rest = (drive: number) => Math.floor(drive / 240) * 30;
    const round = 2 * min;
    if (round <= 540 && round + rest(round) + 120 <= 780) return 1;
    if (min <= 540 && min + rest(min) + 60 <= 780) return 2;
    return 3;
  }
  readonly tripPop = $derived.by(() => {
    const out = [0, 0, 0];
    const g = this.gridTimes, grid = this.grid;
    if (g && grid) { for (let i = 0; i < grid.n; i++) { const c = LocalTheme.tripClass(g[i]); if (c) out[c - 1] += grid.pop[i]; } return out; }
    const t = this.isoTimes;
    if (!t) return null;
    t.forEach((x, i) => { const c = LocalTheme.tripClass(x); if (c) out[c - 1] += this.d.m.pop[i] ?? 0; });
    return out;
  });
  /** network origin: the most populous municipalities left beyond 2 hours */
  readonly gaps = $derived.by(() => {
    const t = this.isoTimes;
    if (!t || !this.isNetwork) return [];
    return this.d.codes.map((c, i) => ({ c, t: t[i], pop: this.d.m.pop[i] ?? 0 })).filter((x) => x.t > 120)
      .sort((a, b) => b.pop - a.pop).slice(0, 8);
  });

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
    const mins = (x: number) => fmtMinutes(L, x);
    const arr = (a: Float32Array | null | undefined) => (i: number) => { const x = a?.[i]; return x === undefined || !isFinite(x) ? NaN : x; };
    const net = this.router?.net.source[L] ?? '';
    const hz = (k: string, ja: string, en: string, hja: string, hen: string): LocalMetric => ({
      key: `hz_${k}`, ja, en, group: 'risk', get: v(`hz_${k}`), fmt: pct(1), better: -1, hint: { ja: hja, en: hen }, source: src('hazard') });
    const hasHz = 'hz_flood' in m;
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
      { key: 'iso', ja: '到達時間（起点から）', en: 'Travel time from the origin', group: 'access', get: arr(this.isoTimes), fmt: mins, better: -1, time: true,
        hint: { ja: '選んだ市区町村・DPL物件からトラックで何分か（推計）', en: 'Minutes by truck from the chosen municipality or DPL site (estimate)' }, source: net },
      { key: 'shift', ja: '運行区分（2024年ルール）', en: 'Trip type (2024 driving rules)', group: 'access', get: (i: number) => LocalTheme.tripClass(arr(this.isoTimes)(i)),
        fmt: (x: number) => this.ctx.tt(x === 1 ? 'trip1' : x === 2 ? 'trip2' : 'trip3'), better: -1, category: true,
        hint: { ja: '起点から日帰り往復／片道1日／2日以上・中継輸送（拘束13時間・運転9時間・4時間ごとに30分休憩、荷役を含む推計）',
                en: 'From the origin: there and back in a shift / one way per shift / two days or a relay (13 h on duty, 9 h driving, 30 min rest per 4 h, handling included; estimate)' }, source: net },
      { key: 'tPort', ja: '主要コンテナ港までの時間', en: 'Time to a main container port', group: 'access', get: arr(this.hubTimes?.port), fmt: mins, better: -1, time: true,
        hint: { ja: '年10万TEU以上の港まで（推計）', en: 'To a port handling ≥ 100k TEU a year (estimate)' }, source: net },
      { key: 'tAir', ja: '主要貨物空港までの時間', en: 'Time to a main cargo airport', group: 'access', get: arr(this.hubTimes?.air), fmt: mins, better: -1, time: true,
        hint: { ja: '貨物取扱量が年1万トン以上の空港まで（推計）', en: 'To an airport handling ≥ 10,000 t of cargo a year (estimate)' }, source: net },
      { key: 'tRail', ja: '貨物駅までの時間', en: 'Time to a rail freight station', group: 'access', get: arr(this.hubTimes?.rail), fmt: mins, better: -1, time: true,
        hint: { ja: 'JR貨物の駅・オフレールステーションまで（推計）', en: 'To a JR Freight station or off-rail station (estimate)' }, source: net },
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
      ...(hasHz ? [
        hz('flood', '洪水浸水想定区域の人口割合', 'Residents in flood zones', '想定最大規模の降雨で0.5m以上浸水する区域に住む人の割合', 'Share living where the maximum-scenario flood reaches 0.5 m or more'),
        hz('flood3', '深い浸水（3m以上）の人口割合', 'Residents in deep-flood zones (3 m+)', '1階が水没する深さ。倉庫の床・荷物への影響が大きい', 'Deep enough to submerge a ground floor — cargo and floors at risk'),
        hz('surge', '高潮浸水想定区域の人口割合', 'Residents in storm-surge zones', '想定最大規模の高潮で0.5m以上浸水する区域', 'Maximum-scenario storm surge, 0.5 m or more'),
        hz('tsunami', '津波浸水想定区域の人口割合', 'Residents in tsunami zones', '津波浸水想定（都道府県）の区域', 'Prefectural tsunami inundation scenarios'),
        hz('sabo', '土砂災害警戒区域の人口割合', 'Residents in landslide-warning zones', '土石流・急傾斜地の崩壊・地すべりの警戒区域', 'Debris-flow, steep-slope and landslide warning zones'),
      ] : []),
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
  /** trip types: dark = easy (there and back in a shift) */
  readonly tripColors = $derived.by(() => { const r = SEQ[this.ctx.dark ? 'dark' : 'light']; return [r[6], r[3], r[0]]; });
  readonly categories = $derived.by(() => (this.metric.category
    ? [1, 2, 3].map((c) => ({ color: this.tripColors[c - 1], label: this.metric.fmt(c) })) : null));
  readonly classes = $derived.by((): Classes => {
    if (this.metric.category) return { breaks: [2, 3], colors: this.tripColors, diverging: false };
    if (!this.metric.time) return makeClasses(this.raw, !!this.metric.diverging, this.ctx.dark);
    // near = strong: the reachable area stands out
    return { breaks: [30, 60, 90, 120, 180, 240], colors: [...SEQ[this.ctx.dark ? 'dark' : 'light']].reverse(), diverging: false };
  });
  readonly ranks = $derived.by(() => {
    // rank 1 = best for logistics where that is defined (shortest time, cheapest land …), else largest
    const dir = this.metric.better === -1 ? -1 : 1;
    const arr = this.raw.map((v, i) => ({ v, c: this.d.codes[i] })).filter((x) => isFinite(x.v)).sort((a, b) => dir * (b.v - a.v));
    return new Map(arr.map((x, i) => [x.c, i + 1]));
  });
  readonly fmt = (v: number) => (isFinite(v) ? this.metric.fmt(v) : '–');
  readonly legend = $derived.by(() => ({
    title: this.metric[this.L],
    fmt: (v: number) => {
      const m = this.metric;
      if (m.diverging) return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(this.L, Math.abs(v), 0)}%`;
      if (m.time) return fmtMinutes(this.L, v);
      return /%$/.test(m.fmt(1)) ? `${fmtNum(this.L, v, 0)}%` : fmtCompact(this.L, v);
    },
    hint: (this.metric.key === 'iso' || this.metric.key === 'shift') && !this.isoTimes ? this.ctx.tt('isoPick') : this.metric.hint[this.L],
    flows: null,
  }));
  readonly source = $derived.by(() => ({ text: this.metric.source || (this.L === 'ja' ? '読み込み中…' : 'loading…'), url: '#sources' }));

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
