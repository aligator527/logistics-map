// Freshness report for the sources that are NOT refreshed automatically.
//
//   node scripts/check-sources.mjs          (prints Markdown; also appends to $GITHUB_STEP_SUMMARY)
//
// The weekly job refreshes 倉庫統計季報 / 特定技能 / 有効求人倍率 by itself. Everything below needs
// a manual step (new file IDs, heavy downloads, a browser for Daiwa House), so this script only
// tells whether something new has appeared. It never fails the build: a check that cannot reach
// its site is reported as "unknown".
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'Mozilla/5.0 (logistics-map source check)' };
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: UA, redirect: 'follow' });
    // the site answers missing files with an HTML page: only a real zip counts
    return r.ok && /zip/.test(r.headers.get('content-type') ?? '');
  } catch { return null; }
}
async function text(url) {
  try {
    const r = await fetch(url, { headers: UA });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

const rows = [];
const add = (source, state, note) => rows.push({ source, state, note });

// 物流センサス: results of the 12th survey (fieldwork Oct 2025)
{
  const have = read('public/data/census/index.json').years.map((y) => y.year);
  const page = await text('https://www.mlit.go.jp/statistics/details/t-other-2_tk_000196.html');
  const next = page && /第12回|2025年調査|令和7年調査/.test(page);
  add('物流センサス', page === null ? 'unknown' : next ? 'NEW' : 'ok',
    `have ${have.join(', ')}; ${next ? 'the results page mentions the 12th survey — add it to scripts/etl-census.mjs ROUNDS' : 'no 12th-survey results yet'}`);
}

// 水害統計 表-2: a newer survey year than data/risk/suigai.json
{
  const last = Math.max(...read('data/risk/suigai.json').years.map((y) => y.year));
  const page = await text('https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00600590&layout=datalist');
  const reiwa = (y) => `令和${y - 2018}年`;
  const next = page && page.includes(reiwa(last + 1)) && page.includes('都道府県別水害被害');
  add('水害統計', page === null ? 'unknown' : next ? 'CHECK' : 'ok',
    `have up to ${last}; ${next ? `${reiwa(last + 1)} appears on e-Stat — if 表-2 is out, add its statInfId to scripts/etl-suigai.mjs` : 'no newer year listed'}`);
}

// 国土数値情報: land prices (yearly), expressways (yearly), boundaries (yearly, 1 Jan)
const y = new Date().getFullYear();
for (const [name, have, url] of [
  ['地価公示 L01', 2026, (n) => `https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-${String(n).slice(2)}/L01-${String(n).slice(2)}_GML.zip`],
  ['地価調査 L02', 2026, (n) => `https://nlftp.mlit.go.jp/ksj/gml/data/L02/L02-${String(n).slice(2)}/L02-${String(n).slice(2)}_GML.zip`],
  ['高速道路 N06', 2025, (n) => `https://nlftp.mlit.go.jp/ksj/gml/data/N06/N06-${String(n).slice(2)}/N06-${String(n).slice(2)}_GML.zip`],
  ['行政区域 N03', 2026, (n) => `https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-${n}/N03-${n}0101_GML.zip`],
  // 用途地域 (npm run zoning), the 1 km population grid (etl:mesh → etl:hazard, etl:muni, network)
  ['用途地域 A29', 2019, (n) => `https://nlftp.mlit.go.jp/ksj/gml/data/A29/A29-${String(n).slice(2)}/A29-${String(n).slice(2)}_13_GML.zip`],
  ['1kmメッシュ将来推計人口', 2024, (n) => `https://nlftp.mlit.go.jp/ksj/gml/data/m1kr6/m1kr6-${String(n).slice(2)}/1km_mesh_${n}_SHP.zip`],
]) {
  let newest = null, unknown = false;
  for (let n = have + 1; n <= y + 1; n++) {
    const ok = await exists(url(n));
    if (ok === null) unknown = true;
    if (ok) newest = n;
  }
  add(name, unknown && !newest ? 'unknown' : newest ? 'NEW' : 'ok', `have ${have}${newest ? `; ${newest} is published` : ''}`);
}

// demand and cost inputs (etl-demand): yearly releases with new file names
{
  const tax = await text('https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/ichiran09_26.html');
  add('課税対象所得（市町村税課税状況等の調）', tax === null ? 'ok' : 'NEW', tax ? '令和8年度 is published — download 市町村別内訳 第11表 into data/raw/demand/ and update etl-demand' : 'have 令和7年度');
  // the 総務省 pages are Shift_JIS
  const juki = await fetch('https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html', { headers: UA })
    .then(async (r) => (r.ok ? new TextDecoder('shift_jis').decode(await r.arrayBuffer()) : null)).catch(() => null);
  const r9 = !!juki && juki.includes('令和9年');
  add('世帯数・人口動態（住民基本台帳）', juki === null ? 'unknown' : r9 ? 'NEW' : 'ok', r9 ? '令和9年 is published' : 'have 令和8年1月1日');
  const mw = await text('https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/');
  add('地域別最低賃金', mw === null ? 'unknown' : /令和８年度|令和8年度/.test(mw) ? 'NEW' : 'ok', 'have 令和7年度 (data/raw/wage/mw.xlsx)');
}

// hazard-zone shares (ハザードマップポータル tiles, updated continuously): re-sample once a year
{
  const m = read('public/data/muni.json');
  const when = m.sources?.hazard?.ja?.match(/(\d{4}-\d{2}-\d{2})取得/)?.[1];
  const age = when ? Math.round((Date.now() - Date.parse(when)) / 864e5) : null;
  add('浸水・土砂 想定区域の人口割合', age === null ? 'unknown' : age > 365 ? 'CHECK' : 'ok',
    age === null ? 'no date' : `tiles sampled ${when} (${age} days ago)${age > 365 ? ' — npm run etl:hazard && npm run etl:muni' : ''}`);
}

// J-SHIS: a newer hazard-map version than Y2024
{
  const probe = async (v) => {
    try {
      const r = await fetch(`https://www.j-shis.bosai.go.jp/map/api/pshm/${v}/AVR/TTL_MTTL/meshinfo.geojson?position=139.6917,35.6895&epsg=4326&attr=T30_I55_PS`, { headers: UA });
      if (r.status >= 400 && r.status < 500) return false; // unknown version
      return r.ok ? /"status":"Success"/.test(await r.text()) : null;
    } catch { return null; }
  };
  const v = await probe(`Y${y - 1}`) || await probe(`Y${y}`);
  add('J-SHIS', v === null ? 'unknown' : v ? 'NEW' : 'ok', v ? 'a newer version answers — update the version in scripts/etl-risk.mjs and etl-muni.mjs' : 'Y2024 is the latest');
}

// Daiwa House DPL snapshot (manual, from a browser)
{
  const s = read('data/dpl/snapshot.json');
  const age = Math.round((Date.now() - new Date(s.retrieved).getTime()) / 864e5);
  add('DPL (Daiwa House)', age > 90 ? 'CHECK' : 'ok', `snapshot retrieved ${s.retrieved} (${age} days ago); list updated ${s.updated}`);
}

// automatic ones: show what the data currently covers
{
  const w = read('public/data/warehouse.json'), s = read('public/data/ssw.json'), j = read('public/data/jobs.json');
  add('倉庫統計季報 (auto)', 'ok', `latest ${w.quarters.at(-1).id}, published ${w.quarters.at(-1).published}`);
  add('特定技能 (auto)', 'ok', `latest ${s.periods.at(-1).id}; fields: ${Object.keys(s.s1).includes('warehouse') ? '物流倉庫 is counted' : '物流倉庫 not counted yet'}`);
  add('有効求人倍率 (auto)', 'ok', `latest FY${j.periods.at(-1).id}`);
  const d = read('public/data/diesel.json');
  const age = Math.round((Date.now() - new Date(d.dates.at(-1)).getTime()) / 864e5);
  add('軽油価格 (auto)', age > 16 ? 'CHECK' : 'ok', `latest week ${d.dates.at(-1)} (${age} days ago)${age > 16 ? ' — the site may be blocking automated downloads (AWS WAF); save the latest …s5.xlsx from a browser into data/raw/diesel/' : ''}`);
}

// 大型車誘導区間 通行条件マップ (PDF, linked from the site memo): a new edition changes the file names.
// The server still needs legacy TLS renegotiation, which Node's fetch refuses: curl with a one-off OpenSSL setting.
{
  const have = readFileSync(resolve(root, 'src/lib/karte.ts'), 'utf8').match(/_oogatasya_map_(\d{6})\.pdf/)?.[1];
  let page = null;
  try {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const cnf = resolve(mkdtempSync(resolve(tmpdir(), 'ossl-')), 'openssl.cnf');
    writeFileSync(cnf, 'openssl_conf = i\n[i]\nssl_conf = s\n[s]\nsystem_default = d\n[d]\nOptions = UnsafeLegacyRenegotiation\n');
    page = execFileSync('curl', ['-s', '-m', '30', 'https://www.tokusya.ktr.mlit.go.jp/PR/download/oogatasya_map.html'], { env: { ...process.env, OPENSSL_CONF: cnf } }).toString();
  } catch { page = null; }
  const now = page?.match(/_oogatasya_map_(\d{6})\.pdf/)?.[1];
  add('大型車誘導区間マップ', !page || !now ? 'unknown' : now !== have ? 'NEW' : 'ok',
    now && now !== have ? `edition ${now} is out (links use ${have}): update OOGATA links in src/lib/karte.ts` : `edition ${have}`);
}

const md = ['### Data sources', '', '| source | state | note |', '|---|---|---|',
  ...rows.map((r) => `| ${r.source} | ${r.state === 'ok' ? 'ok' : `**${r.state}**`} | ${r.note} |`)].join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
