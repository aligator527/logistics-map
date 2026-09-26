// Theme: commercial warehouses (倉庫統計季報) — Phase 1.

import { app } from '../lib/state.svelte';
import { baseUnit, fmtDate, fmtShown, fmtValue, fmtYoy, METRICS, shown, unit, valueOf, yoyOf,
         type Metric, type Warehouse } from '../lib/data';
import { fmtCompact, fmtSignedPct, fmtSignedPt, makeClasses } from '../lib/scale';
import { t } from '../lib/i18n';
import type { Tip } from '../components/Tooltip.svelte';
import type { CompareRow } from '../components/ComparePanel.svelte';
import { pad2, rankMap, type Ctx, type ThemeView } from './types';

export class WarehouseTheme implements ThemeView {
  // assigned in the constructor; declared first so the lazy $derived fields below can use them
  private w: Warehouse;
  private ctx: Ctx;
  constructor(w: Warehouse, ctx: Ctx) { this.w = w; this.ctx = ctx; }

  readonly quarter = $derived.by(() => this.w.quarters[app.q]);
  readonly periodLabel = $derived.by(() => this.ctx.L === 'ja' ? this.quarter.ja : this.quarter.en);
  private label = (m: Metric) => this.ctx.tt(`m_${m}`);

  readonly value = (code: number) => shown(this.w, app.metric, app.mode, app.q, code - 1);
  readonly values = $derived.by(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < 47; i++) m.set(pad2(i + 1), shown(this.w, app.metric, app.mode, app.q, i));
    return m;
  });
  readonly classes = $derived.by(() => makeClasses([...this.values.values()], app.mode === 'yoy', this.ctx.dark));
  readonly ranks = $derived.by(() => rankMap(this.values));
  readonly fmt = (v: number) => fmtShown(this.ctx.L, app.metric, app.mode, v);

  readonly legend = $derived.by(() => {
    const L = this.ctx.L;
    const u = app.mode === 'yoy' ? (app.metric === 'vacancy' ? (L === 'ja' ? 'ポイント' : 'pts') : '%') : baseUnit(L, app.metric);
    const title = L === 'ja' ? `${this.label(app.metric)}${app.mode === 'yoy' ? '・前年同期比' : ''}（${u}）`
      : `${this.label(app.metric)}${app.mode === 'yoy' ? ', year on year' : ''} (${u})`;
    const fmt = (v: number) => {
      if (app.mode === 'yoy') return (v > 0 ? '+' : v < 0 ? '−' : '') + fmtCompact(L, Math.abs(v)) + (app.metric === 'vacancy' ? '' : '%');
      return app.metric === 'vacancy' ? `${fmtCompact(L, v)}%` : fmtCompact(L, v * 1000);
    };
    return { title, fmt, hint: app.mode === 'yoy' ? this.ctx.tt('legendDiv') : this.ctx.tt('legendNote'), flows: null };
  });

  readonly source = $derived.by(() => {
    const L = this.ctx.L, q = this.quarter;
    const pub = !q.published ? '' : L === 'ja' ? `（${fmtDate(L, q.published)}公表）` : ` (published ${fmtDate(L, q.published)})`;
    return { text: `${this.w.source[L]} · ${this.periodLabel}${pub}`, url: q.url };
  });

  readonly prefTip = (code: string): Tip => {
    const { L, tt } = this.ctx;
    const c = Number(code), i = c - 1, m = app.metric;
    const rows: [string, string][] = [];
    if (app.mode === 'yoy') rows.push([this.label(m), fmtValue(L, m, valueOf(this.w, m, app.q, i))]);
    else rows.push([tt('yoy'), fmtYoy(L, m, yoyOf(this.w, m, app.q, i))]);
    const r = this.ranks.get(code);
    if (r) rows.push([tt('rank'), L === 'ja' ? `${r}${tt('rankOf')}` : `${r} ${tt('rankOf')}`]);
    if (m !== 'vacancy') rows.push([tt('m_vacancy'), fmtValue(L, 'vacancy', valueOf(this.w, 'vacancy', app.q, i))]);
    const d = this.ctx.dplCount(c);
    if (app.showDpl && d.built + d.pipe) rows.push([tt('dplIn'), `${d.built + d.pipe}`]);
    return {
      title: this.ctx.pname(c),
      badge: app.compare ? (c === app.a ? 'a' : c === app.b ? 'b' : undefined) : undefined,
      sub: `${this.label(m)}${app.mode === 'yoy' ? ` · ${tt('yoy')}` : ''}`,
      big: this.fmt(this.values.get(code) ?? NaN),
      rows,
      source: `${L === 'ja' ? '倉庫統計季報' : 'MLIT warehouse statistics'} · ${this.periodLabel}`,
      action: !app.compare && app.pref !== c ? { label: tt('details'), run: () => app.pick(c) } : undefined,
    };
  };

  readonly flows = [];

  readonly table = $derived.by(() => {
    const L = this.ctx.L;
    const paren = (s: string) => (L === 'ja' ? `（${s}）` : ` (${s})`);
    return {
      primary: app.mode === 'yoy' ? 'yoy' : app.metric,
      columns: [
        ...METRICS.map((m) => ({
          key: m, label: `${this.label(m)}${paren(unit(L, m))}`,
          get: (c: number) => valueOf(this.w, m, app.q, c - 1), fmt: (v: number) => fmtValue(L, m, v, false),
        })),
        { key: 'yoy', label: `${this.ctx.tt('yoy')}${paren(this.label(app.metric))}`,
          get: (c: number) => yoyOf(this.w, app.metric, app.q, c - 1), fmt: (v: number) => fmtYoy(L, app.metric, v) },
        { key: 'dpl', label: 'DPL', get: (c: number) => { const d = this.ctx.dplCount(c); return d.built + d.pipe; },
          fmt: (v: number) => (v ? String(v) : '–') },
      ],
    };
  });

  readonly compareRows = $derived.by(() => {
    if (!app.a || !app.b) return [];
    const L = this.ctx.L, tt = this.ctx.tt, a = app.a, b = app.b;
    const v = (m: Metric, c: number) => valueOf(this.w, m, app.q, c - 1);
    const y = (m: Metric, c: number) => `${tt('yoy')} ${fmtYoy(L, m, yoyOf(this.w, m, app.q, c - 1))}`;
    const rows: CompareRow[] = METRICS.map((m) => {
      const va = v(m, a), vb = v(m, b);
      let diff = '–';
      if (isFinite(va) && isFinite(vb)) {
        diff = m === 'vacancy' ? fmtSignedPt(L, vb - va)
          : `${vb - va < 0 ? '−' : '+'}${fmtValue(L, m, Math.abs(vb - va))}${va > 0 ? ` (${fmtSignedPct(L, ((vb - va) / va) * 100)})` : ''}`;
      }
      return { label: this.label(m), av: va, bv: vb, fa: fmtValue(L, m, va), fb: fmtValue(L, m, vb), sa: y(m, a), sb: y(m, b), diff };
    });
    const da = this.ctx.dplCount(a), db = this.ctx.dplCount(b);
    const sub = (d: { built: number; pipe: number }) => `${tt('operating')} ${d.built} · ${tt('pipeline')} ${d.pipe}`;
    rows.push({ label: tt('dplIn'), av: da.built + da.pipe, bv: db.built + db.pipe, fa: String(da.built + da.pipe),
                fb: String(db.built + db.pipe), sa: sub(da), sb: sub(db) });
    return rows;
  });

  readonly trend = $derived.by(() => {
    const L = this.ctx.L;
    const make = (key: string, label: string, kind: 'main' | 'a' | 'b', pref: number) => ({
      key, label, kind, values: this.w.quarters.map((_, q) => shown(this.w, app.metric, app.mode, q, pref)),
    });
    const series = app.compare
      ? ([app.a && make('a', this.ctx.pname(app.a), 'a', app.a - 1), app.b && make('b', this.ctx.pname(app.b), 'b', app.b - 1)].filter(Boolean) as ReturnType<typeof make>[])
      : [make('main', app.pref ? this.ctx.pname(app.pref) : this.ctx.tt('japan'), 'main', app.pref ? app.pref - 1 : -1)];
    return {
      series,
      periods: this.w.quarters,
      q: app.q,
      setQ: (q: number) => (app.q = q),
      label: `${this.label(app.metric)}${app.mode === 'yoy' ? ` · ${this.ctx.tt('yoy')}` : ''} · ${t(L, 'trend')}`,
      fmt: this.fmt,
      tick: (v: number) => app.mode === 'yoy'
        ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtCompact(L, Math.abs(v))}${app.metric !== 'vacancy' ? '%' : ''}`
        : app.metric === 'vacancy' ? `${fmtCompact(L, v)}%` : fmtCompact(L, v * 1000),
    };
  });
}
