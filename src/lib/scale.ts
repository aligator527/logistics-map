// Classed colour scales for the choropleth.
// Sequential: container blue, OKLCH with monotone lightness (validated: ΔL ≥ 0.06 between steps,
// lightest step ≥ 2:1 against the page). In dark mode the anchor flips so "more" is always
// further from the surface.
// Diverging (year on year): clay (decrease) <- neutral grey -> blue (increase). Amber is kept
// out of the data colours: it marks DPL sites and the selection.

import type { Lang } from './i18n';

export const SEQ = {
  light: ['#81b4d3', '#589cc9', '#2d83c0', '#0168b0', '#014f94', '#083875', '#082256'],
  dark: ['#355da9', '#3f75c0', '#4b8ed7', '#57a8ee', '#7ac1f5', '#a0d8fc', '#ceedfe'],
};
export const DIV = {
  light: ['#762f06', '#a95d3a', '#d19d86', '#e2e2de', '#84afdc', '#2d78bd', '#024981'],
  dark: ['#f9a782', '#c37552', '#794b36', '#34383c', '#335b83', '#4790d8', '#89c3fe'],
};

export interface Classes {
  breaks: number[]; // upper bounds of classes 0..k-2 (last class is open)
  colors: string[];
  diverging: boolean;
}

function nice(v: number): number {
  if (v === 0 || !isFinite(v)) return v;
  const sign = Math.sign(v), a = Math.abs(v);
  const p = Math.pow(10, Math.floor(Math.log10(a)) - 1);
  return sign * Math.round(a / p) * p;
}

function quantiles(sorted: number[], k: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < k; i++) out.push(sorted[Math.min(sorted.length - 1, Math.floor((i / k) * sorted.length))]);
  return out;
}

/** Roughly equal-count classes with rounded, strictly increasing breaks. */
export function makeClasses(values: number[], diverging: boolean, dark: boolean): Classes {
  const mode = dark ? 'dark' : 'light';
  if (diverging) {
    const abs = values.filter((v) => isFinite(v)).map(Math.abs).sort((a, b) => a - b);
    let [t1, t2, t3] = abs.length ? quantiles(abs, 4) : [1, 5, 10];
    t1 = Math.max(nice(t1), 0.5); t2 = Math.max(nice(t2), t1 * 1.5); t3 = Math.max(nice(t3), t2 * 1.5);
    return { breaks: [-t3, -t2, -t1, t1, t2, t3].map(nice), colors: DIV[mode], diverging: true };
  }
  const pos = values.filter((v) => v > 0 && isFinite(v)).sort((a, b) => a - b);
  const ramp = SEQ[mode];
  if (pos.length === 0) return { breaks: [], colors: ramp.slice(0, 1), diverging: false };
  const raw = quantiles(pos, ramp.length).map(nice);
  const breaks: number[] = [];
  for (const b of raw) if (b > (breaks.at(-1) ?? 0)) breaks.push(b);
  const n = breaks.length + 1;
  const colors = Array.from({ length: n }, (_, i) => ramp[n === 1 ? ramp.length - 1 : Math.round((i * (ramp.length - 1)) / (n - 1))]);
  return { breaks, colors, diverging: false };
}

export function classOf(c: Classes, v: number): number {
  let i = 0;
  while (i < c.breaks.length && v >= c.breaks[i]) i++;
  return i;
}

// ---------------------------------------------------------------- number formatting

const nf = new Map<string, Intl.NumberFormat>();
function fmt(lang: Lang, opts: Intl.NumberFormatOptions) {
  const key = lang + JSON.stringify(opts);
  let f = nf.get(key);
  if (!f) nf.set(key, (f = new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US', opts)));
  return f;
}

export const fmtInt = (lang: Lang, v: number) => fmt(lang, { maximumFractionDigits: 0 }).format(v);
export const fmtNum = (lang: Lang, v: number, d = 1) =>
  fmt(lang, { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
export const fmtCompact = (lang: Lang, v: number) =>
  fmt(lang, { notation: 'compact', maximumSignificantDigits: 3 }).format(v);
export const fmtPct = (lang: Lang, v: number, digits = 1) =>
  fmt(lang, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v) + '%';
/** sign of the value as displayed (one decimal): -0.04 shows as ±0.0, not −0.0 */
const sign = (v: number) => { const r = Math.round(v * 10); return r > 0 ? '+' : r < 0 ? '−' : '±'; };
export const fmtSignedPct = (lang: Lang, v: number) => sign(v) + fmtPct(lang, Math.abs(v));
export const fmtSignedPt = (lang: Lang, v: number) =>
  sign(v) + fmt(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.abs(v)) + (lang === 'ja' ? 'pt' : ' pts');
/** m² with 坪 in Japanese (the unit the property market uses) */
export const fmtSqm = (lang: Lang, v: number) =>
  lang === 'ja' ? `${fmtInt(lang, v)}㎡（${fmtInt(lang, v / 3.305785)}坪）` : `${fmtInt(lang, v)} m²`;
