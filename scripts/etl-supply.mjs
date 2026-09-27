// New warehouse supply (建築着工統計調査, 国土交通省) -> public/data/muni.json:
//
//   node scripts/etl-supply.mjs
//
// data/raw/kenchiku/t1_YYYY.xls      第1表 用途別、建築主別 (annual 2015–2025): 使途「倉庫」 floor area started per prefecture
// data/raw/kenchiku/t1_2026-MM.xls   第1-1表, the months of 2026 so far
// data/raw/kenchiku/t1_mYYYY.xls     第7-2表 市区町村別、用途別（大分類） (2024, 2025): Ｉ 運輸業用建築物 floor area
//   https://www.e-stat.go.jp/stat-search/files?toukei=00600120&tstat=000001016965
// 倉庫 counts every storage building (factory stores, farm sheds …), not only logistics; municipalities only have the
// 運輸業用 class (transport companies' buildings, incl. terminals and offices) — a proxy, labelled as such. A start
// becomes floor space a year or two later; single large projects make yearly figures jumpy (use multi-year sums).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/kenchiku');
const rowsOf = (f) => { const wb = XLSX.read(readFileSync(resolve(RAW, f))); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }); };
const num = (v) => { const x = Number(String(v).replace(/,/g, '')); return String(v).trim() === '' || !isFinite(x) ? 0 : x; };

/** 倉庫 floor area started (㎡): [Japan, pref 1..47] from a table-1 file */
function warehouses(f) {
  const rows = rowsOf(f), out = Array(48).fill(null);
  let block = -1;
  for (const r of rows) {
    const s = String(r[1]).trim();
    if (s === '全国計') block = 0;
    else { const m = s.match(/^(\d{2})000/); if (m) block = Number(m[1]); }
    if (block >= 0 && out[block] === null && String(r[4]).replace(/\s/g, '') === '倉庫') out[block] = num(r[7]);
  }
  if (out.some((v) => v === null)) throw new Error(`${f}: 倉庫 missing for ${out.map((v, i) => (v === null ? i : '')).filter(Boolean)}`);
  return out;
}
const files = readdirSync(RAW);
const years = files.map((f) => f.match(/^t1_(\d{4})\.xls$/)?.[1]).filter(Boolean).sort();
const series = years.map((y) => warehouses(`t1_${y}.xls`));
// the current year so far: sum of its months
const months = files.map((f) => f.match(/^t1_(\d{4})-(\d{2})\.xls$/)).filter(Boolean).sort((a, b) => (a[0] < b[0] ? -1 : 1));
let ytd = null, ytdLabel = '';
if (months.length) {
  ytd = Array(48).fill(0);
  for (const m of months) warehouses(m[0]).forEach((v, i) => (ytd[i] += v));
  ytdLabel = `${months[0][1]}年1〜${Number(months.at(-1)[2])}月`;
}

// ------------------------------------------------------------------ municipalities: 運輸業用 (proxy), 2 latest years
const out = JSON.parse(readFileSync(resolve(root, 'public/data/muni.json'), 'utf8'));
const idx = new Map(out.codes.map((c, i) => [c, i]));
const trStart = Array(out.codes.length).fill(0);
const mYears = files.map((f) => f.match(/^t1_m(\d{4})\.xls$/)?.[1]).filter(Boolean).sort().slice(-2);
for (const y of mYears) {
  for (const r of rowsOf(`t1_m${y}.xls`)) {
    const code = String(r[1]).match(/^(\d{5})/)?.[1];
    if (!code || !idx.has(code)) continue;
    trStart[idx.get(code)] += num(r[22]);
  }
}
// Hamamatsu's 2024 wards may be missing from the older year: nothing to split, the newer year covers them

// ------------------------------------------------------------------ prefecture: 3-year average and supply ÷ stock
const last3 = series.slice(-3);
const avg3 = Array.from({ length: 48 }, (_, i) => Math.round(last3.reduce((s, y) => s + y[i], 0) / last3.length));
const w = JSON.parse(readFileSync(resolve(root, 'public/data/warehouse.json'), 'utf8'));
const q = w.quarters.length - 1;
// 営業倉庫 所管面積 (千㎡) of the latest quarter per prefecture
const stock = w.prefs.area[q].map((v) => v * 1000);
out.supply = {
  years: [...years, ...(ytd ? [ytdLabel] : [])],
  japan: [...series.map((y) => y[0]), ...(ytd ? [ytd[0]] : [])],
  perPref: Array.from({ length: 47 }, (_, p) => [...series.map((y) => y[p + 1]), ...(ytd ? [ytd[p + 1]] : [])]),
  avg3Years: `${years.at(-3)}–${years.at(-1)}`,
  mYears,
};
out.m.whStart = out.codes.map((c) => avg3[Number(c.slice(0, 2))]);
out.m.supplyRatio = out.codes.map((c) => { const p = Number(c.slice(0, 2)), s = stock[p - 1]; return s > 0 ? Math.round((avg3[p] / s) * 1000) / 10 : null; });
out.m.trStart = trStart;
out.sources.supply = { ja: `建築着工統計調査（国土交通省）第1表・第7-2表を加工して作成（倉庫＝使途「倉庫」、市区町村は「運輸業用建築物」で代用）`, en: 'MLIT Building Construction Starts (tables 1 and 7-2), processed (municipalities: transport-industry buildings as a proxy)', url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00600120&tstat=000001016965' };
writeFileSync(resolve(root, 'public/data/muni.json'), JSON.stringify(out));
console.log(`倉庫着工 ${years[0]}–${years.at(-1)}${ytd ? ` + ${ytdLabel}` : ''}; Japan ${years.at(-1)} ${(series.at(-1)[0] / 1e6).toFixed(2)} M㎡`);
for (const p of [11, 12, 23, 27, 40]) console.log(`  pref ${p}: avg3 ${(avg3[p] / 1e4).toFixed(1)}万㎡, supply/stock ${out.m.supplyRatio[out.codes.findIndex((c) => Number(c.slice(0, 2)) === p)]}%`);
const top = trStart.map((v, i) => [out.codes[i], v]).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`  運輸業用 ${mYears.join('+')}: top ${top.map(([c, v]) => `${c} ${(v / 1e4).toFixed(1)}万㎡`).join(', ')}`);
