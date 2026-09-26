// Theme: freight flows between prefectures (全国貨物純流動調査 / 物流センサス) — Phase 2.

import { app, type FlowMetric } from '../lib/state.svelte';
import { loadCensusYear, type CensusIndex, type CensusYear } from '../lib/data';
import { fmtCompact, fmtPct, makeClasses } from '../lib/scale';
import type { Tip } from '../components/Tooltip.svelte';
import type { Flow } from '../components/MapView.svelte';
import type { CompareRow } from '../components/ComparePanel.svelte';
import { pad2, rankMap, type Ctx, type ThemeView } from './types';

export const FLOW_METRICS: FlowMetric[] = ['out', 'in', 'net', 'intra'];

export class FlowsTheme implements ThemeView {
  // assigned in the constructor; declared first so the lazy $derived fields below can use them
  readonly index: CensusIndex;
  private ctx: Ctx;
  constructor(index: CensusIndex, ctx: Ctx) { this.index = index; this.ctx = ctx; }

  /** loaded survey rounds */
  data = $state.raw(new Map<number, CensusYear>());
  loading = $state(false);
  async load() {
    if (this.loading || this.data.size === this.index.years.length) return;
    this.loading = true;
    try {
      const all = await Promise.all(this.index.years.map((y) => loadCensusYear(y.year)));
      this.data = new Map(all.map((d) => [d.year, d]));
    } finally {
      this.loading = false;
    }
  }

  readonly years = $derived.by(() => this.index.years.map((y) => y.year));
  isMode = (k: string) => this.index.modes.some((m) => m.key === k);
  /** a mode split exists for the 3-day survey only */
  readonly cut = $derived.by(() => app.basis === 'annual' && this.isMode(app.cut) ? 'all' : app.cut);
  readonly yi = $derived.by(() => Math.max(0, this.years.indexOf(app.flowYear)));

  matrix(year: number): number[][] | null {
    const d = this.data.get(year);
    return d ? d[app.basis][this.cut] ?? null : null;
  }
  readonly M = $derived.by(() => this.matrix(app.flowYear));

  /** per-prefecture totals of a matrix */
  static totals(M: number[][]) {
    const out = Array(47).fill(0), inn = Array(47).fill(0), intra = Array(47).fill(0);
    for (let i = 0; i < 47; i++) for (let j = 0; j < 47; j++) {
      if (i === j) intra[i] = M[i][j];
      else { out[i] += M[i][j]; inn[j] += M[i][j]; }
    }
    return { out, in: inn, intra, net: inn.map((v, i) => v - out[i]) };
  }
  readonly tot = $derived.by(() => this.M ? FlowsTheme.totals(this.M) : null);
  metricOf(m: FlowMetric, code: number, M = this.M): number {
    if (!M) return NaN;
    const t = M === this.M ? this.tot! : FlowsTheme.totals(M);
    return code > 0 ? t[m][code - 1] : m === 'net' ? 0 : t[m].reduce((s, v) => s + v, 0);
  }

  // ------------------------------------------------------------ labels & formats
  private get L() { return this.ctx.L; }
  label = (m: FlowMetric) => this.ctx.tt(`fm_${m}`);
  cutLabel = (k: string) => k === 'all' ? this.ctx.tt('allGoods')
    : ([...this.index.modes, ...this.index.commodities].find((x) => x.key === k)?.[this.L] ?? k);
  readonly unitLabel = $derived.by(() => this.L === 'ja' ? (app.basis === 'annual' ? 'トン/年' : 'トン/3日間') : (app.basis === 'annual' ? 't/year' : 't per 3 days'));
  tons = (v: number) => !isFinite(v) ? '–' : `${fmtCompact(this.L, v)}${this.L === 'ja' ? 'トン' : ' t'}`;
  signedTons = (v: number) => !isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${this.tons(Math.abs(v))}`;
  readonly fmt = (v: number) => (app.fmetric === 'net' ? this.signedTons(v) : this.tons(v));
  readonly periodLabel = $derived.by(() => `${this.L === 'ja' ? `${app.flowYear}年調査` : `${app.flowYear} survey`} · ${
    app.basis === 'annual' ? this.ctx.tt('basisAnnual') : this.ctx.tt('basis3day')}${this.cut !== 'all' ? ` · ${this.cutLabel(this.cut)}` : ''}`);

  // ------------------------------------------------------------ map
  readonly value = (code: number) => this.metricOf(app.fmetric, code);
  readonly values = $derived.by(() => {
    const m = new Map<string, number>();
    for (let c = 1; c <= 47; c++) m.set(pad2(c), this.metricOf(app.fmetric, c));
    return m;
  });
  readonly classes = $derived.by(() => makeClasses([...this.values.values()], app.fmetric === 'net', this.ctx.dark));
  readonly ranks = $derived.by(() => rankMap(this.values));

  readonly legend = $derived.by(() => ({
    title: `${this.label(app.fmetric)}（${this.unitLabel}）`,
    fmt: (v: number) => `${app.fmetric === 'net' && v > 0 ? '+' : v < 0 ? '−' : ''}${fmtCompact(this.L, Math.abs(v))}`,
    hint: app.fmetric === 'net' ? this.ctx.tt('netHint') : this.ctx.tt('legendNote'),
    flows: (app.pref || app.compare ? 'focus' : 'all') as 'focus' | 'all',
  }));

  readonly source = $derived.by(() => {
    const y = this.index.years.find((x) => x.year === app.flowYear)!;
    return { text: `${this.index.source[this.L]} · ${y.survey[this.L]}`, url: this.index.source.url };
  });

  /** largest inter-prefecture flow of the current matrix (arc width reference) */
  readonly maxFlow = $derived.by(() => {
    let mx = 1;
    if (this.M) for (let i = 0; i < 47; i++) for (let j = 0; j < 47; j++) if (i !== j && this.M[i][j] > mx) mx = this.M[i][j];
    return mx;
  });
  width = (v: number) => 0.8 + 7 * Math.sqrt(v / this.maxFlow);

  /** top partners of a prefecture: dir 'out' = destinations, 'in' = origins */
  partners(code: number, dir: 'out' | 'in', n = 10, M = this.M) {
    if (!M) return [];
    const i = code - 1;
    const list = Array.from({ length: 47 }, (_, j) => ({ code: j + 1, v: dir === 'out' ? M[i][j] : M[j][i] }))
      .filter((x) => x.code !== code && x.v > 0).sort((a, b) => b.v - a.v);
    const total = list.reduce((s, x) => s + x.v, 0) || 1;
    return list.slice(0, n).map((x) => ({ ...x, share: (x.v / total) * 100 }));
  }
  /** largest inter-prefecture flows nationally (near = include neighbouring prefectures) */
  topPairs(n = 25, near = app.near) {
    if (!this.M) return [];
    const all: { o: number; d: number; v: number }[] = [];
    for (let i = 0; i < 47; i++) for (let j = 0; j < 47; j++) {
      if (i === j || this.M[i][j] <= 0 || (!near && this.ctx.adjacent(i + 1, j + 1))) continue;
      all.push({ o: i + 1, d: j + 1, v: this.M[i][j] });
    }
    return all.sort((a, b) => b.v - a.v).slice(0, n);
  }

  flowTip(o: number, d: number): Tip {
    const M = this.M!, tt = this.ctx.tt;
    const v = M[o - 1][d - 1], back = M[d - 1][o - 1];
    const outO = this.tot!.out[o - 1] || 1;
    return {
      title: `${this.ctx.pname(o)} → ${this.ctx.pname(d)}`,
      sub: this.periodLabel,
      big: this.tons(v),
      rows: [
        [tt('shareOfOut'), fmtPct(this.L, (v / outO) * 100)],
        [`${this.ctx.pname(d)} → ${this.ctx.pname(o)}`, this.tons(back)],
      ],
      source: this.index.source[this.L],
    };
  }

  readonly flows = $derived.by((): Flow[] => {
    if (!this.M) return [];
    const arc = (o: number, d: number, kind: Flow['kind']): Flow => ({
      key: `${o}-${d}`, o: this.ctx.anchor(o), d: this.ctx.anchor(d), w: this.width(this.M![o - 1][d - 1]), kind, tip: this.flowTip(o, d),
    });
    if (app.compare) {
      if (!app.a || !app.b) return [];
      return [arc(app.a, app.b, 'out'), arc(app.b, app.a, 'in')].filter((f) => this.M![Number(f.key.split('-')[0]) - 1][Number(f.key.split('-')[1]) - 1] > 0);
    }
    if (app.pref) {
      const p = app.pref;
      // draw the smaller ones first so the big arcs stay on top
      return [...this.partners(p, 'in', 8).map((x) => arc(x.code, p, 'in')), ...this.partners(p, 'out', 8).map((x) => arc(p, x.code, 'out'))]
        .sort((a, b) => a.w - b.w);
    }
    return this.topPairs(30).reverse().map((x) => arc(x.o, x.d, 'all'));
  });

  readonly prefTip = (code: string): Tip => {
    const c = Number(code), tt = this.ctx.tt;
    const rows: [string, string][] = FLOW_METRICS.filter((m) => m !== app.fmetric)
      .map((m) => [this.label(m), m === 'net' ? this.signedTons(this.metricOf(m, c)) : this.tons(this.metricOf(m, c))]);
    const r = this.ranks.get(code);
    if (r && app.fmetric !== 'net') rows.push([tt('rank'), this.L === 'ja' ? `${r}${tt('rankOf')}` : `${r} ${tt('rankOf')}`]);
    const top = this.partners(c, 'out', 1)[0];
    if (top) rows.push([tt('topDest'), `${this.ctx.pname(top.code)} ${fmtPct(this.L, top.share, 0)}`]);
    return {
      title: this.ctx.pname(c),
      badge: app.compare ? (c === app.a ? 'a' : c === app.b ? 'b' : undefined) : undefined,
      sub: `${this.label(app.fmetric)} · ${this.periodLabel}`,
      big: this.fmt(this.values.get(code) ?? NaN),
      rows,
      source: this.index.source[this.L],
      action: !app.compare && app.pref !== c ? { label: tt('details'), run: () => app.pick(c) } : undefined,
    };
  };

  readonly table = $derived.by(() => ({
    primary: app.fmetric,
    columns: [
      ...FLOW_METRICS.map((m) => ({ key: m, label: this.label(m), get: (c: number) => this.metricOf(m, c),
                                    fmt: m === 'net' ? this.signedTons : this.tons })),
      { key: 'ext', label: this.ctx.tt('extShare'), get: (c: number) => {
          const o = this.metricOf('out', c), i = this.metricOf('intra', c);
          return o + i > 0 ? (o / (o + i)) * 100 : NaN;
        }, fmt: (v: number) => (isFinite(v) ? fmtPct(this.L, v, 0) : '–') },
    ],
  }));

  readonly compareRows = $derived.by((): CompareRow[] => {
    if (!app.a || !app.b || !this.M) return [];
    const a = app.a, b = app.b;
    const rows: CompareRow[] = FLOW_METRICS.map((m) => {
      const av = this.metricOf(m, a), bv = this.metricOf(m, b);
      const f = m === 'net' ? this.signedTons : this.tons;
      return { label: this.label(m), av, bv, fa: f(av), fb: f(bv), diff: this.signedTons(bv - av) };
    });
    const ab = this.M[a - 1][b - 1], ba = this.M[b - 1][a - 1];
    rows.push({ label: this.ctx.tt('between'), av: ab, bv: ba, fa: `→ ${this.tons(ab)}`, fb: `→ ${this.tons(ba)}`,
                sa: `A → B`, sb: `B → A` });
    return rows;
  });

  readonly trend = $derived.by(() => {
    const series = (code: number, key: string, label: string, kind: 'main' | 'a' | 'b') => ({
      key, label, kind, values: this.years.map((y) => { const M = this.matrix(y); return M ? this.metricOf(app.fmetric, code, M) : NaN; }),
    });
    const s = app.compare
      ? [app.a && series(app.a, 'a', this.ctx.pname(app.a), 'a'), app.b && series(app.b, 'b', this.ctx.pname(app.b), 'b')].filter(Boolean) as ReturnType<typeof series>[]
      : [series(app.pref, 'main', app.pref ? this.ctx.pname(app.pref) : this.ctx.tt('japan'), 'main')];
    return {
      series: s,
      periods: this.years.map((y) => ({ id: String(y), ja: `${y}年`, en: String(y) })),
      q: this.yi,
      setQ: (i: number) => (app.flowYear = this.years[i]),
      label: `${this.label(app.fmetric)} · ${this.ctx.tt('trend')}`,
      fmt: this.fmt,
      tick: (v: number) => `${v < 0 ? '−' : ''}${fmtCompact(this.L, Math.abs(v))}`,
      xticks: this.years.map((y, i) => ({ i, label: String(y) })),
      dots: true,
    };
  });
}
