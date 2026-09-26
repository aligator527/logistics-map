// ETL for 倉庫統計季報 (MLIT quarterly warehouse statistics) -> public/data/warehouse.json
//
//   node scripts/etl-warehouse.mjs [--refresh]
//
// 1. Reads the index page and lists every quarterly .xls (FY2010 Q1 onwards).
// 2. Downloads the files that are not cached in data/raw/ yet (--refresh re-reads the index only;
//    a revised file gets a new URL on the MLIT site, so it is picked up as a new download).
// 3. Parses, for 普通倉庫 1〜3類 by prefecture:
//      sheet 「１．倉庫利用状況」            所管面積 / 在貨面積 / 空面積 (千㎡, as of the quarter)
//      sheet 「２．普通倉庫　県別入庫・残高」 入庫高 (千トン, summed over the 3 months)
//                                            保管残高 (千トン, end of the quarter's last month)
//    Columns are located by their headers, not by position: the layout shifts between issues.
// 4. Checks that the 47 prefectures add up to the 合計 row and writes one JSON file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { writeJson } from './lib/io.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw');
const OUT = resolve(root, 'public/data/warehouse.json');
const BASE = 'https://www.mlit.go.jp';
const INDEX = `${BASE}/seisakutokatsu/freight/seisakutokatsu_freight_mn2_000007_2.html`;
const UA = { 'User-Agent': 'Mozilla/5.0 (logistics-map ETL; +https://github.com/aligator527)' };
mkdirSync(RAW, { recursive: true });

// ------------------------------------------------------------------ helpers
const half = (s) => String(s ?? '')
  .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  .replace(/元/g, '1')
  .replace(/[\s　]+/g, '');
const ERA = { 平成: 1988, 令和: 2018 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 「第１四半期（令和７年４月～６月）号」 -> calendar quarter of the first month */
function parseLabel(text) {
  const m = half(text).match(/第(\d)四半期\((平成|令和)(\d+)年(\d+)月[~〜-](\d+)月/);
  if (!m) return null;
  const year = ERA[m[2]] + Number(m[3]);
  const month = Number(m[4]);
  const q = Math.floor((month - 1) / 3) + 1;
  // fiscal year starts in April: Apr–Jun = FY Q1
  const fyQ = Number(m[1]);
  const fy = month >= 4 ? year : year - 1;
  return { id: `${year}-Q${q}`, year, q, month, fy, fyQ };
}

async function get(url, binary = false) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
    await sleep(1500 * (i + 1));
  }
  throw new Error(`GET ${url} failed`);
}

// ------------------------------------------------------------------ 1) index
const html = await get(INDEX);
writeFileSync(resolve(RAW, 'index.html'), html);
const issues = [];
for (const m of html.matchAll(/<a[^>]*href="([^"]+\.xlsx?)"[^>]*>([^<]+)/g)) {
  const q = parseLabel(m[2]);
  if (!q) { console.warn('skip link:', m[2]); continue; }
  issues.push({ ...q, url: new URL(m[1], BASE).href, label: m[2].replace(/&nbsp;|\s+$/g, '') });
}
issues.sort((a, b) => a.year - b.year || a.q - b.q);
console.log(`index: ${issues.length} issues, ${issues[0].id} … ${issues.at(-1).id}`);

// ------------------------------------------------------------------ 2) download
for (const it of issues) {
  it.file = resolve(RAW, `${it.id}_${it.url.split('/').pop()}`);
  if (existsSync(it.file)) continue;
  process.stdout.write(`download ${it.id} … `);
  writeFileSync(it.file, await get(it.url, true));
  console.log('ok');
  await sleep(800); // be polite to mlit.go.jp
}

// ------------------------------------------------------------------ 3) parse
const rows = (wb, prefix) => {
  const name = wb.SheetNames.find((n) => half(n).startsWith(prefix));
  if (!name) throw new Error(`sheet ${prefix} not found`);
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: true });
};
const num = (v) => {
  if (typeof v === 'number') return v;
  const s = half(v).replace(/,/g, '');
  if (s === '' || s === '-' || s === '―' || s === '－') return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`not a number: ${JSON.stringify(v)}`);
  return n;
};
/** index of the column holding the area / prefecture label, and the row of 合計 */
function locateTable(a, from = 0) {
  for (let r = from; r < a.length; r++) {
    const c = a[r].findIndex((v) => half(v) === '合計');
    if (c >= 0) return { r, c };
  }
  return null;
}
/** 47 prefecture rows following the 合計 row; code is in the column left of the label */
function prefRows(a, t) {
  const out = [];
  for (let r = t.r + 1; r < a.length && out.length < 47; r++) {
    const code = Number(half(a[r][t.c - 1]));
    if (code === out.length + 1) out.push(a[r]);
    else if (half(a[r][t.c]) !== '') throw new Error(`row ${r}: unexpected "${a[r][t.c]}"`);
  }
  if (out.length !== 47) throw new Error(`found ${out.length} prefectures`);
  return out;
}
const notes = [];
/** Returns the national total to use: the published 合計, or the prefecture sum when 合計 is
 *  evidently wrong (2010-Q2 所管面積 says 39,413 while prefectures add up to 41,661, in line
 *  with the neighbouring quarters). */
function checkSum(what, total, parts, id) {
  const s = parts.reduce((x, y) => x + y, 0);
  // figures are rounded to 千; allow ±1 per prefecture
  if (Math.abs(s - total) <= 47) return total;
  console.warn(`  ! ${id} ${what}: sum ${s} vs 合計 ${total} -> using the sum`);
  notes.push({ quarter: id, metric: what, published: total, used: s });
  return s;
}

function parseUsage(wb, it) {
  const a = rows(wb, '1.');
  const t = locateTable(a);
  // header check: the 1〜3類 block is 所管面積 / 在貨面積 / 自家面積 / 空面積
  const head = a.slice(0, t.r).map((r) => r.slice(t.c + 1, t.c + 5).map(half).join('|')).join('\n');
  if (!/所管面積\|在貨面積\|自家面積\|空面積/.test(head)) throw new Error(`${it.id}: usage header not found`);
  if (!/1[~〜]3類倉庫/.test(half(a.slice(0, t.r).flat().join('')))) throw new Error(`${it.id}: 1～3類 not found`);
  const p = prefRows(a, t);
  const col = (k) => p.map((r) => num(r[t.c + 1 + k]));
  const res = { area: col(0), used: col(1), own: col(2), empty: col(3) };
  const tot = a[t.r];
  return { ...res, total: {
    area: checkSum('area', num(tot[t.c + 1]), res.area, it.id),
    used: checkSum('used', num(tot[t.c + 2]), res.used, it.id),
    own: checkSum('own', num(tot[t.c + 3]), res.own, it.id),
    empty: checkSum('empty', num(tot[t.c + 4]), res.empty, it.id),
  } };
}

function parseFlows(wb, it) {
  const a = rows(wb, '2.');
  const blocks = [];
  for (let r = 0; r < a.length; r++) {
    const s = half(a[r].join(''));
    const m = s.match(/(平成|令和)(\d+)年+(\d+)月分/); // 2019-Q2 has a typo 「令和元年年４月分」
    if (!m) continue;
    const t = locateTable(a, r);
    // 1〜3類: first 入庫 / 残高 pair right of the label
    const hdr = a.slice(r, t.r).map((x) => half(x[t.c + 1]) + '|' + half(x[t.c + 2])).join(' ');
    if (!/入庫/.test(hdr) || !/残高/.test(hdr)) throw new Error(`${it.id}: flow header not found near row ${r}`);
    const p = prefRows(a, t);
    const inbound = p.map((x) => num(x[t.c + 1]));
    const stock = p.map((x) => num(x[t.c + 2]));
    blocks.push({ month: Number(m[3]), inbound, stock, total: {
      inbound: checkSum(`inbound(${m[3]})`, num(a[t.r][t.c + 1]), inbound, it.id),
      stock: checkSum(`stock(${m[3]})`, num(a[t.r][t.c + 2]), stock, it.id),
    } });
    r = t.r + 47;
  }
  if (blocks.length !== 3) throw new Error(`${it.id}: ${blocks.length} monthly blocks`);
  const sum = (k) => blocks[0][k].map((_, i) => blocks.reduce((s, b) => s + b[k][i], 0));
  return {
    inbound: sum('inbound'),
    stock: blocks[2].stock,
    total: { inbound: blocks.reduce((s, b) => s + b.total.inbound, 0), stock: blocks[2].total.stock },
  };
}

function parsePublished(wb) {
  const name = wb.SheetNames.find((n) => n.includes('裏'));
  if (!name) return null;
  const s = half(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }).flat().join(' '));
  const m = s.match(/(平成|令和)(\d+)年(\d+)月(\d+)日発行/);
  if (!m) return null;
  const y = ERA[m[1]] + Number(m[2]);
  return `${y}-${String(m[3]).padStart(2, '0')}-${String(m[4]).padStart(2, '0')}`;
}

const quarters = [];
const M = { area: [], used: [], empty: [], inbound: [], stock: [] };
const T = { area: [], used: [], empty: [], inbound: [], stock: [] };
for (const it of issues) {
  const wb = XLSX.read(readFileSync(it.file), { type: 'buffer' });
  const u = parseUsage(wb, it);
  const f = parseFlows(wb, it);
  const [m0, m2] = [it.month, it.month + 2];
  quarters.push({
    id: it.id,
    ja: `${it.year}年${m0}〜${m2}月`,
    en: `${['Jan', 'Apr', 'Jul', 'Oct'][it.q - 1]}–${['Mar', 'Jun', 'Sep', 'Dec'][it.q - 1]} ${it.year}`,
    fy: `${it.fy}年度第${it.fyQ}四半期`,
    published: parsePublished(wb),
    url: it.url,
  });
  M.area.push(u.area); M.used.push(u.used); M.empty.push(u.empty);
  M.inbound.push(f.inbound); M.stock.push(f.stock);
  T.area.push(u.total.area); T.used.push(u.total.used); T.empty.push(u.total.empty);
  T.inbound.push(f.total.inbound); T.stock.push(f.total.stock);
}

// ------------------------------------------------------------------ 4) write
const out = {
  source: {
    ja: '国土交通省「倉庫統計季報」',
    en: 'MLIT, Quarterly Warehouse Statistics (倉庫統計季報)',
    url: INDEX,
    scope: {
      ja: '営業倉庫のうち普通倉庫１〜３類。面積は各四半期末、入庫高は四半期の3か月合計、保管残高は四半期末月の月末値。',
      en: 'Commercial warehouses, ordinary warehouses class 1–3. Floor area as of each quarter; inbound = sum of the three months; stock = end of the quarter’s last month.',
    },
  },
  generated: new Date().toISOString().slice(0, 10),
  units: { area: '千㎡', used: '千㎡', empty: '千㎡', inbound: '千トン', stock: '千トン' },
  quarters,
  prefs: M,   // [quarter][pref 0..46]
  japan: T,   // [quarter]
  notes,      // national totals replaced by the prefecture sum
};
mkdirSync(dirname(OUT), { recursive: true });
writeJson(OUT, out);
const last = quarters.at(-1);
console.log(`wrote ${OUT}: ${quarters.length} quarters (${quarters[0].id} … ${last.id}, published ${last.published})`);
