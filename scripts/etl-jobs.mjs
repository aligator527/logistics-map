// ETL for jobs-to-applicants ratios of drivers / cargo handlers by prefecture
// (MHLW 職業安定業務統計 「雇用関係指標（年度）」) -> public/data/jobs.json
//
//   node scripts/etl-jobs.mjs
//
// 第4表 月間有効求人数 and 第5表 月間有効求職者数 (e-Stat file downloads, no appId needed), sheet
// 「パート含む常用」. Both are fiscal-year sums of monthly counts, so openings / seekers equals the
// published annual average ratio. 第5表 is split by age and sex: we take 年齢計 and 性計.
//   2012–2022年度: 厚労省編職業分類 (第4回改訂) — 66自動車運転の職業 / 75運搬の職業
//   2023年度〜   : 日本標準職業分類 — 61自動車運転従事者 / 70運搬従事者
// The classification changed in between (break in the series). Prefectures are by 受理地 (the
// Hello Work office taking the listing): Tokyo is inflated by head-office listings.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { writeJson } from './lib/io.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/jobs');
const OUT = resolve(root, 'public/data/jobs.json');
mkdirSync(RAW, { recursive: true });
const URL_ = (id) => `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${id}&fileKind=0`;
const T4 = '000040455706', T5 = '000040455707';
const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');
const PREF2 = ['北海', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈', '新潟',
  '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌', '鳥取', '島根',
  '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児', '沖縄'];
/** 0..46 for 「東京労働局」 etc., -1 for 全国計, null otherwise */
const prefOf = (v) => { const s = norm(v); if (!s) return null; if (s.startsWith('全国')) return -1; const i = PREF2.indexOf(s.slice(0, 2)); return i >= 0 ? i : null; };

const OCC = {
  driver: [/^66自動車運転の職業$/, /^61自動車運転従事者$/],
  handling: [/^75運搬の職業$/, /^70運搬従事者$/],
};

async function load(id) {
  const file = resolve(RAW, `${id}.xlsx`);
  // MHLW replaces these files under the same statInfId every year: refresh a cache older than 30 days
  const stale = existsSync(file) && Date.now() - statSync(file).mtimeMs > 30 * 864e5;
  if (!existsSync(file) || stale) {
    const r = await fetch(URL_(id), { headers: { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' } });
    if (!r.ok) throw new Error(`GET ${id}: ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  return XLSX.read(readFileSync(file), { type: 'buffer' });
}

/**
 * values[occ][fy] = number[48] (index 0..46 prefectures, 47 = 全国) from one sheet.
 * labelCols: [prefecture col, (age col), occupation col]; value columns = FY header cells.
 */
function readSheet(ws, { ageCol, occCol, step }) {
  const a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const head = a[0].map(norm);
  const fyCols = [];
  head.forEach((h, c) => { const m = h.match(/^(\d{4})年度$/); if (m) fyCols.push({ fy: Number(m[1]), c }); });
  // T5: FY header spans 性計/男/女 — keep the first column of each FY (性計)
  const cols = step > 1 ? fyCols.filter((x, i, all) => i === 0 || all[i - 1].fy !== x.fy) : fyCols;
  const out = {};
  let pref = null, age = '';
  for (const r of a.slice(1)) {
    const p = prefOf(r[0]);
    if (p !== null) { pref = p; age = ''; }
    if (pref === null) continue;
    // the age group (merged cells) is only on the first row of its block
    if (ageCol !== undefined) { if (norm(r[ageCol])) age = norm(r[ageCol]); if (age !== '年齢計') continue; }
    const occ = norm(r[occCol]);
    for (const [key, res] of Object.entries(OCC)) {
      if (!res.some((re) => re.test(occ))) continue;
      for (const { fy, c } of cols) {
        const v = Number(r[c]) || 0;
        ((out[key] ??= {})[fy] ??= Array(48).fill(NaN))[pref < 0 ? 47 : pref] = v;
      }
    }
  }
  return out;
}

const wb4 = await load(T4);
const wb5 = await load(T5);
const pick = (wb, re) => wb.Sheets[wb.SheetNames.find((n) => re.test(norm(n)))];
const open = {}, seek = {};
for (const era of [/パート含む常用、2012/, /パート含む常用、2023/]) {
  const o = readSheet(pick(wb4, era), { occCol: 1, step: 1 });
  const s = readSheet(pick(wb5, era), { ageCol: 1, occCol: 2, step: 3 });
  for (const k of Object.keys(OCC)) { Object.assign((open[k] ??= {}), o[k]); Object.assign((seek[k] ??= {}), s[k]); }
}
const years = Object.keys(open.driver).map(Number).sort((x, y) => x - y);
const out = {
  periods: years.map((y) => ({ id: String(y), ja: `${y}年度`, en: `FY${y}` })),
  breakAt: '2023',
  occupations: [
    { key: 'driver', ja: '自動車運転の職業', en: 'Motor vehicle drivers' },
    { key: 'handling', ja: '運搬の職業', en: 'Cargo handling' },
  ],
  ratio: {}, openings: {}, seekers: {}, japan: {},
};
for (const k of Object.keys(OCC)) {
  out.ratio[k] = years.map((y) => open[k][y].slice(0, 47).map((v, i) => +(v / seek[k][y][i]).toFixed(2)));
  out.openings[k] = years.map((y) => open[k][y].slice(0, 47).map((v) => Math.round(v / 12)));   // monthly average
  out.seekers[k] = years.map((y) => seek[k][y].slice(0, 47).map((v) => Math.round(v / 12)));
  out.japan[k] = years.map((y) => +(open[k][y][47] / seek[k][y][47]).toFixed(2));
}
out.source = {
  ja: '厚生労働省「職業安定業務統計」雇用関係指標（年度）第4表・第5表（パートタイムを含む常用）',
  en: 'MHLW, Employment Security Statistics — annual employment indicators, tables 4 and 5 (regular incl. part-time)',
  url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00450222',
  note: {
    ja: '有効求人数÷有効求職者数（年度平均）。都道府県はハローワークの受理地ベース（本社一括求人が多い東京は高めに出る）。2023年度から職業分類が変わったため、2022年度以前とは厳密に接続しません。',
    en: 'Openings ÷ applicants (fiscal-year average). Prefecture = where Hello Work took the listing (Tokyo is inflated by head-office listings). The occupation classification changed in FY2023, so earlier years are not strictly comparable.',
  },
};
// NX総合研究所: estimated 2024 transport-capacity shortfall by 運輸局 region (2019 baseline). Indicative only.
out.shortfall2024 = {
  source: { ja: 'NX総合研究所「物流の2024年問題の影響について（2）」（2022年11月）', en: 'NX Logistics Research Institute, “Impact of the 2024 problem (2)” (Nov 2022)',
            url: 'https://www.meti.go.jp/shingikai/mono_info_service/sustainable_logistics/pdf/003_01_00.pdf' },
  national: { y2024: 14.2, y2030: 34.1, source: { ja: '持続可能な物流の実現に向けた検討会 最終取りまとめ（2023年8月）', en: 'MLIT study group on sustainable logistics, final report (Aug 2023)',
              url: 'https://www.mlit.go.jp/seisakutokatsu/freight/content/001626756.pdf' } },
  regions: [
    { ja: '北海道', en: 'Hokkaido', pct: 11.4, prefs: [1] },
    { ja: '東北', en: 'Tohoku', pct: 9.2, prefs: [2, 3, 4, 5, 6, 7] },
    { ja: '関東', en: 'Kanto', pct: 15.6, prefs: [8, 9, 10, 11, 12, 13, 14, 19] },
    { ja: '北陸信越', en: 'Hokuriku-Shinetsu', pct: 10.8, prefs: [15, 16, 17, 20] },
    { ja: '中部', en: 'Chubu', pct: 13.7, prefs: [18, 21, 22, 23, 24] },
    { ja: '近畿', en: 'Kinki', pct: 12.1, prefs: [25, 26, 27, 28, 29, 30] },
    { ja: '中国', en: 'Chugoku', pct: 20.0, prefs: [31, 32, 33, 34, 35] },
    { ja: '四国', en: 'Shikoku', pct: 9.2, prefs: [36, 37, 38, 39] },
    { ja: '九州', en: 'Kyushu', pct: 19.1, prefs: [40, 41, 42, 43, 44, 45, 46] },
  ],
};
out.generated = new Date().toISOString().slice(0, 10);
writeJson(OUT, out);
const i = years.length - 1;
console.log(`wrote ${OUT}: ${years[0]}–${years[i]},`, 'driver JP', out.japan.driver.slice(-4).join('/'),
  '東京', out.ratio.driver[i][12], '埼玉', out.ratio.driver[i][10], '愛知', out.ratio.driver[i][22], '奈良', out.ratio.driver[i][28], '高知', out.ratio.driver[i][38]);
