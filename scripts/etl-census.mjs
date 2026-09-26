// ETL for 全国貨物純流動調査（物流センサス, MLIT）-> public/data/census/<year>.json + index.json
//
//   node scripts/etl-census.mjs
//
// 47×47 prefecture origin–destination tables (tons), rows = 発都道府県, columns = 着都道府県:
//   I-3-2  3日間調査 by 代表輸送機関 (mode)     — sheets 合計 / 鉄道(小計) / トラック(小計) / 海運(小計) / 航空 …
//   I-3-1  3日間調査 by 品類 (commodity group)   — 合計 / 農水産品 / 林産品 / … / 特殊品
//   I-3-3  年間調査 by 品類 (annual; no mode split exists)
// Rounds 2005 / 2010 / 2015 (.xls on mlit.go.jp) and 2021 (.xlsx on e-Stat). The layouts differ
// (2021: data B4:AV50; older: C9:AW55 with spaced names such as 「北 海 道」 and half-width
// katakana sheet names such as 「ﾄﾗｯｸ計」), so the table is located by prefecture names and sheets
// by NFKC-normalised names. The diagonal (flows within a prefecture) is kept; the client drops it
// for arcs. Values are rounded to whole tons.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/census');
const OUT = resolve(root, 'public/data/census');
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');

const ESTAT = (id) => `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${id}`;
const MLIT = 'https://www.mlit.go.jp';
const ROUNDS = {
  2021: { mode: ESTAT('000040040996'), comm3: ESTAT('000040040995'), commY: ESTAT('000040040997'), ext: 'xlsx',
          survey: { ja: '第11回（2021年調査）', en: '11th survey (2021)' } },
  2015: { mode: `${MLIT}/common/001182573.xls`, comm3: `${MLIT}/common/001182572.xls`, commY: `${MLIT}/common/001182574.xls`, ext: 'xls',
          survey: { ja: '第10回（2015年調査）', en: '10th survey (2015)' } },
  2010: { mode: `${MLIT}/sogoseisaku/transport/content/T9-010302.xls`, comm3: `${MLIT}/sogoseisaku/transport/content/T9-010301.xls`,
          commY: `${MLIT}/sogoseisaku/transport/content/T9-010303.xls`, ext: 'xls', survey: { ja: '第9回（2010年調査）', en: '9th survey (2010)' } },
  2005: { mode: `${MLIT}/sogoseisaku/transport/content/T8-010302.xls`, comm3: `${MLIT}/sogoseisaku/transport/content/T8-010301.xls`,
          commY: `${MLIT}/sogoseisaku/transport/content/T8-010303.xls`, ext: 'xls', survey: { ja: '第8回（2005年調査）', en: '8th survey (2005)' } },
};

// breakdowns: key, labels, sheet-name test (NFKC), source table
const MODES = [
  { key: 'rail', ja: '鉄道', en: 'Rail', test: (n) => /^鉄道(\(小計\)|計)$/.test(n) },
  { key: 'truck', ja: 'トラック', en: 'Truck', test: (n) => /^トラック(\(小計\)|計)$/.test(n) },
  { key: 'sea', ja: '海運', en: 'Sea', test: (n) => /^海運(\(小計\)|計)$/.test(n) },
  { key: 'air', ja: '航空', en: 'Air', test: (n) => n === '航空' },
];
const COMMODITIES = [
  { key: 'agri', ja: '農水産品', en: 'Agricultural & marine', p: '農水' },
  { key: 'forest', ja: '林産品', en: 'Forest products', p: '林産' },
  { key: 'mineral', ja: '鉱産品', en: 'Mineral products', p: '鉱産' },
  { key: 'metal', ja: '金属機械工業品', en: 'Metals & machinery', p: '金属機械' },
  { key: 'chemical', ja: '化学工業品', en: 'Chemicals', p: '化学' },
  { key: 'light', ja: '軽工業品', en: 'Light industry', p: '軽工' },
  { key: 'misc', ja: '雑工業品', en: 'Miscellaneous manufactures', p: '雑工' },
  { key: 'waste', ja: '排出物', en: 'Waste', p: '排出' },
  { key: 'special', ja: '特殊品', en: 'Special goods', p: '特殊' },
];
const PREF2 = ['北海', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈', '新潟',
  '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌', '鳥取', '島根',
  '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児', '沖縄'];
const prefOf = (v) => { const s = norm(v); return s.length >= 2 ? PREF2.indexOf(s.slice(0, 2)) : -1; };

async function load(url, name) {
  const file = resolve(RAW, name);
  if (!existsSync(file)) {
    for (let i = 0; ; i++) {
      const r = await fetch(url, { headers: UA });
      if (r.ok) { writeFileSync(file, Buffer.from(await r.arrayBuffer())); break; }
      if (i === 2) throw new Error(`GET ${url}: ${r.status}`);
      await sleep(1500 * (i + 1));
    }
    await sleep(700);
  }
  return XLSX.read(readFileSync(file), { type: 'buffer' });
}

/** 47×47 matrix (row = origin) from one sheet, located by prefecture labels */
function matrix(ws, what) {
  const a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  // destination header: the row with the most prefecture names in sequence
  let hr = -1, cols = null;
  for (let r = 0; r < Math.min(20, a.length); r++) {
    const idx = [];
    a[r].forEach((v, c) => { const p = prefOf(v); if (p === idx.length) idx.push(c); });
    if (idx.length === 47) { hr = r; cols = idx; break; }
  }
  if (!cols) throw new Error(`${what}: destination header not found`);
  const m = [];
  for (let r = hr + 1; r < a.length && m.length < 47; r++) {
    const lc = a[r].findIndex((v, c) => c < cols[0] && prefOf(v) >= 0);
    if (lc < 0) continue;
    if (prefOf(a[r][lc]) !== m.length) throw new Error(`${what}: origin row ${r} out of order (${a[r][lc]})`);
    m.push(cols.map((c) => {
      const v = a[r][c];
      const n = typeof v === 'number' ? v : Number(norm(v).replace(/,/g, '')) || 0;
      return Math.round(n);
    }));
  }
  if (m.length !== 47) throw new Error(`${what}: ${m.length} origin rows`);
  return m;
}
const sheetBy = (wb, test, what) => {
  const n = wb.SheetNames.find((s) => test(norm(s)));
  if (!n) throw new Error(`${what}: sheet not found in ${wb.SheetNames.map(norm).join(',')}`);
  return wb.Sheets[n];
};
const total = (m) => m.reduce((s, r) => s + r.reduce((x, y) => x + y, 0), 0);

const index = { years: [], modes: MODES.map(({ key, ja, en }) => ({ key, ja, en })),
                commodities: COMMODITIES.map(({ key, ja, en }) => ({ key, ja, en })) };
for (const [year, src] of Object.entries(ROUNDS).sort()) {
  const wbMode = await load(src.mode, `${year}_I-3-2.${src.ext}`);
  const wbC3 = await load(src.comm3, `${year}_I-3-1.${src.ext}`);
  const wbCY = await load(src.commY, `${year}_I-3-3.${src.ext}`);
  const day3 = { all: matrix(sheetBy(wbMode, (n) => n === '合計', `${year} mode`), `${year} 3日 合計`) };
  for (const m of MODES) day3[m.key] = matrix(sheetBy(wbMode, m.test, `${year} ${m.ja}`), `${year} 3日 ${m.ja}`);
  for (const c of COMMODITIES) day3[c.key] = matrix(sheetBy(wbC3, (n) => n.startsWith(c.p), `${year} ${c.ja}`), `${year} 3日 ${c.ja}`);
  const annual = { all: matrix(sheetBy(wbCY, (n) => n === '合計', `${year} annual`), `${year} 年間 合計`) };
  for (const c of COMMODITIES) annual[c.key] = matrix(sheetBy(wbCY, (n) => n.startsWith(c.p), `${year} ${c.ja}`), `${year} 年間 ${c.ja}`);

  // consistency: the commodity 合計 of I-3-1 must equal the mode 合計 of I-3-2
  const t3 = total(day3.all), t3c = total(matrix(sheetBy(wbC3, (n) => n === '合計', 'c3'), 'c3'));
  if (Math.abs(t3 - t3c) / t3 > 0.001) console.warn(`  ! ${year}: 3日 合計 ${t3} (mode) vs ${t3c} (commodity)`);
  writeFileSync(resolve(OUT, `${year}.json`), JSON.stringify({ year: Number(year), day3, annual }));
  index.years.push({ year: Number(year), survey: src.survey, urls: { mode: src.mode, day3Commodity: src.comm3, annualCommodity: src.commY } });
  const off = day3.all.reduce((s, r, i) => s + r.reduce((x, y, j) => x + (i === j ? 0 : y), 0), 0);
  console.log(`  ${year}: 3日 ${t3.toLocaleString()} t (県間 ${off.toLocaleString()}), 年間 ${total(annual.all).toLocaleString()} t,`,
    `埼玉→東京 ${day3.all[10][12]} / ${annual.all[10][12]}, 愛知→大阪 ${day3.all[22][26]}`);
}
index.source = {
  ja: '国土交通省「全国貨物純流動調査（物流センサス）」',
  en: 'MLIT, Net Freight Flow Census (全国貨物純流動調査)',
  url: 'https://www.mlit.go.jp/statistics/details/t-other-2_tk_000196.html',
  note: {
    ja: '鉱業・製造業・卸売業・倉庫業の事業所から出荷された貨物の、真の発地から真の着地までの流動（純流動）。3日間調査は10月の平日3日間、年間調査は年度の推計値。輸送機関別の内訳は3日間調査のみ。',
    en: 'Shipments from mining, manufacturing, wholesale and warehousing establishments, from true origin to true destination (net flows). The 3-day survey covers three weekdays in October; the annual figures are estimates for the fiscal year. Mode split exists for the 3-day survey only.',
  },
  licence: { ja: '政府標準利用規約（第2.0版）/ 公共データ利用規約（PDL1.0）に基づき加工して作成', en: 'Processed under the Government of Japan Standard Terms of Use 2.0 / PDL 1.0' },
};
index.generated = new Date().toISOString().slice(0, 10);
writeFileSync(resolve(OUT, 'index.json'), JSON.stringify(index));
console.log('wrote census/index.json');
