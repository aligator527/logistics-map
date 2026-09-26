// Rough cost of a site (コスト試算): land purchase, staff and fuel, from the municipality's industrial land
// price, the prefecture's minimum wage and diesel price. The assumptions are the user's (kept in
// this browser); results are orders of magnitude for comparing places, not quotes.
import { store } from './store.svelte';

export interface CostInputs { plot: number; staff: number; hours: number; premium: number; km: number; kmPerL: number; days: number }
const KEY = 'costInputs';
const DEFAULTS: CostInputs = { plot: 20000, staff: 60, hours: 2000, premium: 25, km: 2000, kmPerL: 4, days: 300 };
function read(): CostInputs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
}
class Costs {
  inputs = $state<CostInputs>(read());
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.inputs)); } catch { /* private mode */ } }
  reset() { this.inputs = { ...DEFAULTS }; this.save(); }
}
export const costs = new Costs();

export interface CostEstimate { land: number; staff: number; fuel: number; wage: number; diesel: number; landPrice: number }
/** yen: land purchase (once), staff and fuel (per year) for a municipality index */
export function estimate(i: number, c: CostInputs = costs.inputs): CostEstimate | null {
  const m = store.muni;
  if (!m || i < 0) return null;
  const pc = Number(m.codes[i].slice(0, 2));
  const wageData = (m as unknown as { wage?: { perPref: number[][] } }).wage;
  const wage = wageData ? wageData.perPref[pc - 1].at(-1)! : NaN;
  const d = store.diesel, k = d ? d.dates.length - 1 : -1;
  const diesel = d ? d.prefs[k]?.[pc - 1] ?? d.japan[k] ?? NaN : NaN;
  const landPrice = m.m.land[i] ?? NaN;
  return {
    landPrice, wage, diesel,
    land: landPrice * c.plot,
    staff: c.staff * c.hours * wage * (1 + c.premium / 100),
    fuel: (c.km * c.days / c.kmPerL) * (diesel as number),
  };
}
