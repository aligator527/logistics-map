// Static data produced by scripts/ (see README): warehouse statistics, DPL sites, expressways.

import type { Lang } from './i18n';
import { fmtCompact, fmtInt, fmtNum, fmtPct, fmtSignedPct, fmtSignedPt } from './scale';

export interface Label { ja: string; en: string }

export interface Quarter { id: string; ja: string; en: string; fy: string; published: string | null; url: string }

export interface Warehouse {
  source: Label & { url: string; scope: Label };
  generated: string;
  quarters: Quarter[];
  /** [quarter][prefecture 0..46] */
  prefs: Record<'area' | 'used' | 'empty' | 'inbound' | 'stock', number[][]>;
  /** [quarter] */
  japan: Record<'area' | 'used' | 'empty' | 'inbound' | 'stock', number[]>;
  notes: { quarter: string; metric: string; published: number; used: number }[];
}

export type Status = 'available' | 'leasing' | 'planned' | 'contracted';
export interface Site {
  name: string;
  pref: number;
  muni: string | null;
  address: string;
  status: Status;
  land: boolean;
  floor: number | null;
  plot: number | null;
  date: string | null;   // "YYYY-MM", or free text such as 着工前
  url: string | null;
  vr?: boolean;
  approx?: boolean;
  lat: number;
  lon: number;
  p: [number, number];   // map coordinates (metres, same space as the TopoJSON)
}
export interface Dpl {
  source: Label & { url: string; updated: string; retrieved: string; note: Label };
  sites: Site[];
}

export interface Roads {
  source: Label & { url: string };
  roads: { n: string; t: 1 | 2 | 3; c: [number, number][][] }[];
  joints: { n: string; k: 'ic' | 'sic' | 'jct'; p: [number, number] }[];
}

async function json<T>(path: string): Promise<T> {
  const r = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}
export const loadWarehouse = () => json<Warehouse>('data/warehouse.json');
export const loadDpl = () => json<Dpl>('data/dpl.json');
export const loadRoads = () => json<Roads>('geo/roads.json');

// ---------------------------------------------------------------- metrics

export type Metric = 'area' | 'inbound' | 'stock' | 'vacancy';
export type Mode = 'value' | 'yoy';
export const METRICS: Metric[] = ['area', 'inbound', 'stock', 'vacancy'];

const pct = (empty: number, area: number) => (area > 0 ? (empty / area) * 100 : NaN);

/** value of a metric for one prefecture (index 0..46), or for Japan (pref = -1) */
export function valueOf(w: Warehouse, m: Metric, q: number, pref: number): number {
  if (q < 0 || q >= w.quarters.length) return NaN;
  if (pref < 0) return m === 'vacancy' ? pct(w.japan.empty[q], w.japan.area[q]) : w.japan[m][q];
  return m === 'vacancy' ? pct(w.prefs.empty[q][pref], w.prefs.area[q][pref]) : w.prefs[m][q][pref];
}

/** quarter index one year earlier (same calendar quarter), or -1 */
export function prevYear(w: Warehouse, q: number): number {
  const [y, qq] = w.quarters[q].id.split('-Q').map(Number);
  const id = `${y - 1}-Q${qq}`;
  return w.quarters.findIndex((x) => x.id === id);
}

/** year-on-year change: % for amounts, percentage points for the vacancy rate */
export function yoyOf(w: Warehouse, m: Metric, q: number, pref: number): number {
  const p = prevYear(w, q);
  if (p < 0) return NaN;
  const a = valueOf(w, m, q, pref), b = valueOf(w, m, p, pref);
  if (!isFinite(a) || !isFinite(b)) return NaN;
  if (m === 'vacancy') return a - b;
  return b > 0 ? ((a - b) / b) * 100 : NaN;
}

export const shown = (w: Warehouse, m: Metric, mode: Mode, q: number, pref: number) =>
  mode === 'yoy' ? yoyOf(w, m, q, pref) : valueOf(w, m, q, pref);

/** unit of the raw figures (the statistics are published in thousands) */
export function unit(lang: Lang, m: Metric): string {
  if (m === 'vacancy') return '%';
  if (m === 'area') return lang === 'ja' ? '千㎡' : 'thousand m²';
  return lang === 'ja' ? '千トン' : 'thousand t';
}
/** unit for compact full values: 7,090万㎡ / 70.9M m² */
export const baseUnit = (lang: Lang, m: Metric) =>
  m === 'vacancy' ? '%' : m === 'area' ? (lang === 'ja' ? '㎡' : 'm²') : (lang === 'ja' ? 'トン' : 't');

/** compact full value: raw figures are in thousands */
export const fmtFull = (lang: Lang, m: Metric, v: number) =>
  m === 'vacancy' ? fmtPct(lang, v) : `${fmtCompact(lang, v * 1000)}${lang === 'ja' ? '' : ' '}${baseUnit(lang, m)}`;

/** withUnit: compact full value with its unit; otherwise the raw figure in thousands (tables) */
export function fmtValue(lang: Lang, m: Metric, v: number, withUnit = true): string {
  if (!isFinite(v)) return '–';
  if (m === 'vacancy') return fmtPct(lang, v);
  return withUnit ? fmtFull(lang, m, v) : fmtInt(lang, v);
}
export function fmtYoy(lang: Lang, m: Metric, v: number): string {
  if (!isFinite(v)) return '–';
  return m === 'vacancy' ? fmtSignedPt(lang, v) : fmtSignedPct(lang, v);
}
export function fmtShown(lang: Lang, m: Metric, mode: Mode, v: number): string {
  return mode === 'yoy' ? fmtYoy(lang, m, v) : fmtValue(lang, m, v);
}
export const isBuilt = (s: Site, today = new Date()) => {
  if (s.land || !s.date || !/^\d{4}-\d{2}$/.test(s.date)) return false;
  const [y, m] = s.date.split('-').map(Number);
  return y * 12 + m <= today.getFullYear() * 12 + today.getMonth() + 1;
};

export function fmtYm(lang: Lang, ym: string | null): string {
  if (!ym) return '–';
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  return lang === 'ja' ? `${m[1]}年${Number(m[2])}月`
    : new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}
export function fmtDate(lang: Lang, d: string | null): string {
  if (!d) return '–';
  const [y, m, day] = d.split('-').map(Number);
  return lang === 'ja' ? `${y}年${m}月${day}日`
    : new Date(y, m - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------- Phase 2: flows, labour

export interface CensusIndex {
  years: { year: number; survey: Label; urls: Record<string, string> }[];
  modes: (Label & { key: string })[];
  commodities: (Label & { key: string })[];
  source: Label & { url: string; note: Label; licence: Label };
}
/** one survey round: [breakdown key] -> 47×47 tons (row = origin) */
export interface CensusYear { year: number; day3: Record<string, number[][]>; annual: Record<string, number[][]> }
export const loadCensusIndex = () => json<CensusIndex>('data/census/index.json');
export const loadCensusYear = (y: number) => json<CensusYear>(`data/census/${y}.json`);

export interface Ssw {
  periods: { id: string; ja: string; en: string; url1: string; url2: string | null; fields: string[] }[];
  fields: (Label & { key: string; logistics: boolean })[];
  /** 特定技能1号 / 2号: [field][period][pref] (null = not a field in that period) */
  s1: Record<string, (number[] | null)[]>;
  s2: Record<string, (number[] | null)[]>;
  japan1: Record<string, (number | null)[]>;
  japan2: Record<string, (number | null)[]>;
  source: Label & { url: string; note: Label };
}
export const loadSsw = () => json<Ssw>('data/ssw.json');

export interface Jobs {
  periods: { id: string; ja: string; en: string }[];
  breakAt: string;
  occupations: (Label & { key: string })[];
  /** [occupation][period][pref] */
  ratio: Record<string, number[][]>;
  openings: Record<string, number[][]>;
  seekers: Record<string, number[][]>;
  japan: Record<string, number[]>;
  source: Label & { url: string; note: Label };
  shortfall2024: {
    source: Label & { url: string };
    national: { y2024: number; y2030: number; source: Label & { url: string } };
    regions: (Label & { pct: number; prefs: number[] })[];
  };
}
export const loadJobs = () => json<Jobs>('data/jobs.json');
