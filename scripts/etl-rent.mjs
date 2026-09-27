// Logistics-facility rents and vacancy -> public/data/rent.json
//
//   node scripts/etl-rent.mjs         (finds the latest quarterly report and its CSV; keeps a copy in data/raw/rent/)
//
// 株式会社一五不動産情報サービス「物流施設の賃貸マーケットに関する調査」: quarterly since 2008 for four regions —
// 東京圏 (茨城・埼玉・千葉・東京・神奈川), 関西圏 (京都・大阪・兵庫), 中京圏 (岐阜・愛知・三重), 九州圏 (福岡・佐賀):
// leasable / leased / vacant floor area, vacancy rate, completions, net absorption (1,000 ㎡), median asking rent (円/坪).
// Rental logistics facilities of 10,000 ㎡+ (asking rents: listings of 1,000 ㎡+).
// Terms (their FAQ): reprinting is allowed with the source named, except for commercial purposes or parts marked
// 「無断転載を禁じます」 (neither applies: the site is non-commercial and the data carries no such mark).
//   https://www.ichigo-re.co.jp/faq/
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' };
const LIST = 'https://www.ichigo-re.co.jp/report/report-market/';
const REGIONS = [
  { key: 'tokyo', ja: '東京圏', en: 'Greater Tokyo', prefs: [8, 11, 12, 13, 14] },
  { key: 'kansai', ja: '関西圏', en: 'Kansai', prefs: [26, 27, 28] },
  { key: 'chukyo', ja: '中京圏', en: 'Chukyo', prefs: [21, 23, 24] },
  { key: 'kyushu', ja: '九州圏', en: 'Kyushu', prefs: [40, 41] },
];
const text = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); };

// the newest market report is the first 「物流施設の賃貸マーケットに関する調査」 on the list
const list = await text(LIST);
const reports = [...list.matchAll(/href="(https:\/\/www\.ichigo-re\.co\.jp\/report\/report-market\/\d+\/)"/g)].map((m) => m[1]);
let page = null, csvUrl = null, title = '';
for (const url of [...new Set(reports)]) {
  const html = await text(url);
  title = html.match(/<title>([^|<]*)/)?.[1]?.trim() ?? '';
  const csv = html.match(/href="([^"]+_data\.csv)"/)?.[1];
  if (/物流施設の賃貸マーケット/.test(title) && csv) { page = url; csvUrl = csv; break; }
}
if (!csvUrl) throw new Error('no market report with a CSV found');
const buf = Buffer.from(await (await fetch(csvUrl, { headers: UA })).arrayBuffer());
mkdirSync(resolve(root, 'data/raw/rent'), { recursive: true });
writeFileSync(resolve(root, 'data/raw/rent', csvUrl.split('/').pop()), buf);

// Shift_JIS CSV: 6 header rows, then 「2008年7月」 rows; per region 7 columns
const rows = new TextDecoder('shift_jis').decode(buf).split(/\r?\n/).map((l) => {
  const out = []; let cell = '', q = false;
  for (const c of l) { if (c === '"') q = !q; else if (c === ',' && !q) { out.push(cell); cell = ''; } else cell += c; }
  out.push(cell); return out;
});
const num = (s) => { const x = String(s ?? '').replace(/[",\s]/g, ''); return x === '' || x === '-' ? null : Number(x); };
const data = rows.filter((r) => /^\d{4}年\d{1,2}月/.test(r[0]));
const quarters = data.map((r) => { const [, y, m] = r[0].match(/^(\d{4})年(\d{1,2})月/); return `${y}-${m.padStart(2, '0')}`; });
const regions = REGIONS.map((g, k) => {
  const c = 1 + k * 7;
  const col = (j) => data.map((r) => num(r[c + j]));
  return { ...g, leasable: col(0), leased: col(1), vacantArea: col(2), vacancy: col(3), completions: col(4), absorption: col(5), rent: col(6) };
});
const asOf = quarters.at(-1);
const out = {
  source: {
    ja: `株式会社一五不動産情報サービス「${title}」`, en: `Ichigo Real Estate Information Service, logistics rental market survey (${asOf})`,
    url: page, csv: csvUrl, note: { ja: '延床面積または敷地面積1万㎡以上の賃貸物流施設。募集賃料は募集面積1,000㎡以上の事例の中央値（税別、円/坪・月）。', en: 'Rental logistics facilities of 10,000 m²+; asking rent = median of listings of 1,000 m²+ (yen per tsubo a month, before tax).' },
  },
  generated: new Date().toISOString().slice(0, 10),
  quarters,
  regions,
};
writeFileSync(resolve(root, 'public/data/rent.json'), JSON.stringify(out));
for (const g of regions) console.log(`${g.ja}: ${asOf} vacancy ${g.vacancy.at(-1)}%, rent ${g.rent.at(-1)} 円/坪, leasable ${g.leasable.at(-1)} 千㎡ (since ${quarters[g.vacancy.findIndex((v) => v !== null)]})`);
