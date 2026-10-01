// 令和3年度 全国道路・街路交通情勢調査（道路交通センサス）一般交通量調査 箇所別基本表 — expressway speeds.
//   data/raw/roadcensus/kasyoNN.csv (Shift_JIS, one per prefecture) from https://www.mlit.go.jp/road/census/r3/
// Sections of 高速自動車国道 / 都市高速 / 一般国道の自動車専用道路 are chained between the interchanges named in
// their 起点側・終点側 備考 (a chain crosses municipal and prefectural borders), giving IC-to-IC stretches with a
// length and truck speeds: daytime (9–17 h) and rush hour (7–9, 17–19 h), 大型車 where measured (ETC2.0), else all
// vehicles. Speeds of a chain: length-weighted harmonic mean of its sections, both directions averaged the same way.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const C = { id: 0, type: 3, route: 4, name: 5, fromKind: 6, fromNote: 10, toKind: 11, toNote: 15, motorway: 19, km: 23,
  peakUpL: 74, peakUpAll: 75, peakDnL: 81, peakDnAll: 82, dayUpL: 88, dayUpAll: 89, dayDnL: 95, dayDnAll: 96, avgUp: 100, avgDn: 101 };

/** interchange names as both sources write them: no 「IC」「出入口」, スマートIC -> SIC, half-width */
export function normIc(s) {
  let t = String(s ?? '').normalize('NFKC').replace(/\s/g, '');
  t = t.replace(/スマートインターチェンジ|スマートIC|スマート$/u, 'SIC').replace(/インターチェンジ$/u, '');
  t = t.replace(/(出入口|出口|入口|(?<!S)IC)$/u, '').replace(/第[一二三1-3]$/u, '');
  t = t.replace(/廃止$/u, '').replace(/ジャンクション$/u, 'JCT');
  return t;
}
const ALIAS = { 清州JCT: '清洲JCT', 弥冨: '弥富' };
export const icNames = (s) => String(s ?? '').split(/[・･]/).map(normIc).map((n) => ALIAS[n] ?? n).filter(Boolean);

const num = (v) => { const x = Number(v); return v === '' || v === undefined || !isFinite(x) || x <= 0 ? NaN : x; };
/** harmonic mean of the two directions (the time over both is what a round trip sees) */
const both = (a, b) => (isFinite(a) && isFinite(b) ? 2 / (1 / a + 1 / b) : isFinite(a) ? a : b);

export function censusChains(dir) {
  const rows = [];
  for (const f of readdirSync(dir).filter((n) => /^kasyo\d\d\.csv$/.test(n)).sort()) {
    const text = new TextDecoder('shift_jis').decode(readFileSync(resolve(dir, f)));
    for (const line of text.split(/\r?\n/).slice(1)) {
      const r = line.split(',');
      if (r.length < 100) continue;
      const type = r[C.type];
      if (!(type === '1' || type === '2' || (type === '3' && r[C.motorway] === '1'))) continue;
      const day = both(num(r[C.dayUpL]) || num(r[C.dayUpAll]), num(r[C.dayDnL]) || num(r[C.dayDnAll])) || both(num(r[C.avgUp]), num(r[C.avgDn]));
      const peak = both(num(r[C.peakUpL]) || num(r[C.peakUpAll]), num(r[C.peakDnL]) || num(r[C.peakDnAll])) || day;
      // kasyo01–09 lose the leading zero of the 11-digit 交通調査基本区間番号 (1110500780 = 01110500780)
      const id = r[C.id].padStart(11, '0');
      rows.push({ id, key: `${type}|${r[C.route]}|${r[C.name]}`, name: r[C.name], km: num(r[C.km]) || 0, day, peak,
        from: r[C.fromNote], to: r[C.toNote], fromKind: r[C.fromKind], toKind: r[C.toKind], pref: id.slice(0, 2) });
    }
  }
  // chains per route, in section order (the id runs from the route's start to its end; prefectures in code order)
  const byRoute = new Map();
  for (const r of rows) (byRoute.get(r.key) ?? byRoute.set(r.key, []).get(r.key)).push(r);
  const chains = [];
  for (const list of byRoute.values()) {
    list.sort((a, b) => (a.id < b.id ? -1 : 1));
    let cur = null, prev = null;
    const close = (to) => {
      if (cur && cur.km > 0 && isFinite(cur.tDay) && cur.tDay > 0) {
        chains.push({ route: cur.route, a: cur.a, b: icNames(to), km: cur.km, day: cur.kmKnown / cur.tDay, peak: cur.kmKnown / cur.tPeak });
      }
      cur = null;
    };
    for (const r of list) {
      // a chain only runs on into the next prefecture's first section when both meet at the border
      if (cur && prev && r.pref !== prev.pref && !(prev.toKind === '3' && r.fromKind === '3')) cur = null;
      prev = r;
      if (r.from && icNames(r.from).length) cur = { route: r.name, a: icNames(r.from), km: 0, kmKnown: 0, tDay: 0, tPeak: 0 };
      if (!cur) continue;
      cur.km += r.km;
      if (isFinite(r.day) && r.km > 0) { cur.kmKnown += r.km; cur.tDay += r.km / r.day; cur.tPeak += r.km / (isFinite(r.peak) ? r.peak : r.day); }
      if (r.to && icNames(r.to).length) { const to = r.to; close(to); cur = { route: r.name, a: icNames(to), km: 0, kmKnown: 0, tDay: 0, tPeak: 0 }; }
    }
  }
  // each section with its own speeds (for matching by shape, scripts/build-network.mjs)
  const sections = rows.filter((r) => isFinite(r.day)).map(({ id, day, peak, km, name }) => ({ id, day, peak: isFinite(peak) ? peak : day, km, name }));
  return { rows: rows.length, chains, sections };
}
