// Logistics-facility rental market by region (public/data/rent.json, scripts/etl-rent.mjs; 一五不動産情報サービス).
export interface RentRegion {
  key: string; ja: string; en: string; prefs: number[];
  leasable: (number | null)[]; leased: (number | null)[]; vacantArea: (number | null)[]; vacancy: (number | null)[];
  completions: (number | null)[]; absorption: (number | null)[]; rent: (number | null)[];
}
export interface Rent {
  source: { ja: string; en: string; url: string; csv: string; note: { ja: string; en: string } };
  generated: string; quarters: string[]; regions: RentRegion[];
}
export const regionOfPref = (r: Rent | null, pref: number) => r?.regions.find((g) => g.prefs.includes(pref)) ?? null;
/** the latest known value of a series */
export const latest = (a: (number | null)[]) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null) return a[i]!; return NaN; };
/** 1 坪 = 400/121 ㎡ */
export const TSUBO_M2 = 400 / 121;
