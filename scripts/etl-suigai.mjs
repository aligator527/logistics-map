// Flood damage by prefecture (MLIT 水害統計調査, 表-2 都道府県別水害被害) -> data/risk/suigai.json
//
//   node scripts/etl-suigai.mjs
//
// One file per survey year on e-Stat (toukei 00600590). Same layout since 2014: sheet 「hyo2」,
// prefecture name in column 0, 合計 (百万円) in column 31; regional subtotals and 全国 are mixed in.
// 2014 is .xls with short padded names (「東　京」). Add a year: append its statInfId below
// (file list: https://www.e-stat.go.jp/stat-search/files?toukei=00600590, title 「都道府県別水害被害（表…」).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/suigai');
mkdirSync(RAW, { recursive: true });
const IDS = {
  2014: '000031842841', 2015: '000032224555', 2016: '000032224663', 2017: '000032224439', 2018: '000032223718',
  2019: '000032222660', 2020: '000032217684', 2021: '000040171169', 2022: '000040197777', 2023: '000040302337',
};
const PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟',
  '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根',
  '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];
const nameOf = (v) => {
  const s = String(v ?? '').normalize('NFKC').replace(/\s+/g, '');
  // 2014 has no suffixes (「京　都」 must stay 京都); later years have 東京都 / 京都府 / 埼玉県
  return s === '京都' || s === '北海道' ? s : s.replace(/(都|府|県)$/, '');
};

const years = [];
for (const [year, id] of Object.entries(IDS)) {
  const file = resolve(RAW, `${year}.xls`);
  if (!existsSync(file)) {
    const r = await fetch(`https://www.e-stat.go.jp/stat-search/file-download?statInfId=${id}&fileKind=0`, { headers: { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' } });
    if (!r.ok) throw new Error(`${year}: ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
  const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.find((n) => /hyo0?2/i.test(n)) ?? wb.SheetNames[0]], { header: 1, defval: null });
  if (!/合計/.test(String(a[4]?.[31] ?? '') + String(a[3]?.[31] ?? '') + String(a[5]?.[31] ?? ''))) console.warn(`  ! ${year}: column 31 header is not 合計`);
  const total = Array(47).fill(NaN);
  for (const r of a.slice(6)) {
    const i = PREFS.indexOf(nameOf(r[0]));
    if (i >= 0 && Number.isNaN(total[i])) total[i] = Number(r[31]) || 0;
  }
  const miss = total.map((v, i) => (Number.isNaN(v) ? PREFS[i] : null)).filter(Boolean);
  if (miss.length) throw new Error(`${year}: missing ${miss.join(',')}`);
  years.push({ year: Number(year), statInfId: id, total: total.map((v) => Math.round(v * 10) / 10) });
  console.log(`  ${year}: 東京 ${total[12]} 埼玉 ${total[10]} 愛知 ${total[22]} (Σ ${Math.round(total.reduce((s, v) => s + v, 0))})`);
}
writeFileSync(resolve(root, 'data/risk/suigai.json'), JSON.stringify({ unit: '百万円', years }, null, 1));
console.log(`wrote data/risk/suigai.json: ${years.length} years`);
