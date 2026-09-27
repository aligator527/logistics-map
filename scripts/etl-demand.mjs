// Last-mile demand and cost inputs, added to public/data/muni.json (run after etl-muni):
//
//   node scripts/etl-demand.mjs
//
// data/raw/demand/juki_R8_muni.xlsx   総務省 住民基本台帳に基づく人口・世帯数（市区町村別、2026年1月1日）と
//                                     2025年の人口動態 — households, social change (in − out migration) rate
//   https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html
// data/raw/demand/J51-25-b.xlsx       総務省 市町村税課税状況等の調 第11表 市町村別内訳（令和7年度）—
//                                     課税対象所得 ÷ 所得割の納税義務者数 (designated cities: the city's figure for every ward)
//   https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/ichiran09_25.html
// data/raw/census2020/000040067885.xlsx  経済センサス‐活動調査2021 — retail (I2) and mail-order (611) employees
//                                     + manufacturing (E) and wholesale (I1) employees (B2B demand)
// data/raw/industry/2025-k4-data.xlsx 2025年経済構造実態調査 製造業事業所調査（2024年実績）参考表 市区町村別 — 製造品出荷額等
//   https://www.e-stat.go.jp/stat-search/files?toukei=00200555 (statInfId 000040480531)
// data/raw/wage/mw.xlsx               厚生労働省 地域別最低賃金の推移（H14〜R7）-> per prefecture, with history
//   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parseMinWage } from './lib/minwage.mjs';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(root, 'data/raw');
const out = JSON.parse(readFileSync(resolve(root, 'public/data/muni.json'), 'utf8'));
const idx = new Map(out.codes.map((c, i) => [c, i]));
const N = out.codes.length;
const sheet = (file, name) => { const wb = XLSX.read(readFileSync(resolve(RAW, file))); return XLSX.utils.sheet_to_json(wb.Sheets[name ?? wb.SheetNames[0]], { header: 1, defval: '' }); };
const num = (v) => (v === '' || v === '-' || v === '…' ? NaN : Number(String(v).replace(/,/g, '')));

// designated cities: a ward takes the city whose code is the largest ≤ its own in the prefecture
const designated = new Set();
const cityOfWard = (code) => {
  let best = null;
  for (const c of designated) if (c.slice(0, 2) === code.slice(0, 2) && c <= code && (!best || c > best)) best = c;
  return best;
};

// ------------------------------------------------------------------ households, migration (住民基本台帳)
const hh = Array(N).fill(null), mig = Array(N).fill(null);
{
  const rows = sheet('demand/juki_R8_muni.xlsx');
  const head = rows[4].map(String);
  const col = (re) => head.findIndex((h) => re.test(h));
  const cPop = 5, cHh = col(/^世帯数$/), cSoc = rows[3].findIndex((h) => /^社会増減数$/.test(h));
  let n = 0;
  for (const r of rows.slice(6)) {
    const code = String(r[0]).slice(0, 5);
    if (!idx.has(code)) continue;
    const i = idx.get(code);
    hh[i] = num(r[cHh]);
    const pop = num(r[cPop]), soc = num(r[cSoc]);
    mig[i] = pop > 0 && isFinite(soc) ? Math.round((soc / pop) * 10000) / 100 : null; // % of residents
    n++;
  }
  console.log(`住民基本台帳: ${n} municipalities`);
}

// ------------------------------------------------------------------ taxable income per taxpayer (千円 -> 万円)
const income = Array(N).fill(null);
{
  const rows = sheet('demand/J51-25-b.xlsx');
  const head = rows[1].map(String);
  const cCode = head.indexOf('団体コード'), cSide = head.indexOf('表側'), cPay = head.findIndex((h) => /納税義務者数/.test(h)), cInc = head.indexOf('課税対象所得');
  const byCity = new Map();
  for (const r of rows.slice(4)) {
    if (String(r[cSide]) !== '市町村民税') continue;
    const code = String(r[cCode]).slice(0, 5);
    const v = num(r[cInc]) / num(r[cPay]) / 10; // 千円/人 -> 万円/人
    if (!isFinite(v)) continue;
    byCity.set(code, Math.round(v * 10) / 10);
    if (!idx.has(code) && code.endsWith('0')) designated.add(code);
  }
  let wards = 0;
  out.codes.forEach((c, i) => {
    if (byCity.has(c)) { income[i] = byCity.get(c); return; }
    const city = cityOfWard(c);
    if (city && byCity.has(city)) { income[i] = byCity.get(city); wards++; }
  });
  console.log(`課税状況: ${byCity.size} municipalities, ${wards} wards take their city's figure`);
}

// ------------------------------------------------------------------ retail and mail-order employees (経済センサス2021)
const retail = Array(N).fill(null), mailorder = Array(N).fill(null), mfgEmp = Array(N).fill(null), wsEmp = Array(N).fill(null);
{
  const rows = sheet('census2020/000040067885.xlsx');
  const head = rows[5].map(String);
  const cRetail = head.findIndex((h) => /^I2_小売業$/.test(h)), cMail = head.findIndex((h) => /^611_/.test(h));
  const cMfg = head.findIndex((h) => /^E_製造業$/.test(h)), cWs = head.findIndex((h) => /^I1_卸売業$/.test(h));
  const cityRow = new Map();
  // the area code is in one of the first columns (5 digits, or 5 + check digit)
  let n = 0;
  for (const r of rows.slice(8)) {
    const cell = r.slice(0, 4).map(String).find((x) => /^\d{5,6}$/.test(x.trim()) || /^\d{5}_/.test(x.trim()));
    if (!cell) continue;
    const code = cell.trim().slice(0, 5);
    const vals = [num(r[cRetail]), num(r[cMail]), num(r[cMfg]), num(r[cWs])].map((v) => (isFinite(v) ? v : 0));
    cityRow.set(code, vals);
    if (!idx.has(code)) continue;
    const i = idx.get(code);
    [retail[i], mailorder[i], mfgEmp[i], wsEmp[i]] = vals;
    n++;
  }
  // Hamamatsu's wards were redrawn in 2024 (22138–22140): the 2021 city total, shared by population
  const newWards = out.codes.filter((c) => /^2213[89]|^22140/.test(c));
  const city = cityRow.get('22130'), popSum = newWards.reduce((s, c) => s + (out.m.pop[idx.get(c)] ?? 0), 0);
  if (city && popSum) for (const c of newWards) {
    const i = idx.get(c), f = (out.m.pop[i] ?? 0) / popSum;
    [retail[i], mailorder[i], mfgEmp[i], wsEmp[i]] = city.map((v) => Math.round(v * f));
  }
  console.log(`経済センサス: retail / mail-order employees for ${n} municipalities (cols ${cRetail}, ${cMail})`);
}

// ------------------------------------------------------------------ 製造品出荷額等 (2024, 万円 -> 億円); X = suppressed
const mfgShip = Array(N).fill(null);
{
  const rows = sheet('industry/2025-k4-data.xlsx', '参考表');
  let n = 0, x = 0;
  const seen = new Set();
  for (const r of rows.slice(10)) {
    if (String(r[4]) !== '00') continue;
    const code = String(r[2]).trim();
    if (!idx.has(code)) continue;
    seen.add(code);
    const v = num(r[12]);
    if (isFinite(v)) { mfgShip[idx.get(code)] = Math.round(v / 1e4 * 10) / 10; n++; } else x++;
  }
  // not in the table: no manufacturing establishments (small villages)
  let zero = 0;
  out.codes.forEach((c, i) => { if (!seen.has(c)) { mfgShip[i] = 0; zero++; } });
  console.log(`製造品出荷額等: ${n} municipalities, ${x} suppressed (X), ${zero} without a row (0)`);
}

// ------------------------------------------------------------------ minimum wage per prefecture (H14–R7)
const wage = parseMinWage(readFileSync(resolve(RAW, 'wage/mw.xlsx')));
console.log(`最低賃金: ${wage.years.length} years, latest ${wage.years.at(-1)}: 東京 ${wage.perPref[12].at(-1)}, 秋田 ${wage.perPref[4].at(-1)}`);

// ------------------------------------------------------------------ industrial land price trend (地価公示 L01, 1983–2026)
// Every L01 point carries its price series (L01_062 = 1983 … L01_105 = 2026). Per municipality: the
// median 5- and 10-year change of industrial points (用途 009) priced in both years. Per prefecture and
// Japan: a chained index (2016 = 100) from the median year-on-year change of the same points.
const land5 = Array(N).fill(null), land10 = Array(N).fill(null);
const landTrend = { years: [], japan: [], prefs: [] };
{
  const zip = resolve(RAW, 'land/L01-26_GML.zip');
  const name = execFileSync('unzip', ['-Z1', zip]).toString().split('\n').find((n) => /\.geojson$/.test(n));
  const gj = JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8'));
  const Y0 = 1983, LAST = 2026, series = (p) => Array.from({ length: LAST - Y0 + 1 }, (_, k) => Number(p[`L01_${String(62 + k).padStart(3, '0')}`]) || 0);
  const pts = gj.features.filter((f) => String(f.properties.L01_002).padStart(3, '0') === '009')
    .map((f) => ({ code: String(f.properties.L01_001).padStart(5, '0'), s: series(f.properties) }));
  const med = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : NaN; };
  const change = (list, back) => med(list.filter((p) => p.s.at(-1) > 0 && p.s.at(-1 - back) > 0).map((p) => (p.s.at(-1) / p.s.at(-1 - back) - 1) * 100));
  const byMuni = new Map();
  for (const p of pts) (byMuni.get(p.code) ?? byMuni.set(p.code, []).get(p.code)).push(p);
  for (const [c, list] of byMuni) {
    const i = idx.get(c) ?? (() => { const city = cityOfWard(c); return city ? idx.get(city) : undefined; })();
    if (i === undefined) continue;
    const a = change(list, 5), b = change(list, 10);
    land5[i] = isFinite(a) ? Math.round(a * 10) / 10 : null;
    land10[i] = isFinite(b) ? Math.round(b * 10) / 10 : null;
  }
  const FROM = 2006;
  landTrend.years = Array.from({ length: LAST - FROM + 1 }, (_, k) => FROM + k);
  const index = (list) => {
    const idxs = [100];
    for (let y = FROM + 1; y <= LAST; y++) {
      const k = y - Y0;
      const r = med(list.filter((p) => p.s[k] > 0 && p.s[k - 1] > 0).map((p) => p.s[k] / p.s[k - 1]));
      idxs.push(idxs.at(-1) * (isFinite(r) ? r : 1));
    }
    const base = idxs[2016 - FROM];
    return idxs.map((v) => Math.round((v / base) * 1000) / 10);
  };
  landTrend.japan = index(pts);
  for (let pc = 1; pc <= 47; pc++) landTrend.prefs.push(index(pts.filter((p) => Number(p.code.slice(0, 2)) === pc)));
  console.log(`地価公示 trend: ${pts.length} industrial points; Japan 2026 = ${landTrend.japan.at(-1)} (2016 = 100); 5-yr change for ${land5.filter((v) => v !== null).length} municipalities`);
}

Object.assign(out.m, { hh, mig, income, retail, mailorder, land5, land10, mfgShip, mfgEmp, wsEmp });
out.landTrend = landTrend;
out.wage = wage;
Object.assign(out.sources, {
  juki: { ja: '総務省 住民基本台帳に基づく人口・世帯数（2026年1月1日）・人口動態（2025年）', en: 'MIC Basic Resident Register: households (1 Jan 2026), migration (2025)', url: 'https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html' },
  income: { ja: '総務省 市町村税課税状況等の調 第11表（令和7年度、課税対象所得÷所得割納税義務者数。政令市の区は市の値）', en: 'MIC municipal tax survey, table 11 (FY2025): taxable income per taxpayer (wards: city value)', url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/ichiran09_25.html' },
  retail: { ja: '令和3年経済センサス‐活動調査（小売業・通信販売の従業者）', en: '2021 Economic Census (retail and mail-order employees)', url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00200553' },
  b2b: { ja: '令和3年経済センサス‐活動調査（製造業・卸売業の従業者）を加工して作成', en: '2021 Economic Census (manufacturing and wholesale employees), processed', url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00200553' },
  mfgShip: { ja: '2025年経済構造実態調査 製造業事業所調査（2024年実績、市区町村別 参考表）を加工して作成', en: '2025 Economic Structure Survey, manufacturing (2024 shipments by municipality), processed', url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00200555' },
  wage: { ja: `厚生労働省 地域別最低賃金（${wage.years.at(-1)}）`, en: `MHLW regional minimum wages (${wage.years.at(-1)})`, url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/' },
});
writeFileSync(resolve(root, 'public/data/muni.json'), JSON.stringify(out));
const show = (c) => { const i = idx.get(c); return `${c}: hh ${hh[i]}, mig ${mig[i]}%, income ${income[i]}万, retail ${retail[i]}, mail ${mailorder[i]}, mfg ${mfgEmp[i]}人 ${mfgShip[i]}億円, ws ${wsEmp[i]}`; };
for (const c of ['13101', '11203', '14101', '01101', '47201', '23211', '22138', '22140']) console.log(' ', show(c));
