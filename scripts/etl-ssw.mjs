// ETL for 特定技能在留外国人数 (ISA, half-yearly) -> public/data/ssw.json
//
//   node scripts/etl-ssw.mjs
//
// Source page: https://www.moj.go.jp/isa/applications/ssw/nyuukokukanri07_00215.html
// For each period (令和X年Y月末) the page lists 第4〜9表 for 特定技能1号, then for 2号.
// We use 第5表 (地域 × 分野) of both: prefecture rows have 地域コード "NN000".
// Field columns are matched by name — the set changes between periods (自動車運送業 from 2024-12,
// the old name 素形材・産業機械・電気電子情報関連製造業 before 工業製品製造業, 物流倉庫 /
// リネンサプライ / 資源循環 from 2026-04), and headers may contain line breaks.
// Counts are by place of residence (住居地), not place of work; figures are 速報値.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw/ssw');
const OUT = resolve(root, 'public/data/ssw.json');
const BASE = 'https://www.moj.go.jp';
const PAGE = `${BASE}/isa/applications/ssw/nyuukokukanri07_00215.html`;
const UA = { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL)' };
mkdirSync(RAW, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const half = (s) => String(s ?? '').replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s　]+/g, '');

// Field keys in the official order (分野別運用方針, 2026-01-23). `match` finds the column header.
const FIELDS = [
  { key: 'total', ja: '総数', en: 'All fields', match: /^総数/ },
  { key: 'care', ja: '介護', en: 'Nursing care', match: /^介護/ },
  { key: 'cleaning', ja: 'ビルクリーニング', en: 'Building cleaning', match: /^ビルクリ/ },
  { key: 'linen', ja: 'リネンサプライ', en: 'Linen supply', match: /^リネン/ },
  { key: 'manufacturing', ja: '工業製品製造業', en: 'Manufacturing', match: /^(工業製品|素形材)/ },
  { key: 'construction', ja: '建設', en: 'Construction', match: /^建設/ },
  { key: 'shipbuilding', ja: '造船・舶用工業', en: 'Shipbuilding', match: /^造船/ },
  { key: 'carMaintenance', ja: '自動車整備', en: 'Automobile repair', match: /^自動車整備/ },
  { key: 'aviation', ja: '航空', en: 'Aviation', match: /^航空/ },
  { key: 'lodging', ja: '宿泊', en: 'Accommodation', match: /^宿泊/ },
  { key: 'transport', ja: '自動車運送業', en: 'Automobile transport', match: /^自動車運送/, logistics: true },
  { key: 'railway', ja: '鉄道', en: 'Railway', match: /^鉄道/ },
  { key: 'warehouse', ja: '物流倉庫', en: 'Logistics warehousing', match: /^物流倉庫/, logistics: true },
  { key: 'agriculture', ja: '農業', en: 'Agriculture', match: /^農業/ },
  { key: 'fishery', ja: '漁業', en: 'Fishery', match: /^漁業/ },
  { key: 'food', ja: '飲食料品製造業', en: 'Food manufacturing', match: /^飲食料品/ },
  { key: 'restaurant', ja: '外食業', en: 'Food service', match: /^外食/ },
  { key: 'forestry', ja: '林業', en: 'Forestry', match: /^林業/ },
  { key: 'wood', ja: '木材産業', en: 'Wood industry', match: /^木材/ },
  { key: 'recycling', ja: '資源循環', en: 'Resource recycling', match: /^資源循環/ },
];

async function get(url, binary = false) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
    await sleep(1500 * (i + 1));
  }
  throw new Error(`GET ${url} failed`);
}

// ------------------------------------------------------------------ 1) periods and files
const html = await get(PAGE);
writeFileSync(resolve(RAW, 'index.html'), html);
// Walk the page in document order: a 「令和X年Y月末」 heading opens a period; within it the first
// 第5表 link is 1号, the second is 2号.
const tokens = [...html.matchAll(/(令和[0-9０-９元]+年[0-9０-９]+月末)|<a[^>]*href="([^"]+\.xlsx)"[^>]*>([\s\S]*?)<\/a>/g)];
const periods = [];
let cur = null;
for (const t of tokens) {
  if (t[1]) {
    const m = half(t[1]).match(/令和(\d+|元)年(\d+)月末/);
    const y = 2018 + (m[1] === '元' ? 1 : Number(m[1]));
    const id = `${y}-${m[2].padStart(2, '0')}`;
    if (!periods.some((p) => p.id === id)) periods.push((cur = { id, year: y, month: Number(m[2]), files: [] }));
    continue;
  }
  if (cur && /第[5５]表/.test(half(t[3]).replace(/<[^>]+>/g, ''))) cur.files.push(new URL(t[2], BASE).href);
}
const usable = periods.filter((p) => p.files.length >= 1).sort((a, b) => a.id.localeCompare(b.id));
console.log('periods:', usable.map((p) => `${p.id}(${p.files.length})`).join(' '));

// ------------------------------------------------------------------ 2) download + parse
async function load(url) {
  const file = resolve(RAW, url.split('/').pop());
  if (!existsSync(file)) { writeFileSync(file, await get(url, true)); await sleep(600); }
  return XLSX.read(readFileSync(file), { type: 'buffer' });
}
/** strict: all 47 prefectures must be listed (1号); 2号 tables omit prefectures with nobody */
function parse5(wb, id, strict = true) {
  const sheet = wb.SheetNames.find((n) => half(n).startsWith('第5表'));
  if (!sheet) throw new Error(`${id}: 第5表 sheet not found in ${wb.SheetNames}`);
  const a = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
  const h = a.findIndex((r) => half(r[0]) === '地域コード');
  if (h < 0) throw new Error(`${id}: header not found`);
  const head = a[h].map(half);
  const cols = {};
  for (const f of FIELDS) {
    const c = head.findIndex((x, i) => i >= 4 && f.match.test(x));
    if (c >= 0) cols[f.key] = c;
  }
  if (cols.total === undefined) throw new Error(`${id}: 総数 column missing`);
  const pref = {}, japan = {};
  for (const k of Object.keys(cols)) { pref[k] = Array(47).fill(0); japan[k] = 0; }
  let seen = 0;
  for (const r of a.slice(h + 1)) {
    const code = half(r[0]);
    const num = (c) => Number(half(r[c]).replace(/[,-]/g, '')) || 0;
    if (/^\d{2}000$/.test(code)) {
      const i = Number(code.slice(0, 2)) - 1;
      if (i < 0 || i > 46) continue;
      for (const [k, c] of Object.entries(cols)) pref[k][i] = num(c);
      seen++;
    } else if (code === '-' && /総数/.test(half(r[1]))) {
      for (const [k, c] of Object.entries(cols)) japan[k] = num(c);
    }
  }
  if (strict ? seen !== 47 : seen < 1) throw new Error(`${id}: ${seen} prefectures`);
  return { pref, japan, fields: Object.keys(cols) };
}

const out = { periods: [], fields: FIELDS.map(({ key, ja, en, logistics }) => ({ key, ja, en, logistics: !!logistics })), s1: {}, s2: {}, japan1: {}, japan2: {} };
for (const p of usable) {
  const r1 = parse5(await load(p.files[0]), `${p.id} 1号`);
  const r2 = p.files[1] ? parse5(await load(p.files[1]), `${p.id} 2号`, false) : null;
  const pi = out.periods.length;
  out.periods.push({
    id: p.id,
    ja: `${p.year}年${p.month}月末`,
    en: new Date(p.year, p.month - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
    url1: p.files[0], url2: p.files[1] ?? null,
    fields: r1.fields,   // fields published in this period (others are "not yet a field")
  });
  for (const f of FIELDS) {
    (out.s1[f.key] ??= []).push(r1.pref[f.key] ?? null);
    (out.japan1[f.key] ??= []).push(r1.japan[f.key] ?? null);
    (out.s2[f.key] ??= []).push(r2?.pref[f.key] ?? null);
    (out.japan2[f.key] ??= []).push(r2?.japan[f.key] ?? null);
  }
  console.log(`  ${p.id}: 1号 ${r1.japan.total} (自動車運送 ${r1.japan.transport ?? '–'}), 2号 ${r2?.japan.total ?? '–'}`);
}
// drop fields that never appear (e.g. 物流倉庫 before its first published count)
for (const k of Object.keys(out.s1)) {
  if (out.s1[k].every((x) => x === null)) { delete out.s1[k]; delete out.s2[k]; delete out.japan1[k]; delete out.japan2[k]; }
}
out.source = {
  ja: '出入国在留管理庁「特定技能在留外国人数の公表」',
  en: 'Immigration Services Agency, number of Specified Skilled Workers',
  url: PAGE,
  note: {
    ja: '住居地ベースの速報値。物流倉庫は2026年4月に特定技能の対象分野に追加（2027年4月からは育成就労でも受入れ）。公表データにはまだ計上されていません。',
    en: 'Preliminary figures by place of residence. Logistics warehousing became a Specified Skilled Worker field in April 2026 (and an Employment for Skill Development field from April 2027); it has no published counts yet.',
  },
};
out.generated = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT}: ${out.periods.length} periods, fields ${Object.keys(out.s1).join(',')}`);
