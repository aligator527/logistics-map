// Rough cost of a site (コスト試算): land purchase, staff and fuel, from the municipality's industrial land
// price, the prefecture's minimum wage and diesel price. The assumptions are the user's (kept in
// this browser); results are orders of magnitude for comparing places, not quotes.
import { store } from './store.svelte';
import { fare, co2Kg, regionOf, type Vehicle } from './fares';
import { demandArray } from './userdata.svelte';
import { regionOfPref, latest, TSUBO_M2 } from './rent';

export type DemandKey = 'pop' | 'hh' | 'retail' | 'mailorder' | 'mfgShip' | 'wsEmp' | 'user';
export interface CostInputs {
  plot: number; staff: number; hours: number; premium: number; km: number; kmPerL: number; days: number;
  /** delivery runs (標準的運賃): vehicle, runs a day, load factor %, how far a run may go (minutes one way), what the demand is */
  vehicle: Vehicle; runs: number; load: number; limit: number; demand: DemandKey;
  /** hourly pay: the minimum wage, or the actual pay of an occupation (賃金構造基本統計調査), or part-time in 運輸業 */
  wageBasis: WageBasis;
  /** total cost over years (present value): horizon in years, discount rate % */
  years: number; discount: number;
  /** buy the land and build, or lease a rental logistics facility (一五不動産 regional asking rents);
   *  warehouse floor area ㎡, building cost 円/㎡ (buy), rent 円/坪・月 (lease; 0 = the region's median) */
  tenure: Tenure; floor: number; buildCost: number; rent: number;
}
export type Tenure = 'buy' | 'lease';
export type WageBasis = 'min' | 'handling' | 'truckL' | 'truck' | 'part';
const KEY = 'costInputs';
const DEFAULTS: CostInputs = { plot: 20000, staff: 60, hours: 2000, premium: 25, km: 2000, kmPerL: 4, days: 300,
  vehicle: 'l', runs: 20, load: 60, limit: 240, demand: 'pop', wageBasis: 'handling', years: 10, discount: 3,
  tenure: 'buy', floor: 30000, buildCost: 100000, rent: 0 };
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

export interface Lease {
  /** 円/坪・月 used, whether it is the region's median, the region's name, yen a year, yearly rent trend (last 5 years) */
  rent: number; regional: boolean; region: { ja: string; en: string } | null; yearly: number; growth: number;
}
/** a rental facility of `floor` ㎡ at the region's median asking rent (or the user's own) */
export function lease(i: number, c: CostInputs = costs.inputs): Lease | null {
  const m = store.muni;
  if (!m || i < 0) return null;
  const g = regionOfPref(store.rent, Number(m.codes[i].slice(0, 2)));
  const own = c.rent > 0;
  const rent = own ? c.rent : g ? latest(g.rent) : NaN;
  // 20 quarters back, when the series reaches that far
  const hist = g?.rent ?? [], k = hist.length - 1;
  const growth = g && hist[k] && hist[k - 20] ? (hist[k]! / hist[k - 20]!) ** (1 / 5) - 1 : 0;
  return { rent, regional: !own && !!g, region: g ? { ja: g.ja, en: g.en } : null, yearly: (c.floor / TSUBO_M2) * rent * 12, growth };
}

/** 鉄骨造の倉庫: 法定耐用年数 31 years, straight line — only for what the building is still worth at the horizon */
const BUILDING_LIFE = 31;
export interface Tco {
  total: number; land: number; residual: number; staff: number; transport: number; wageGrowth: number; landGrowth: number; years: number;
  tenure: Tenure; building: number; buildingResidual: number; rent: number; rentGrowth: number;
}
/** yen, present value over `years`: land bought now less its value at the end (the local 5-year price trend), staff
 *  growing with the prefecture's minimum-wage trend (last 5 years), and the delivery runs; discounted at `discount` % */
export function tco(i: number, c: CostInputs = costs.inputs, run: TransportEstimate | null = transport(i, c)): Tco | null {
  const e = estimate(i, c), m = store.muni;
  if (!e || !m) return null;
  const pc = Number(m.codes[i].slice(0, 2));
  const hist = (m as unknown as { wage?: { perPref: number[][] } }).wage?.perPref[pc - 1] ?? [];
  const wageGrowth = hist.length > 5 && hist.at(-6)! > 0 ? (hist.at(-1)! / hist.at(-6)!) ** (1 / 5) - 1 : 0.03;
  const l5 = m.m.land5?.[i];
  const landGrowth = l5 !== null && l5 !== undefined && isFinite(l5) ? (1 + l5 / 100) ** (1 / 5) - 1 : 0;
  const r = c.discount / 100, n = Math.max(1, Math.round(c.years));
  const buy = c.tenure !== 'lease';
  const ls = buy ? null : lease(i, c);
  const rentGrowth = ls?.growth ?? 0;
  let staff = 0, transportPv = 0, rent = 0;
  for (let y = 1; y <= n; y++) {
    const df = 1 / (1 + r) ** y;
    staff += (isFinite(e.staff) ? e.staff : 0) * (1 + wageGrowth) ** (y - 1) * df;
    transportPv += (run?.yearly ?? 0) * df;
    if (ls) rent += ls.yearly * (1 + rentGrowth) ** (y - 1) * df;
  }
  const land = buy && isFinite(e.land) ? e.land : 0;
  const residual = (land * (1 + landGrowth) ** n) / (1 + r) ** n;
  const building = buy ? c.floor * c.buildCost : 0;
  const buildingResidual = (building * Math.max(0, 1 - n / BUILDING_LIFE)) / (1 + r) ** n;
  const fixed = buy ? land - residual + building - buildingResidual : rent;
  // no demand within the delivery area: the runs are unknown, so is the total (a zero would favour places out of reach);
  // a lease outside the surveyed regions has no rent unless the user gives one
  return {
    total: run && isFinite(fixed) ? fixed + staff + transportPv : NaN, land, residual, staff, transport: run ? transportPv : NaN, wageGrowth, landGrowth, years: n,
    tenure: buy ? 'buy' : 'lease', building, buildingResidual, rent: ls ? rent : 0, rentGrowth,
  };
}
