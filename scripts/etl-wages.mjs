// Actual pay in logistics jobs per prefecture -> public/data/muni.json (`wageOcc`), used by the cost estimate:
//
//   node scripts/etl-wages.mjs
//
// data/raw/wage/wss_000040421195–98.xlsx  令和7年賃金構造基本統計調査 一般労働者 都道府県別 第3表 (職種特掲, 産業計, 10人以上)
// data/raw/wage/wss_000040420946–50.xlsx  同 短時間労働者 都道府県別 第1表 (1時間当たり所定内給与額, 産業大分類)
//   https://www.e-stat.go.jp/stat-search/files?toukei=00450091&tstat=000001011429
// Per prefecture and occupation (男女計): monthly pay incl. overtime (きまって支給する現金給与額), annual bonus, hours;
// an all-in hourly cost = (monthly × 12 + bonus) ÷ ((scheduled + overtime hours) × 12). Part-time: hourly pay in
// Ｈ 運輸業，郵便業. The survey is a sample of establishments with 10+ workers: small prefectures are noisy.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/wage');
const OCC = [
  { key: 'truckL', label: '営業用大型貨物自動車運転者', ja: '大型トラック運転者', en: 'Large-truck drivers' },
  { key: 'truck', label: '営業用貨物自動車運転者（大型車を除く）', ja: 'トラック運転者（大型以外）', en: 'Truck drivers (other than large)' },
  { key: 'handling', label: 'その他の運搬従事者', ja: '倉庫・荷役・運搬作業者', en: 'Warehouse and handling workers' },
];
const num = (v) => { const x = Number(String(v).replace(/,/g, '')); return String(v).trim() === '' || String(v).trim() === '-' || !isFinite(x) ? NaN : x; };
const norm = (s) => String(s).normalize('NFKC').replace(/\s/g, '');
const prefOf = (s) => { const m = norm(s).match(/^(\d\d)/); return m ? Number(m[1]) : 0; };

// ------------------------------------------------------------------ full-time, by occupation
const perPref = Array.from({ length: 47 }, () => ({}));
for (const id of ['000040421195', '000040421196', '000040421197', '000040421198']) {
  const wb = XLSX.read(readFileSync(resolve(RAW, `wss_${id}.xlsx`)));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const head = rows[5];
  // blocks of 8 columns: 年齢, 勤続年数, 所定内時間, 超過時間, きまって支給額, 所定内給与額, 年間賞与, 労働者数
  const blocks = head.map((h, j) => [prefOf(h), j]).filter(([p]) => p >= 1 && p <= 47);
  for (const o of OCC) {
    // the first row of an occupation is 男女計 (男, 女 follow further down)
    const r = rows.find((x) => norm(x[0]).endsWith(norm(o.label)));
    if (!r) throw new Error(`${id}: no row for ${o.label}`);
    for (const [p, j] of blocks) {
      const [age, , hBase, hOver, monthly, base, bonus, workers] = r.slice(j, j + 8).map(num);
      const hourly = isFinite(monthly) && isFinite(hBase) ? Math.round(((monthly * 12 + (isFinite(bonus) ? bonus : 0)) * 1000) / ((hBase + (isFinite(hOver) ? hOver : 0)) * 12)) : null;
      perPref[p - 1][o.key] = { monthly: isFinite(monthly) ? monthly : null, base: isFinite(base) ? base : null, bonus: isFinite(bonus) ? bonus : null,
        hours: isFinite(hBase) ? hBase + (isFinite(hOver) ? hOver : 0) : null, age: isFinite(age) ? age : null, workers: isFinite(workers) ? workers * 10 : null, hourly };
    }
  }
}

// ------------------------------------------------------------------ part-time, 運輸業 hourly pay
const PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];
const partTime = Array(47).fill(null);
for (const id of ['000040420946', '000040420947', '000040420948', '000040420949', '000040420950']) {
  const wb = XLSX.read(readFileSync(resolve(RAW, `wss_${id}.xlsx`)));
  for (const name of wb.SheetNames) {
    // sheet names are 北海道 … 京都 … 沖縄 (with or without 都・府・県); 京都 itself ends in 都
    const n = norm(name), p = PREFS.includes(n) ? PREFS.indexOf(n) : PREFS.indexOf(n.replace(/[都府県]$/, ''));
    if (p < 0) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const r = rows.find((x) => norm(x[1]) === 'H');
    // 男女計 block: columns 3–7 (年齢, 勤続, 日数, 1日の時間, 1時間当たり所定内給与額)
    if (r) partTime[p] = num(r[7]) || null;
  }
}

const out = JSON.parse(readFileSync(resolve(root, 'public/data/muni.json'), 'utf8'));
out.wageOcc = {
  year: 2025,
  occupations: OCC.map(({ key, ja, en }) => ({ key, ja, en })),
  perPref,
  partTimeTransport: partTime,
};
out.sources.wageOcc = { ja: '令和7年賃金構造基本統計調査（厚生労働省）一般労働者 都道府県別第3表・短時間労働者 都道府県別第1表を加工して作成', en: 'MHLW Basic Survey on Wage Structure 2025 (prefecture tables), processed', url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00450091&tstat=000001011429' };
writeFileSync(resolve(root, 'public/data/muni.json'), JSON.stringify(out));
for (const p of [1, 13, 23, 47]) console.log(PREFS[p - 1], OCC.map((o) => `${o.key} ${perPref[p - 1][o.key]?.hourly}円/h`).join(', '), `part-time 運輸 ${partTime[p - 1]}円/h`);
console.log(`missing part-time: ${partTime.map((v, i) => (v ? '' : PREFS[i])).filter(Boolean).join(' ') || 'none'}`);
