// Theme: 現況 — live conditions. Weather warnings by municipality (JMA, polled in the browser) or
// the weekly diesel price by prefecture (資源エネルギー庁, refreshed by the weekly data job).

import { app } from '../lib/state.svelte';
import { live, WARN, LOGISTICS_CODES } from '../lib/live.svelte';
import { fmtNum, makeClasses, type Classes } from '../lib/scale';
import type { Tip } from '../components/Tooltip.svelte';
import type { CompareRow } from '../components/ComparePanel.svelte';
import { pad2, rankMap, type Ctx, type ThemeView } from './types';

export interface Diesel { dates: string[]; japan: (number | null)[]; prefs: (number | null)[][]; source: { ja: string; en: string; url: string } }

export { WARN_COLORS } from '../lib/warncolors';
import { WARN_COLORS } from '../lib/warncolors';

export class NowTheme implements ThemeView {
  // assigned in the constructor; declared first so the lazy $derived fields below can use them
  private diesel: Diesel | null;
  private codes: string[];
  private ctx: Ctx;
  constructor(diesel: Diesel | null, muniCodes: string[], ctx: Ctx) { this.diesel = diesel; this.codes = muniCodes; this.ctx = ctx; }

  readonly flows = [];
  private get L() { return this.ctx.L; }
  muniName: (code: string) => string = (c) => c;
  setNamer(f: (code: string) => string) { this.muniName = f; }
  readonly isWarn = $derived.by(() => app.nmet === 'warn' || !this.diesel);
  levelName = (lv: number) => this.ctx.tt(lv >= 5 ? 'lvl5' : lv === 4 ? 'lvl4' : lv === 3 ? 'lvl3' : lv === 2 ? 'lvl2' : 'lvl0');
  kinds = (code: string) => (live.warnings.get(code) ?? []).filter((c) => !app.nlog || LOGISTICS_CODES.has(c));

  // ------------------------------------------------------------ diesel helpers
  readonly last = $derived.by(() => (this.diesel ? this.diesel.dates.length - 1 : 0));
  price = (c: number, k = this.last) => (c > 0 ? this.diesel?.prefs[k]?.[c - 1] ?? NaN : this.diesel?.japan[k] ?? NaN);
  change = (c: number, weeks: number) => { const a = this.price(c), b = this.price(c, this.last - weeks); return isFinite(a) && isFinite(b) ? a - b : NaN; };
  yen = (v: number) => (isFinite(v) ? `${fmtNum(this.L, v, 1)}${this.L === 'ja' ? '円/L' : ' ¥/L'}` : '–');
  signedYen = (v: number) => (isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(this.L, Math.abs(v), 1)}${this.L === 'ja' ? '円' : ' ¥'}` : '–');

  // ------------------------------------------------------------ map
  readonly values = $derived.by(() => {
    if (this.isWarn) return new Map(this.codes.map((c) => [c, live.level(c, app.nlog)]));
    return new Map(Array.from({ length: 47 }, (_, i) => [pad2(i + 1), this.price(i + 1)]));
  });
  readonly classes = $derived.by((): Classes => this.isWarn
    ? { breaks: [2, 3, 4, 5], colors: WARN_COLORS[this.ctx.dark ? 'dark' : 'light'], diverging: false }
    : makeClasses([...this.values.values()], false, this.ctx.dark));
  readonly ranks = $derived.by(() => rankMap(this.values));
  /** prefecture: municipalities under a warning (L3+) — or the diesel price */
  readonly value = (code: number) => {
    if (!this.isWarn) return this.price(code);
    return this.codes.filter((c) => (code === 0 || Number(c.slice(0, 2)) === code) && live.level(c, app.nlog) >= 3).length;
  };
  readonly fmt = (v: number) => (this.isWarn ? `${fmtNum(this.L, v, 0)}${this.L === 'ja' ? '市区町村' : ' municipalities'}` : this.yen(v));
  readonly periodLabel = $derived.by(() => this.isWarn
    ? `${this.ctx.tt('liveWarn')} · ${live.warnTime ? new Date(live.warnTime).toLocaleString(this.L === 'ja' ? 'ja-JP' : 'en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '…'}`
    : `${this.ctx.tt('diesel')} · ${this.diesel?.dates[this.last] ?? ''}`);
  readonly legend = $derived.by(() => ({
    title: this.isWarn ? this.ctx.tt('liveWarn') : `${this.ctx.tt('diesel')}（${this.L === 'ja' ? '円/L' : '¥/L'}）`,
    fmt: (v: number) => (this.isWarn ? '' : fmtNum(this.L, v, 1)),
    hint: this.isWarn ? this.ctx.tt('warnHint') : this.ctx.tt('dieselHint'),
    flows: null,
  }));
  /** categorical legend for the warning levels */
  readonly categories = $derived.by(() => this.isWarn
    ? WARN_COLORS[this.ctx.dark ? 'dark' : 'light'].map((c, i) => ({ color: c, label: this.levelName(i ? i + 1 : 0) }))
    : null);
  readonly source = $derived.by(() => this.isWarn
    ? { text: this.ctx.tt('jmaSource'), url: 'https://www.jma.go.jp/bosai/warning/' }
    : { text: this.diesel!.source[this.L], url: this.diesel!.source.url });

  readonly prefTip = (code: string): Tip => {
    const tt = this.ctx.tt, L = this.L;
    if (code.length === 5) {
      const ks = this.kinds(code).sort((a, b) => (WARN[b]?.level ?? 2) - (WARN[a]?.level ?? 2));
      const lv = live.level(code, app.nlog);
      return {
        title: this.muniName(code),
        sub: tt('liveWarn'),
        big: this.levelName(lv),
        rows: ks.slice(0, 8).map((c) => [WARN[c]?.[L] ?? c, `L${WARN[c]?.level ?? 2}`] as [string, string]),
        source: tt('jmaSource'),
      };
    }
    const c = Number(code);
    if (this.isWarn) return { title: this.ctx.pname(c), big: this.fmt(this.value(c)), sub: tt('warnL3Count'), source: tt('jmaSource') };
    const r = this.ranks.get(code);
    return {
      title: this.ctx.pname(c),
      sub: `${tt('diesel')} · ${this.diesel?.dates[this.last]}`,
      big: this.yen(this.price(c)),
      rows: [[tt('wow'), this.signedYen(this.change(c, 1))], [tt('yoy'), this.signedYen(this.change(c, 52))],
             ...(r ? [[tt('rank'), `${r} / 47`] as [string, string]] : [])],
      source: this.diesel?.source[L],
    };
  };

  readonly table = $derived.by(() => this.isWarn
    ? { primary: 'level', columns: [
        { key: 'level', label: this.ctx.tt('liveWarn'), get: (i: number) => live.level(this.codes[i], app.nlog), fmt: (v: number) => this.levelName(v) },
        { key: 'kinds', label: this.L === 'ja' ? '件数' : 'Count', get: (i: number) => this.kinds(this.codes[i]).length, fmt: (v: number) => String(v) },
      ] }
    : { primary: 'price', columns: [
        { key: 'price', label: this.ctx.tt('diesel'), get: (c: number) => this.price(c), fmt: this.yen },
        { key: 'wow', label: this.ctx.tt('wow'), get: (c: number) => this.change(c, 1), fmt: this.signedYen },
        { key: 'yoy', label: this.ctx.tt('yoy'), get: (c: number) => this.change(c, 52), fmt: this.signedYen },
      ] });

  readonly compareRows = $derived.by((): CompareRow[] => {
    if (this.isWarn || !app.a || !app.b) return [];
    const row = (label: string, f: (c: number) => number, fmt: (v: number) => string): CompareRow => {
      const av = f(app.a), bv = f(app.b);
      return { label, av, bv, fa: fmt(av), fb: fmt(bv), diff: this.signedYen(bv - av) };
    };
    return [row(this.ctx.tt('diesel'), (c) => this.price(c), this.yen), row(this.ctx.tt('wow'), (c) => this.change(c, 1), this.signedYen),
            row(this.ctx.tt('yoy'), (c) => this.change(c, 52), this.signedYen)];
  });

  readonly trend = $derived.by(() => {
    if (this.isWarn || !this.diesel) return null;
    const d = this.diesel;
    const make = (c: number, key: string, label: string, kind: 'main' | 'a' | 'b') => ({ key, label, kind, values: d.dates.map((_, k) => this.price(c, k)) });
    const series = app.compare
      ? [app.a && make(app.a, 'a', this.ctx.pname(app.a), 'a'), app.b && make(app.b, 'b', this.ctx.pname(app.b), 'b')].filter(Boolean) as ReturnType<typeof make>[]
      : [make(app.pref, 'main', app.pref ? this.ctx.pname(app.pref) : this.ctx.tt('japan'), 'main')];
    return {
      series,
      periods: d.dates.map((x) => ({ id: x, ja: x, en: x })),
      q: this.last,
      setQ: () => {},
      label: `${this.ctx.tt('diesel')} · ${this.ctx.tt('trend')}`,
      fmt: this.yen,
      tick: (v: number) => fmtNum(this.L, v, 0),
      xticks: d.dates.map((x, i) => ({ i, label: x.slice(0, 7) })).filter((x, i, all) => i === 0 || i === all.length - 1 || (x.label.endsWith('-01') && all[i - 1]?.label !== x.label)),
    };
  });
}
