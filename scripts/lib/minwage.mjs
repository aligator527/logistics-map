// 厚生労働省「地域別最低賃金改定状況」(H14〜 xlsx): per prefecture, the rate of each fiscal year and when the latest took
// effect. Row 0 holds the years; each year has two columns (amount, effective date).
import * as XLSX from 'xlsx';

export const PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];
const num = (v) => (v === '' || v === '-' ? NaN : Number(String(v).replace(/,/g, '')));

export function parseMinWage(buf) {
  const wb = XLSX.read(buf);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const yearRow = rows[0].map(String);
  const cols = yearRow.map((y, j) => (/年度/.test(y) ? j : -1)).filter((j) => j > 0);
  const wage = { years: cols.map((j) => yearRow[j].replace(/\s/g, '')), perPref: [], effective: [] };
  for (const p of PREFS) {
    const r = rows.find((x) => String(x[0]).replace(/\s|　/g, '') === p);
    if (!r) throw new Error(`minimum wage: no row for ${p}`);
    wage.perPref.push(cols.map((j) => num(r[j])));
    const d = r[cols.at(-1) + 1];
    wage.effective.push(typeof d === 'number' ? new Date(Math.round((d - 25569) * 864e5)).toISOString().slice(0, 10) : String(d));
  }
  return wage;
}
