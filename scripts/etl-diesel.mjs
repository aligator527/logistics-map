// Weekly diesel (軽油) retail price by prefecture -> public/data/diesel.json
//
//   node scripts/etl-diesel.mjs
//
// 資源エネルギー庁「石油製品価格調査」 (METI, weekly, published on Wednesdays except holidays):
// https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html
// The page answers 403 without a browser User-Agent. The file name is not guessed (release days
// move around holidays): the latest 「…s5.xlsx」 (full history) is taken from the page. Sheet 「軽油」:
// column 1 = survey date (Excel serial), then 全国 and one column per area; Hokkaido is 「北海道局」
// and regional 「〇〇局」 columns are mixed in. We keep the last 104 weeks (¥/L incl. tax).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { writeJson } from './lib/io.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/diesel');
mkdirSync(RAW, { recursive: true });
const PAGE = 'https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html';
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36' };
const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');
const PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟',
  '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根',
  '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];
const WEEKS = 104;

// The site sits behind AWS WAF, which may answer automated requests with a JavaScript challenge
// (HTTP 202). We do not try to get around it: one plain request; if it is challenged, the newest
// file already in data/raw/diesel is used (or the previous output is kept) and the run succeeds.
let buf = null, url = null;
try {
  const r = await fetch(PAGE, { headers: UA });
  const html = r.status === 200 ? await r.text() : '';
  const link = [...html.matchAll(/href="([^"]*?(\d{6})s5\.xlsx)"/g)].map((m) => ({ href: m[1], d: m[2] })).sort((a, b) => b.d.localeCompare(a.d))[0];
  if (link) {
    url = new URL(link.href, PAGE).href;
    const f = await fetch(url, { headers: UA });
    if (f.status === 200) { buf = Buffer.from(await f.arrayBuffer()); writeFileSync(resolve(RAW, `${link.d}s5.xlsx`), buf); }
  }
  if (!buf) console.warn(`diesel: the site did not serve the file (HTTP ${r.status}; WAF challenge?) — using the cached file`);
} catch (e) {
  console.warn(`diesel: ${e.message} — using the cached file`);
}
if (!buf) {
  const cached = existsSync(RAW) ? readdirSync(RAW).filter((f) => /^\d{6}s5\.xlsx$/.test(f)).sort().at(-1) : null;
  if (!cached) { console.warn('diesel: no cached file either — keeping public/data/diesel.json as it is'); process.exit(0); }
  buf = readFileSync(resolve(RAW, cached));
  url = `https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/xlsx/${cached}`;
}

const wb = XLSX.read(buf, { type: 'buffer', sheets: '軽油' });
const a = XLSX.utils.sheet_to_json(wb.Sheets['軽油'], { header: 1, defval: '' });
const head = a[0].map(norm);
const col = (p) => head.findIndex((h) => h === p || h === `${p}局` || h === `${p}県` || h === `${p}府` || h === `${p}都`);
const cols = PREFS.map(col);
const cJapan = head.indexOf('全国');
if (cols.some((c) => c < 0) || cJapan < 0) throw new Error(`diesel: columns not found: ${PREFS.filter((_, i) => cols[i] < 0)}`);
const rows = a.filter((x) => typeof x[1] === 'number' && x[1] > 30000 && Number.isFinite(Number(x[cJapan])) && x[cJapan] !== '').slice(-WEEKS);
const iso = (serial) => new Date(Date.UTC(1899, 11, 30) + serial * 864e5).toISOString().slice(0, 10);
const num = (v) => (v === '' || v === null ? null : Math.round(Number(v) * 10) / 10);
const out = {
  dates: rows.map((x) => iso(x[1])),
  japan: rows.map((x) => num(x[cJapan])),
  prefs: rows.map((x) => cols.map((c) => num(x[c]))),
  source: { ja: '資源エネルギー庁「石油製品価格調査」（軽油・現金価格、消費税込み）', en: 'Agency for Natural Resources and Energy, weekly petroleum price survey (diesel, cash, incl. tax)', url: PAGE, file: url },
  generated: new Date().toISOString().slice(0, 10),
};
writeJson(resolve(root, 'public/data/diesel.json'), out);
const last = rows.length - 1;
console.log(`diesel.json: ${rows.length} weeks ${out.dates[0]} … ${out.dates[last]}; 全国 ${out.japan[last]}, 東京 ${out.prefs[last][12]}, 埼玉 ${out.prefs[last][10]}, 愛知 ${out.prefs[last][22]}`);
