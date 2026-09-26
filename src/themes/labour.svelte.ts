// Theme: labour for logistics — driver / cargo-handling job ratios (MHLW) and Specified Skilled
// Workers (ISA) — Phase 2.

import { app } from '../lib/state.svelte';
import type { Jobs, Ssw } from '../lib/data';
import { fmtCompact, fmtInt, fmtNum, fmtPct, makeClasses } from '../lib/scale';
import type { Tip } from '../components/Tooltip.svelte';
import type { CompareRow } from '../components/ComparePanel.svelte';
import { pad2, rankMap, type Ctx, type ThemeView } from './types';

export class LabourTheme implements ThemeView {
  // assigned in the constructor; declared first so the lazy $derived fields below can use them
  readonly jobs: Jobs;
  readonly ssw: Ssw;
  private ctx: Ctx;
  constructor(jobs: Jobs, ssw: Ssw, ctx: Ctx) { this.jobs = jobs; this.ssw = ssw; this.ctx = ctx; }

  private get L() { return this.ctx.L; }
  readonly flows = [];

  // ------------------------------------------------------------ accessors
  ratio = (code: number, jp = app.jp, occ: string = app.occ) =>
    code > 0 ? this.jobs.ratio[occ]?.[jp]?.[code - 1] ?? NaN : this.jobs.japan[occ]?.[jp] ?? NaN;
  /** 特定技能1号 of a field; NaN when the field did not exist in that period */
  ssw1 = (code: number, sp = app.sp, field = app.field) => {
    const row = this.ssw.s1[field]?.[sp];
    if (!row) return NaN;
    return code > 0 ? row[code - 1] : this.ssw.japan1[field]?.[sp] ?? NaN;
  };
  ssw2 = (code: number, sp = app.sp) => {
    const row = this.ssw.s2.total?.[sp];
    if (!row) return NaN;
    return code > 0 ? row[code - 1] : this.ssw.japan2.total?.[sp] ?? NaN;
  };
  region = (code: number) => this.jobs.shortfall2024.regions.find((r) => r.prefs.includes(code));

  isJobs = $derived.by(() => app.lmetric === 'jobs');
  readonly occLabel = $derived.by(() => this.jobs.occupations.find((o) => o.key === app.occ)?.[this.L] ?? '');
  fieldLabel = (k: string) => this.ssw.fields.find((f) => f.key === k)?.[this.L] ?? k;
  readonly period = $derived.by(() => this.isJobs ? this.jobs.periods[app.jp] : this.ssw.periods[app.sp]);
  readonly periodLabel = $derived.by(() => this.period ? this.period[this.L] : '');
  /** the first fiscal year of the new occupation classification */
  readonly breakIndex = $derived.by(() => this.jobs.periods.findIndex((p) => p.id === this.jobs.breakAt));

  fmtRatio = (v: number) => (isFinite(v) ? fmtNum(this.L, v, 2) : '–');
  fmtPeople = (v: number) => (!isFinite(v) ? '–' : this.L === 'ja' ? `${fmtInt(this.L, v)}人` : fmtInt(this.L, v));
  readonly fmt = (v: number) => (this.isJobs ? this.fmtRatio(v) : this.fmtPeople(v));

  // ------------------------------------------------------------ map
  readonly value = (code: number) => (this.isJobs ? this.ratio(code) : this.ssw1(code));
  readonly values = $derived.by(() => {
    const m = new Map<string, number>();
    for (let c = 1; c <= 47; c++) m.set(pad2(c), this.isJobs ? this.ratio(c) : this.ssw1(c));
    return m;
  });
  readonly classes = $derived.by(() => makeClasses([...this.values.values()], false, this.ctx.dark));
  readonly ranks = $derived.by(() => rankMap(this.values));

  readonly legend = $derived.by(() => ({
    title: this.isJobs
      ? `${this.ctx.tt('jobsRatio')} · ${this.occLabel}（${this.ctx.tt('times')}）`
      : `${this.ctx.tt('ssw1')} · ${this.fieldLabel(app.field)}（${this.ctx.tt('persons')}）`,
    fmt: (v: number) => (this.isJobs ? fmtNum(this.L, v, 1) : fmtCompact(this.L, v)),
    hint: this.isJobs ? this.ctx.tt('jobsHint') : this.ctx.tt('legendNote'),
    flows: null,
  }));

  readonly source = $derived.by(() => this.isJobs
    ? { text: `${this.jobs.source[this.L]} · ${this.periodLabel}`, url: this.jobs.source.url }
    : { text: `${this.ssw.source[this.L]} · ${this.periodLabel}`, url: this.ssw.periods[app.sp]?.url1 ?? this.ssw.source.url });

  readonly prefTip = (code: string): Tip => {
    const c = Number(code), tt = this.ctx.tt, L = this.L;
    const rows: [string, string][] = [];
    if (this.isJobs) {
      const prev = app.jp > 0 ? this.ratio(c, app.jp - 1) : NaN;
      if (isFinite(prev)) rows.push([tt('vsPrevYear'), `${this.fmtRatio(prev)} → ${this.fmtRatio(this.ratio(c))}`]);
      rows.push([tt('openings'), this.fmtPeople(this.jobs.openings[app.occ][app.jp][c - 1])]);
      rows.push([tt('seekers'), this.fmtPeople(this.jobs.seekers[app.occ][app.jp][c - 1])]);
    } else {
      const prev = app.sp > 0 ? this.ssw1(c, app.sp - 1) : NaN;
      if (isFinite(prev)) rows.push([tt('vsPrevHalf'), `${this.fmtPeople(prev)} → ${this.fmtPeople(this.ssw1(c))}`]);
      if (app.field === 'total') rows.push([tt('ssw2'), this.fmtPeople(this.ssw2(c))]);
      else rows.push([tt('ssw1All'), this.fmtPeople(this.ssw1(c, app.sp, 'total'))]);
    }
    const r = this.ranks.get(code);
    if (r) rows.push([tt('rank'), L === 'ja' ? `${r}${tt('rankOf')}` : `${r} ${tt('rankOf')}`]);
    const reg = this.region(c);
    if (reg) rows.push([tt('shortfall2024'), `${fmtPct(L, reg.pct)}（${reg[L]}）`]);
    const v = this.values.get(code) ?? NaN;
    return {
      title: this.ctx.pname(c),
      badge: app.compare ? (c === app.a ? 'a' : c === app.b ? 'b' : undefined) : undefined,
      sub: `${this.legend.title.split('（')[0]} · ${this.periodLabel}`,
      big: !isFinite(v) && !this.isJobs ? tt('notYetField') : this.fmt(v),
      rows,
      source: this.isJobs ? this.jobs.source[L].split('」')[0] + '」' : this.ssw.source[L],
      action: !app.compare && app.pref !== c ? { label: tt('details'), run: () => app.pick(c) } : undefined,
    };
  };

  readonly table = $derived.by(() => {
    const tt = this.ctx.tt;
    const last = this.ssw.periods.length - 1;
    return {
      primary: this.isJobs ? `r_${app.occ}` : `s_${app.field}`,
      columns: [
        { key: 'r_driver', label: `${tt('jobsRatio')}（${this.jobs.occupations[0][this.L]}）`, get: (c: number) => this.ratio(c, app.jp, 'driver'), fmt: this.fmtRatio },
        { key: 'r_handling', label: `${tt('jobsRatio')}（${this.jobs.occupations[1][this.L]}）`, get: (c: number) => this.ratio(c, app.jp, 'handling'), fmt: this.fmtRatio },
        { key: 's_total', label: `${tt('ssw1')}（${this.fieldLabel('total')}）`, get: (c: number) => this.ssw1(c, this.isJobs ? last : app.sp, 'total'), fmt: this.fmtPeople },
        { key: 's_transport', label: `${tt('ssw1')}（${this.fieldLabel('transport')}）`, get: (c: number) => this.ssw1(c, this.isJobs ? last : app.sp, 'transport'), fmt: this.fmtPeople },
        ...(app.field !== 'total' && app.field !== 'transport' ? [{ key: `s_${app.field}`, label: `${tt('ssw1')}（${this.fieldLabel(app.field)}）`,
            get: (c: number) => this.ssw1(c), fmt: this.fmtPeople }] : []),
        { key: 'shortfall', label: tt('shortfall2024'), get: (c: number) => this.region(c)?.pct ?? NaN, fmt: (v: number) => (isFinite(v) ? fmtPct(this.L, v) : '–') },
      ],
    };
  });

  readonly compareRows = $derived.by((): CompareRow[] => {
    if (!app.a || !app.b) return [];
    const a = app.a, b = app.b, tt = this.ctx.tt, L = this.L;
    const row = (label: string, f: (c: number) => number, fmt: (v: number) => string, diff: (d: number) => string): CompareRow => {
      const av = f(a), bv = f(b);
      return { label, av, bv, fa: fmt(av), fb: fmt(bv), diff: isFinite(av) && isFinite(bv) ? diff(bv - av) : '–' };
    };
    const sgn = (d: number) => (d > 0 ? '+' : d < 0 ? '−' : '±');
    const last = this.ssw.periods.length - 1, sp = this.isJobs ? last : app.sp;
    return [
      row(`${tt('jobsRatio')} · ${this.jobs.occupations[0][L]}`, (c) => this.ratio(c, app.jp, 'driver'), this.fmtRatio, (d) => sgn(d) + fmtNum(L, Math.abs(d), 2)),
      row(`${tt('jobsRatio')} · ${this.jobs.occupations[1][L]}`, (c) => this.ratio(c, app.jp, 'handling'), this.fmtRatio, (d) => sgn(d) + fmtNum(L, Math.abs(d), 2)),
      row(`${tt('ssw1')} · ${this.fieldLabel('total')}`, (c) => this.ssw1(c, sp, 'total'), this.fmtPeople, (d) => sgn(d) + this.fmtPeople(Math.abs(d))),
      row(`${tt('ssw1')} · ${this.fieldLabel('transport')}`, (c) => this.ssw1(c, sp, 'transport'), this.fmtPeople, (d) => sgn(d) + this.fmtPeople(Math.abs(d))),
      { label: tt('shortfall2024'), av: this.region(a)?.pct ?? NaN, bv: this.region(b)?.pct ?? NaN,
        fa: `${fmtPct(L, this.region(a)?.pct ?? NaN)}`, fb: `${fmtPct(L, this.region(b)?.pct ?? NaN)}`,
        sa: this.region(a)?.[L], sb: this.region(b)?.[L] },
    ];
  });

  readonly trend = $derived.by(() => {
    const tt = this.ctx.tt;
    const jobs = this.isJobs;
    const periods = jobs ? this.jobs.periods : this.ssw.periods;
    const f = (code: number) => periods.map((_, i) => (jobs ? this.ratio(code, i) : this.ssw1(code, i)));
    const make = (code: number, key: string, label: string, kind: 'main' | 'a' | 'b') => ({ key, label, kind, values: f(code) });
    const series = app.compare
      ? [app.a && make(app.a, 'a', this.ctx.pname(app.a), 'a'), app.b && make(app.b, 'b', this.ctx.pname(app.b), 'b')].filter(Boolean) as ReturnType<typeof make>[]
      : [make(app.pref, 'main', app.pref ? this.ctx.pname(app.pref) : tt('japan'), 'main')];
    // first, last and the classification break, plus every 3rd year not crowding them
    const must = [0, this.breakIndex, periods.length - 1].filter((i) => i >= 0);
    const xticks = jobs
      ? periods.map((p, i) => ({ i, label: `FY${p.id.slice(2)}${i === this.breakIndex ? '*' : ''}` }))
          .filter(({ i }) => must.includes(i) || (i % 3 === 0 && must.every((m) => Math.abs(m - i) >= 2)))
      : periods.map((p, i) => ({ i, label: p.id.replace('-', '.') })).filter((_, i) => i % 2 === 1 || i === periods.length - 1);
    return {
      series,
      periods,
      q: jobs ? app.jp : app.sp,
      setQ: (i: number) => (jobs ? (app.jp = i) : (app.sp = i)),
      label: `${this.legend.title.split('（')[0]} · ${tt('trend')}`,
      fmt: this.fmt,
      tick: (v: number) => (jobs ? fmtNum(this.L, v, 1) : fmtCompact(this.L, v)),
      xticks,
      dots: !jobs,
    };
  });
}
