// What a map theme (warehouses / freight flows / labour) hands to the shared map, legend,
// table, compare panel and trend chart. Each theme is a class with $derived fields
// (src/themes/*.svelte.ts), so everything updates with the app state.

import type { Classes } from '../lib/scale';
import type { Key, Lang } from '../lib/i18n';
import type { Tip } from '../components/Tooltip.svelte';
import type { Flow } from '../components/MapView.svelte';
import type { Column } from '../components/RegionTable.svelte';
import type { CompareRow } from '../components/ComparePanel.svelte';
import type { Series } from '../components/Trend.svelte';
import type { Period } from '../components/TimeControl.svelte';

export interface Ctx {
  readonly L: Lang;
  readonly dark: boolean;
  readonly names: string[];
  pname(code: number): string;
  tt(k: Key): string;
  /** prefectural office position in map (viewBox) coordinates */
  anchor(code: number): [number, number];
  adjacent(a: number, b: number): boolean;
  dplCount(code: number): { built: number; pipe: number };
}

export interface ThemeView {
  values: Map<string, number>;
  /** mapped value for a prefecture (1..47) or all of Japan (0) */
  value: (code: number) => number;
  classes: Classes;
  legend: { title: string; fmt: (v: number) => string; hint: string; flows: 'focus' | 'all' | null };
  /** format of the mapped value */
  fmt: (v: number) => string;
  prefTip: (code: string) => Tip;
  flows: Flow[];
  table: { columns: Column[]; primary: string };
  compareRows: CompareRow[];
  source: { text: string; url: string };
  /** categorical legend instead of classes (warning levels, trip types) */
  categories?: { color: string; label: string }[] | null;
  /** label of the period on the map, e.g. 2025年4〜6月 */
  periodLabel: string;
  /** null: no time series (site score) */
  trend: {
    series: Series[];
    periods: Period[];
    q: number;
    setQ: (q: number) => void;
    label: string;
    fmt: (v: number) => string;
    tick: (v: number) => string;
    xticks?: { i: number; label: string }[];
    dots?: boolean;
  } | null;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const rankMap = (values: Map<string, number>) =>
  new Map([...values.entries()].filter(([, v]) => isFinite(v)).sort((a, b) => b[1] - a[1]).map(([c], i) => [c, i + 1]));
