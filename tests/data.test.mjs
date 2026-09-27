// Checks the published data files against values verified by hand against the official sources.
// Fixed historical values only (new quarters / years must not break them); if a ministry revises a
// figure, update the expectation together with a note in the commit.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8'));
const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} ≠ ${expected} ± ${tol}`);

test('warehouse: 倉庫統計季報', () => {
  const w = load('data/warehouse.json');
  assert.ok(w.quarters.length >= 61, 'at least 2010-Q2 … 2025-Q2');
  assert.equal(w.quarters[0].id, '2010-Q2');
  const q = w.quarters.findIndex((x) => x.id === '2025-Q2');
  assert.ok(q >= 0);
  assert.equal(w.japan.area[q], 70896, '所管面積 1〜3類 全国 R7 Q1 (千㎡)');
  assert.equal(w.prefs.area[q][10], 6129, '埼玉');
  assert.equal(w.prefs.area[q][22], 8300, '愛知');
  // the published 2010-Q2 合計 (39,413) is wrong in the source; the prefecture sum is used
  assert.equal(w.japan.area[0], 41661);
  for (let i = 0; i < w.quarters.length; i++) {
    for (const k of ['area', 'inbound', 'stock']) assert.equal(w.prefs[k][i].length, 47, `${k}[${i}]`);
  }
});

test('census: 物流センサス OD tables', () => {
  const idx = load('data/census/index.json');
  assert.deepEqual(idx.years.map((y) => y.year).slice(0, 4), [2005, 2010, 2015, 2021]);
  const c21 = load('data/census/2021.json');
  const tot = (m) => m.flat().reduce((s, v) => s + v, 0);
  near(tot(c21.day3.all), 20722426, 60, '3日間 合計 2021 (t)');
  assert.equal(c21.day3.all[10][12], 123445, '埼玉→東京 3日間');
  assert.equal(c21.annual.all[10][12], 12604191, '埼玉→東京 年間');
  assert.equal(c21.day3.all[22][26], 30463, '愛知→大阪 3日間');
  const c05 = load('data/census/2005.json');
  assert.equal(c05.day3.all[10][12], 114396, '埼玉→東京 2005');
  // mode split adds up to the total
  const modes = ['rail', 'truck', 'sea', 'air'].map((k) => tot(c21.day3[k])).reduce((a, b) => a + b, 0);
  assert.ok(modes <= tot(c21.day3.all) && modes > 0.9 * tot(c21.day3.all), 'modes ≈ total (その他 not split)');
});

test('jobs: 有効求人倍率', () => {
  const j = load('data/jobs.json');
  const fy = (y) => j.periods.findIndex((p) => p.id === String(y));
  assert.equal(j.japan.driver[fy(2022)], 2.38);
  assert.equal(j.japan.driver[fy(2023)], 2.62);
  assert.equal(j.japan.driver[fy(2025)], 2.58);
  assert.equal(j.ratio.driver[fy(2025)][12], 3.81, '東京');
  assert.equal(j.ratio.driver[fy(2025)][10], 2.13, '埼玉');
  assert.equal(j.ratio.handling[fy(2025)][10], 0.88, '埼玉 運搬');
  assert.equal(j.ratio.driver[fy(2019)][12], 3.82, '東京 FY2019 (old classification)');
});

test('ssw: 特定技能', () => {
  const s = load('data/ssw.json');
  const p = s.periods.findIndex((x) => x.id === '2025-12');
  assert.ok(p >= 0);
  assert.equal(s.japan1.total[p], 382341);
  assert.equal(s.s1.total[p][12], 25451, '東京');
  assert.equal(s.s1.transport[p][12], 29, '東京 自動車運送業');
  assert.equal(s.japan1.transport[p], 151);
  const p24 = s.periods.findIndex((x) => x.id === '2024-06');
  assert.equal(s.s1.transport?.[p24] ?? null, null, '自動車運送業 not a column before 2024-12');
});

test('dpl: Japanese sites only, all located', () => {
  const d = load('data/dpl.json');
  assert.ok(d.sites.length >= 100);
  for (const s of d.sites) {
    assert.ok(s.pref >= 1 && s.pref <= 47, `${s.name}: pref ${s.pref}`);
    assert.ok(s.lat > 24 && s.lat < 46 && s.lon > 122 && s.lon < 146, `${s.name}: ${s.lat},${s.lon}`);
    assert.ok(['available', 'leasing', 'planned', 'contracted'].includes(s.status), s.name);
  }
});

test('risk + municipal indicators', () => {
  const r = load('data/risk.json');
  assert.deepEqual(r.criteria.map((c) => c.key), ['quake', 'sediment', 'flood']);
  for (const c of r.criteria) {
    assert.equal(c.raw.length, 47);
    assert.ok(c.raw.every((v) => Number.isFinite(v) && v >= 0), c.key);
  }
  const m = load('data/muni.json');
  assert.equal(m.codes.length, 1898);
  near(m.m.pop.reduce((s, v) => s + (v ?? 0), 0), 126146099, 2000, '2020 census population on the grid');
  const i = m.codes.indexOf('11203');
  near(m.m.zone[i], 1414, 3, '川口市 工業系用途地域 ha');
  assert.equal(m.m.land[i], 228000, '川口市 工業地 median');
  assert.ok(m.m.pop[m.codes.indexOf('07204')] > 300000, 'いわき市 (pooled 07999 meshes placed by polygon)');
  assert.ok(m.m.pop[m.codes.indexOf('22138')] > 500000, '浜松市中央区 (2024 wards)');
  assert.ok(Object.keys(m.sites).length >= 100);
});

test('multimodal: airports and cargo (commercial-safe build has no ports / rail)', () => {
  const m = load('data/multimodal.json');
  const air = m.items.filter((x) => x.kind === 'air');
  assert.ok(air.length >= 90);
  assert.equal(air.find((x) => x.name === '成田国際空港').t, 2063350, 'Narita cargo 2025 (t)');
  assert.equal(air.find((x) => x.name === '東京国際空港').t, 1218911, 'Haneda cargo 2025 (t)');
  if (!m.noncommercial) assert.ok(m.items.every((x) => x.kind === 'air'), 'C02 / P31 are non-commercial sources');
});

test('municipal explorer fields and diesel', () => {
  const m = load('data/muni.json');
  const i = m.codes.indexOf('11203');
  for (const k of ['pop2050', 'work2050', 'old2025', 'commute', 'truck', 'wh', 'cold', 'landChg', 'urban', 'control', 'area']) {
    assert.equal(m.m[k].length, 1898, k);
  }
  near(m.m.truck[i], 8821, 1, '川口市 道路貨物運送業 (2021)');
  near(m.m.urban[i], 5467, 5, '川口市 市街化区域 ha');
  assert.equal(m.xy.length, 1898);
  const d = load('data/diesel.json');
  assert.ok(d.dates.length >= 52 && d.prefs.every((r) => r.length === 47));
  const k = d.dates.indexOf('2026-09-14');
  if (k >= 0) { assert.equal(d.japan[k], 159.3); assert.equal(d.prefs[k][12], 156.8, '東京'); }
  const a = load('data/jma-areas.json');
  assert.deepEqual(a['1310100'], ['13101'], '千代田区');
  assert.ok(a['0110000'].length === 10, '札幌市 → 10 wards');
});

test('hazard shares and road network', async () => {
  const m = load('data/muni.json');
  const ix = (c) => m.codes.indexOf(c);
  for (const k of ['hz_flood', 'hz_flood3', 'hz_surge', 'hz_tsunami', 'hz_sabo']) {
    assert.equal(m.m[k].length, 1898, k);
    assert.ok(m.m[k].every((v) => v === null || (v >= 0 && v <= 100)), `${k} in 0..100`);
  }
  assert.ok(m.m.hz_flood[ix('13122')] > 80, '葛飾区: mostly inside flood zones');
  assert.ok(m.m.hz_surge[ix('27128')] > 30, '大阪市中央区: storm surge');
  assert.ok(m.m.hz_sabo[ix('13122')] < 1, '葛飾区: flat');

  const { Router } = await import('../src/lib/travel.ts');
  const net = JSON.parse(readFileSync(new URL('../public/geo/network.json', import.meta.url), 'utf8'));
  assert.deepEqual(net.munis.ll.length, 1898);
  const r = new Router(net);
  const t = r.toMunis([r.muni(ix('13101'))]);
  const h = (c) => t[ix(c)] / 60;
  assert.ok(h('23101') > 3.5 && h('23101') < 5.5, `千代田→名古屋 ${h('23101')} h`);
  assert.ok(h('27128') > 5.5 && h('27128') < 8, `千代田→大阪 ${h('27128')} h`);
  // with the long-distance ferries Hokkaido and 佐渡 are reachable; without them they are not
  assert.ok(h('01101') > 15 && h('01101') < 24, `千代田→札幌 by ferry ${h('01101')} h`);
  assert.ok(isFinite(t[ix('15224')]), '佐渡 by ferry');
  r.ferries = false;
  const nf = r.toMunis([r.muni(ix('13101'))]);
  assert.equal(nf[ix('01101')], Infinity, 'no road to Hokkaido');
  assert.equal(nf[ix('15224')], Infinity, 'no road to 佐渡');
  r.ferries = true;
  // road km along the quickest path (for distance-based fares): 東京→名古屋 ~350 km, →大阪 ~500 km
  const dk = r.toMunisKm([r.muni(ix('13101'))]);
  assert.ok(dk.km[ix('23101')] > 300 && dk.km[ix('23101')] < 420, `千代田→名古屋 ${dk.km[ix('23101')]} km`);
  assert.ok(dk.km[ix('27128')] > 450 && dk.km[ix('27128')] < 600, `千代田→大阪 ${dk.km[ix('27128')]} km`);
  // rush hour is slower; closing the stretch the quickest path uses makes it longer
  r.peak = true;
  assert.ok(r.toMunis([r.muni(ix('13101'))])[ix('23101')] > t[ix('23101')], 'rush hour slower');
  r.peak = false;
  assert.ok(net.speedSource.measuredShare > 0.6, 'census speeds on most expressway km');
  const s = r.toMunis([r.muni(ix('01101'))]);
  assert.ok(s[ix('01202')] / 60 < 5, '札幌→函館 by road');
});

test('news: headlines and links only', { skip: !existsSync(new URL('../public/data/news.json', import.meta.url)) }, () => {
  const n = load('data/news.json');
  for (const it of n.items) {
    // headline, link, tags and a short preview — never an article body
    const keys = Object.keys(it).filter((k) => k !== 'img' && k !== 'floor').sort();
    assert.deepEqual(keys, ['date', 'ex', 'link', 'munis', 'prefs', 'src', 't', 'topics']);
    assert.ok(it.ex.length <= 110, `excerpt too long: ${it.ex.length}`);
    if (it.img) assert.match(it.img, /^https:\/\/prcdn\.freetls\.fastly\.net\//, 'preview images only from the PR TIMES CDN');
    assert.match(it.link, /^https:\/\//);
    assert.match(it.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('related news: facility names, stages, ranking', async () => {
  const { facilityOf, stageOf, relatedOf, timelineOf } = await import('../src/lib/related.ts');
  assert.equal(facilityOf('マルチテナント型物流施設「DPL札幌南V」着工')?.name, 'DPL札幌南V');
  assert.equal(facilityOf('東急不動産の物流施設「LOGI’Q」シリーズ「LOGI’Q市原」竣工')?.name, "LOGI'Q市原", 'series name skipped');
  assert.equal(facilityOf('【イベントレポート】中部地区初開催 「DPL小牧施設見学会&COCOLAN鉢植え体験会」')?.name, 'DPL小牧');
  assert.equal(facilityOf('中小物流事業者の労働生産性向上事業費補助金の公募'), null);
  assert.equal(stageOf('大型物流施設「ロジスクエア京田辺B」竣工'), 'done');
  assert.equal(stageOf('「プロロジスパーク北上金ケ崎」にイオングローバルSCMが入居'), 'open');
  const it = (t, date, extra = {}) => ({ t, link: t, date, src: 'cre', srcName: 'CRE', developer: true, topics: [], prefs: [26], munis: ['26211'], ...extra });
  const a = it('大型物流施設「ロジスクエア京田辺B」竣工', '2026-08-31');
  const all = [a, it('【ロジスクエア京田辺B】内覧会開催のお知らせ', '2026-09-07'),
    it('大型物流施設「ロジスクエア朝霞B」を着工', '2026-08-06', { prefs: [11], munis: ['11227'] }),
    it('オンラインセミナー開催', '2026-09-07', { prefs: [], munis: [] })];
  assert.deepEqual(relatedOf(a, all).map((r) => r.reason), ['facility', 'series', 'company']);
  assert.deepEqual(timelineOf(a, all).map((x) => x.date), ['2026-08-31', '2026-09-07']);
});

test('facility registry from the news', () => {
  const f = load('data/facilities.json');
  assert.ok(f.items.length > 0);
  for (const x of f.items) {
    assert.ok(x.name && x.brand && x.events.length, x.name);
    assert.ok(!/^DPL/.test(x.name), 'DPL has its own layer');
    if (x.muni) assert.match(x.muni, /^\d{5}$/);
    if (x.floor !== null) assert.ok(x.floor > 500 && x.floor < 2e6, `${x.name} floor ${x.floor}`);
    for (const e of x.events) assert.match(e.link, /^https:\/\//);
  }
  const kitamoto = f.items.find((x) => x.name === 'プロロジスパーク北本');
  if (kitamoto) assert.equal(kitamoto.muni, '11233', '北本市 from the facility name');
  assert.ok(!f.items.some((x) => x.name.includes('千葉ニュータウン') && x.muni === '12101'), 'not 千葉市中央区');
});

test('demand, wages and land trend', () => {
  const m = load('data/muni.json');
  const ix = (c) => m.codes.indexOf(c);
  for (const k of ['hh', 'mig', 'income', 'retail', 'mailorder', 'land5', 'land10', 'mfgShip', 'mfgEmp', 'wsEmp']) assert.equal(m.m[k].length, 1898, k);
  // 製造品出荷額等 2024: 豊田市 is Japan's largest (over 15兆円 = 150,000億円); Hamamatsu's new wards have B2B values
  assert.ok(m.m.mfgShip[ix('23211')] > 150_000, '豊田市 shipments > 15兆円');
  // distance to the nearest primary emergency / key logistics road (km, straight line from the population centre)
  assert.ok(m.m.dEmerg[ix('13101')] < 1 && m.m.dLogi[ix('13101')] < 5, '千代田区 is on both networks');
  assert.equal(m.m.dEmerg.filter((v) => v === null).length, 0, 'every municipality has a distance');
  // liquefaction-prone land (浦安: landfill) and long floods (江戸川区); actual logistics pay per prefecture
  assert.ok(m.m.hz_liq[ix('12227')] > 80, '浦安市 mostly liquefaction-prone');
  assert.ok(m.m.hz_dur3[ix('13123')] > 50, '江戸川区: floods lasting 3+ days');
  assert.equal(m.wageOcc.perPref.length, 47);
  for (const k of ['truckL', 'truck', 'handling']) assert.ok(m.wageOcc.perPref.every((p) => p[k]?.hourly > 1000 && p[k].hourly < 4000), `hourly pay of ${k}`);
  assert.equal(m.wageOcc.partTimeTransport.filter((v) => !(v > 900)).length, 0, 'part-time pay in every prefecture');
  // warehouse starts: national 2025 ≈ 9.76 M㎡ (建築着工統計), a series for every prefecture
  assert.ok(Math.abs(m.supply.japan[m.supply.years.indexOf('2025')] - 9_756_510) < 1, '倉庫着工 2025');
  assert.equal(m.supply.perPref.length, 47);
  assert.ok(m.m.trStart.some((v) => v > 100_000), '運輸業用 starts');
  assert.ok(m.m.mfgEmp[ix('22138')] > 10_000 && m.m.retail[ix('22139')] > 0, '浜松市 new wards filled');
  assert.ok(m.m.income[ix('13101')] > 1000, '千代田区: income per taxpayer > 1,000万円');
  assert.equal(m.m.income[ix('14101')], m.m.income[ix('14102')], 'wards of 横浜市 take the city figure');
  assert.ok(m.m.hh[ix('11203')] > 250000 && m.m.hh[ix('11203')] < 400000, '川口市 households');
  assert.equal(m.wage.perPref.length, 47);
  assert.equal(m.wage.perPref[12].at(-1), 1226, '東京 minimum wage 令和7年度');
  assert.equal(m.landTrend.japan[m.landTrend.years.indexOf(2016)], 100);
  assert.ok(m.landTrend.japan.at(-1) > 100, 'industrial land up since 2016');
});

test('rent: 一五不動産 logistics rental market', () => {
  const r = load('data/rent.json');
  assert.equal(r.quarters[0], '2008-07');
  assert.deepEqual(r.regions.map((g) => g.key), ['tokyo', 'kansai', 'chukyo', 'kyushu']);
  for (const g of r.regions) for (const k of ['vacancy', 'rent', 'leasable']) assert.equal(g[k].length, r.quarters.length, `${g.key} ${k}`);
  const i = r.quarters.indexOf('2020-01'), tokyo = r.regions[0];
  assert.equal(tokyo.vacancy[0], 10.6, '東京圏 2008年7月 空室率');
  assert.equal(tokyo.rent[i], 4370, '東京圏 2020年1月 募集賃料');
  assert.equal(r.regions[2].vacancy[i], 9.1, '中京圏 2020年1月 空室率');
  assert.ok(r.regions.every((g) => g.rent.at(-1) > 2000 && g.rent.at(-1) < 8000), 'latest rents');
  assert.ok(/一五不動産/.test(r.source.ja));
});
