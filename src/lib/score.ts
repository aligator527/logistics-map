// Weighted site score by prefecture (Phase 3).
//
// Each criterion is a raw value per area (prefecture or municipality) plus a direction. Raw values
// are turned into a percentile rank 0–100 among the areas (ties share the mean rank), so Tokyo-sized
// outliers do not squash everyone else, and "higher is better" holds for every criterion after
// flipping the ones where less is better. The score is the weighted mean of those ranks.

import type { Label } from './data';

export interface Criterion extends Label {
  key: string;
  /** raw value per area (prefecture index 0..46, or municipality index) — NaN = missing */
  raw: number[];
  /** the value is the prefecture's figure repeated for each municipality (municipal score) */
  inherited?: boolean;
  /** +1: more is better, −1: less is better */
  dir: 1 | -1;
  /** how the raw value reads, e.g. "0.84 ×" */
  fmt: (v: number) => string;
  /** short explanation and data vintage */
  hint: Label;
  source: Label;
  group: 'market' | 'access' | 'cost' | 'labour' | 'risk';
}

/** percentile rank 0..100 among the areas (average rank for ties), NaN stays NaN */
export function percentile(raw: number[], dir: 1 | -1): number[] {
  const idx = raw.map((v, i) => ({ v: v * dir, i })).filter((x) => isFinite(x.v)).sort((a, b) => a.v - b.v);
  const out = raw.map(() => NaN);
  const n = idx.length;
  for (let k = 0; k < n; ) {
    let e = k;
    while (e + 1 < n && idx[e + 1].v === idx[k].v) e++;
    const r = n > 1 ? (((k + e) / 2) / (n - 1)) * 100 : 50;
    for (let t = k; t <= e; t++) out[idx[t].i] = r;
    k = e + 1;
  }
  return out;
}

export interface ScoreResult {
  /** 0..100 per area */
  total: number[];
  /** [criterion][area] percentile */
  parts: number[][];
}

/** weighted mean of percentiles; missing parts are dropped from that prefecture's denominator */
export function score(criteria: Criterion[], weights: number[]): ScoreResult {
  const parts = criteria.map((c) => percentile(c.raw, c.dir));
  const n = criteria[0]?.raw.length ?? 0;
  const total = Array.from({ length: n }, (_, i) => {
    let s = 0, w = 0;
    criteria.forEach((_, k) => {
      const v = parts[k][i];
      if (weights[k] > 0 && isFinite(v)) { s += v * weights[k]; w += weights[k]; }
    });
    return w > 0 ? s / w : NaN;
  });
  return { total, parts };
}

export interface Preset extends Label { key: string; weights: Record<string, number> }
