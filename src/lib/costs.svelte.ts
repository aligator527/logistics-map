// Rough cost of a site (コスト試算): land purchase, staff and fuel, from the municipality's industrial land
// price, the prefecture's minimum wage and diesel price. The assumptions are the user's (kept in
// this browser); results are orders of magnitude for comparing places, not quotes.
import { store } from './store.svelte';
import { fare, co2Kg, regionOf, type Vehicle } from './fares';
import { demandArray } from './userdata.svelte';

export type DemandKey = 'pop' | 'hh' | 'retail' | 'mailorder' | 'mfgShip' | 'wsEmp' | 'user';
export interface CostInputs {
  plot: number; staff: number; hours: number; premium: number; km: number; kmPerL: number; days: number;
  /** delivery runs (標準的運賃): vehicle, runs a day, load factor %, how far a run may go (minutes one way), what the demand is */
  vehicle: Vehicle; runs: number; load: number; limit: number; demand: DemandKey;
  /** hourly pay: the minimum wage, or the actual pay of an occupation (賃金構造基本統計調査), or part-time in 運輸業 */
  wageBasis: WageBasis;
}
export type WageBasis = 'min' | 'handling' | 'truckL' | 'truck' | 'part';
const KEY = 'costInputs';
const DEFAULTS: CostInputs = { plot: 20000, staff: 60, hours: 2000, premium: 25, km: 2000, kmPerL: 4, days: 300,
  vehicle: 'l', runs: 20, load: 60, limit: 240, demand: 'pop', wageBasis: 'handling' };
function read(): CostInputs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
}
class Costs {
  inputs = $state<CostInputs>(read());
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.inputs)); } catch { /* private mode */ } }
  reset() { this.inputs = { ...DEFAULTS }; this.save(); }
}
export const costs = new Costs();

export interface CostEstimate { land: number; staff: number; fuel: number; wage: number; minWage: number; diesel: number; landPrice: number }
/** yen: land purchase (once), staff and fuel (per year) for a municipality index */
export function estimate(i: number, c: CostInputs = costs.inputs): CostEstimate | null {
  const m = store.muni;
  if (!m || i < 0) return null;
  const pc = Number(m.codes[i].slice(0, 2));
  const wageData = (m as unknown as { wage?: { perPref: number[][] } }).wage;
  const minWage = wageData ? wageData.perPref[pc - 1].at(-1)! : NaN;
  const occ = (m as unknown as { wageOcc?: { perPref: Record<string, { hourly: number | null }>[]; partTimeTransport: (number | null)[] } }).wageOcc;
  const actual = c.wageBasis === 'min' || !occ ? null : c.wageBasis === 'part' ? occ.partTimeTransport[pc - 1] : occ.perPref[pc - 1]?.[c.wageBasis]?.hourly;
  // never below the minimum wage (small survey cells can be noisy)
  const wage = actual ? Math.max(actual, isFinite(minWage) ? minWage : 0) : minWage;
  const d = store.diesel, k = d ? d.dates.length - 1 : -1;
  const diesel = d ? d.prefs[k]?.[pc - 1] ?? d.japan[k] ?? NaN : NaN;
  const landPrice = m.m.land[i] ?? NaN;
  return {
    landPrice, wage, minWage, diesel,
    land: landPrice * c.plot,
    staff: c.staff * c.hours * wage * (1 + c.premium / 100),
    fuel: (c.km * c.days / c.kmPerL) * (diesel as number),
  };
}

export interface TransportEstimate {
  /** yen a year for the runs, average fare and road km of a run, kg CO2 a year, share of demand within the limit */
  yearly: number; perRun: number; km: number; co2: number; served: number; region: string;
}
/** delivery runs from a municipality to the demand within `limit` minutes, spread by the demand's weight:
 *  each run is one charter at the 標準的運賃 of its road distance (the truck's region = the site's prefecture) */
export function transport(i: number, c: CostInputs = costs.inputs): TransportEstimate | null {
  const m = store.muni, lt = store.lt;
  if (!m || !lt?.router || i < 0) return null;
  const r = lt.rt();
  const { t, km } = r.toMunisKm([r.muni(i)]);
  const w = demandArray(c.demand);
  const region = regionOf(Number(m.codes[i].slice(0, 2)));
  let sw = 0, all = 0, sf = 0, sk = 0, sc = 0;
  for (let j = 0; j < t.length; j++) {
    const wj = Math.max(0, w[j] ?? 0);
    all += wj;
    if (!(t[j] <= c.limit) || !isFinite(km[j]) || !wj) continue;
    sw += wj; sf += wj * fare(km[j], c.vehicle, region); sk += wj * km[j]; sc += wj * co2Kg(km[j], c.vehicle, c.load / 100);
  }
  if (!sw) return null;
  const runs = c.runs * c.days;
  return { yearly: (sf / sw) * runs, perRun: sf / sw, km: sk / sw, co2: (sc / sw) * runs, served: sw / all, region };
}
