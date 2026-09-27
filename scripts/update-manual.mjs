// Updates for sources that change a few times a year and need no heavy rebuild — run weekly by
// .github/workflows/update-manual.yml, which puts any change on a branch and opens an issue to review it:
//
//   node scripts/update-manual.mjs          (prints a JSON summary; edits files only when something is new)
//
//   最低賃金      MHLW 地域別最低賃金改定状況 (xlsx linked from the 一覧 page): a new fiscal year -> public/data/muni.json `wage`
//   大型車誘導区間 condition maps (PDF, linked from the site memo): a new edition -> the file names in src/lib/karte.ts
//   物流施設の賃貸市場 (一五不動産, quarterly): a new quarter -> public/data/rent.json (scripts/etl-rent.mjs)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMinWage } from './lib/minwage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'Mozilla/5.0 (logistics-map update)' };
const changes = [];

// ------------------------------------------------------------------ 最低賃金
try {
  const PAGE = 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/';
  const html = await (await fetch(PAGE, { headers: UA })).text();
  // <a href="/content/…/….xlsx">平成14年度から令和X年度までの地域別最低賃金改定状況</a>
  const m = [...html.matchAll(/<a[^>]+href="([^"]+\.xlsx)"[^>]*>([^<]*地域別最低賃金改定状況[^<]*)<\/a>/g)][0];
  if (!m) throw new Error('xlsx link not found on the 一覧 page');
  const url = new URL(m[1], PAGE).toString();
  const muni = JSON.parse(readFileSync(resolve(root, 'public/data/muni.json'), 'utf8'));
  const buf = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
  const wage = parseMinWage(buf);
  if (wage.years.at(-1) !== muni.wage.years.at(-1) && wage.years.length > muni.wage.years.length) {
    mkdirSync(resolve(root, 'data/raw/wage'), { recursive: true });
    writeFileSync(resolve(root, 'data/raw/wage/mw.xlsx'), buf);
    muni.wage = wage;
    muni.sources.wage = { ja: `厚生労働省 地域別最低賃金（${wage.years.at(-1)}）`, en: `MHLW regional minimum wages (${wage.years.at(-1)})`, url: PAGE };
    writeFileSync(resolve(root, 'public/data/muni.json'), JSON.stringify(muni));
    changes.push({ source: '最低賃金', from: muni.wage.years.at(-2), to: wage.years.at(-1), note: `東京 ${wage.perPref[12].at(-1)}円, ${url}` });
  }
} catch (e) { changes.push({ source: '最低賃金', error: String(e.message ?? e) }); }

// ------------------------------------------------------------------ 大型車誘導区間 通行条件マップ
try {
  // the server still needs legacy TLS renegotiation, which Node's fetch refuses
  const cnf = resolve(mkdtempSync(resolve(tmpdir(), 'ossl-')), 'openssl.cnf');
  writeFileSync(cnf, 'openssl_conf = i\n[i]\nssl_conf = s\n[s]\nsystem_default = d\n[d]\nOptions = UnsafeLegacyRenegotiation\n');
  const page = execFileSync('curl', ['-s', '-m', '30', 'https://www.tokusya.ktr.mlit.go.jp/PR/download/oogatasya_map.html'], { env: { ...process.env, OPENSSL_CONF: cnf } }).toString();
  const now = page.match(/_oogatasya_map_(\d{6})\.pdf/)?.[1];
  const file = resolve(root, 'src/lib/karte.ts');
  const src = readFileSync(file, 'utf8'), have = src.match(/_oogatasya_map_(\d{6})\.pdf/)?.[1];
  if (!now) throw new Error('edition not found on the page');
  if (now !== have) {
    writeFileSync(file, src.replaceAll(`_oogatasya_map_${have}.pdf`, `_oogatasya_map_${now}.pdf`));
    changes.push({ source: '大型車誘導区間マップ', from: have, to: now });
  }
} catch (e) { changes.push({ source: '大型車誘導区間マップ', error: String(e.message ?? e) }); }

// ------------------------------------------------------------------ 物流施設の賃貸市場
try {
  const file = resolve(root, 'public/data/rent.json');
  const before = JSON.parse(readFileSync(file, 'utf8'));
  execFileSync(process.execPath, [resolve(root, 'scripts/etl-rent.mjs')], { stdio: ['ignore', 'ignore', 'inherit'] });
  const after = JSON.parse(readFileSync(file, 'utf8'));
  if (after.quarters.at(-1) !== before.quarters.at(-1)) changes.push({ source: '物流施設の賃貸市場', from: before.quarters.at(-1), to: after.quarters.at(-1) });
  else writeFileSync(file, JSON.stringify(before)); // same quarter: keep the file as it was (no new `generated` date)
} catch (e) { changes.push({ source: '物流施設の賃貸市場', error: String(e.message ?? e) }); }

console.log(JSON.stringify(changes));
