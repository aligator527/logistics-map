// 地点カルテ: everything the map knows about one point, as a printable memo — address, ground,
// hazards at the point, zoning, reach by road, what is nearby, the municipality and live warnings.

import { store } from './store.svelte';
import { app } from './state.svelte';
import { t, type Key, type Lang } from './i18n';
import { fmtCompact, fmtMinutes, fmtNum } from './scale';
import { live, WARN } from './live.svelte';
import { project as projectLL } from './project';
import { addressAt, groundRisk, hazardsAt, pointInfo, DEPTH_LABEL } from './pointinfo';
import { tripClass } from './trips';
import type { DossierSection } from '../components/Dossier.svelte';

const R = 6371.0088, rad = Math.PI / 180;
const km = (a: [number, number], b: [number, number]) => {
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// ------------------------------------------------------------ zoning at the point (public/geo/zoning/NN.json)
const zoningCache = new Map<number, Promise<Record<string, [number, number][][][]>>>();
const ZONES: Record<string, { ja: string; en: string }> = { 1: { ja: '準工業地域', en: 'Light-industrial zone' }, 2: { ja: '工業地域', en: 'Industrial zone' }, 3: { ja: '工業専用地域', en: 'Exclusively industrial zone' } };
const inRing = (x: number, y: number, ring: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
async function zoningAt(pref: number, p: [number, number]) {
  if (!zoningCache.has(pref)) zoningCache.set(pref, fetch(`${import.meta.env.BASE_URL}geo/zoning/${String(pref).padStart(2, '0')}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  const z = await zoningCache.get(pref)!;
  for (const [k, polys] of Object.entries(z)) if (polys.some((poly) => inRing(p[0], p[1], poly[0]) && !poly.slice(1).some((h) => inRing(p[0], p[1], h)))) return k;
  return null;
}

export interface Karte { title: string; subtitle: string; sections: DossierSection[]; sources: string[]; figure: string }

export async function buildKarte(lon: number, lat: number): Promise<Karte> {
  const L: Lang = app.lang, tt = (k: Key) => t(L, k), s = store;
  const geo = s.geo!, lt = s.lt, muni = s.muni;
  const [info, hz, addr] = await Promise.all([pointInfo(lon, lat), hazardsAt(lon, lat), addressAt(lon, lat)]);
  const mcode = addr?.muni ?? '';
  const planar = geo.layout ? projectLL(lon, lat, geo.layout).p : null;
  const zone = planar && mcode ? await zoningAt(Number(mcode.slice(0, 2)), planar) : null;
  const place = mcode ? s.muniLabel(mcode) : '';
  const sections: DossierSection[] = [];

  // 1. the point
  const risk = groundRisk(info);
  sections.push({ title: tt('pointInfo'), rows: [
    [L === 'ja' ? '所在' : 'Location', `${place}${addr?.town ? ` ${addr.town}` : ''}`],
    [L === 'ja' ? '緯度・経度' : 'Lat / lon', `${lat.toFixed(5)}, ${lon.toFixed(5)}`],
    [tt('elevation'), info.elev !== null ? `${fmtNum(L, info.elev, 1)} m` : tt('noData')],
    [tt('landformNatural'), info.natural?.[L] ?? tt('noData')],
    ...(info.artificial ? [[tt('landformArtificial'), info.artificial[L]] as [string, string]] : []),
    ...(risk ? [[tt('groundRisk'), tt(`risk_${risk}` as Key)] as [string, string]] : []),
    [tt('layerZone'), zone ? ZONES[zone][L] : (L === 'ja' ? '工業系用途地域の外（2019年度）' : 'Outside industrial zoning (FY2019)')],
  ], note: tt('landformNote') });

  // 2. hazards at the point
  sections.push({ title: L === 'ja' ? 'この地点のハザード' : 'Hazards at the point', rows: [
    [L === 'ja' ? '洪水（想定最大）' : 'Flood (max.)', hz.flood ? DEPTH_LABEL[hz.flood][L] : tt('hzNone')],
    [L === 'ja' ? '高潮（想定最大）' : 'Storm surge (max.)', hz.surge ? DEPTH_LABEL[hz.surge][L] : tt('hzNone')],
    [L === 'ja' ? '津波浸水想定' : 'Tsunami', hz.tsunami ? (L === 'ja' ? '区域内' : 'inside') : tt('hzNone')],
    [L === 'ja' ? '土砂災害警戒区域' : 'Landslide-warning zone', hz.sabo ? (L === 'ja' ? '区域内' : 'inside') : tt('hzNone')],
    ...(mcode && muni ? [[tt('hzQuake'), `${fmtNum(L, muni.m.quake[muni.codes.indexOf(mcode)] ?? NaN, 0)}%`] as [string, string]] : []),
  ], note: L === 'ja' ? 'ハザードマップポータルサイトのオープンデータ（地点の周囲約10m）。地震は市区町村の人口重心での値。' : 'Hazard Map Portal open data (about 10 m around the point); earthquake at the municipality’s population centre.' });

  // 3. reach by road
  if (lt?.router && lt.reach && mcode) {
    const i = lt.indexOf(mcode), comp = i >= 0 ? lt.router.net.munis.comp[i] : 0;
    const key = `pt:${lon.toFixed(4)},${lat.toFixed(4)},${comp}`;
    const origin = lt.reach.place(lon, lat, comp);
    const t = lt.router.toMunis([origin]);
    const pop = (lim: number) => t.reduce((a, x, j) => a + (x <= lim ? muni?.m.pop[j] ?? 0 : 0), 0);
    const trips = [0, 0, 0];
    t.forEach((x, j) => { const c = tripClass(x); if (c) trips[c - 1] += muni?.m.pop[j] ?? 0; });
    const hub = (g: 'port' | 'air' | 'rail', k: Key) => { const h = lt.hubsFrom(key, g, 1)[0]; return [tt(k), h ? `${h.name} ${fmtMinutes(L, h.t)}` : tt('noRoad')] as [string, string]; };
    const ic = origin.acc.length ? fmtMinutes(L, origin.acc[1] / 10) : tt('noRoad');
    sections.push({ title: tt('isoTitle'), rows: [
      [L === 'ja' ? '最寄りのIC・入口まで' : 'To the nearest interchange', ic],
      ...[30, 60, 120].map((m) => [`${tt('isoPop')} ${fmtMinutes(L, m)}`, `${fmtCompact(L, pop(m))}${L === 'ja' ? '人' : ''}`] as [string, string]),
      [`${tt('trip2024')}：${tt('trip1')}`, `${fmtCompact(L, trips[0])}${L === 'ja' ? '人' : ''}`],
      hub('port', 'tPortHub'), hub('air', 'tAirHub'), hub('rail', 'tRailHub'),
    ], note: tt('isoNote') });
  }

  // 4. nearby
  const near: { label: string; value?: string; href?: string }[] = [];
  for (const st of s.sites) { const d = km([lon, lat], [st.lon, st.lat]); if (d <= 20) near.push({ label: st.name, value: `DPL · ${fmtNum(L, d, 1)} km`, href: st.url ?? undefined }); }
  for (const f of s.facilities ?? []) { if (!f.ll) continue; const d = km([lon, lat], f.ll); if (d <= 20) near.push({ label: f.name, value: `${s.srcName(f.src)} · ${fmtNum(L, d, 1)} km`, href: f.events.at(-1)?.link }); }
  near.sort((a, b) => parseFloat(a.value!.split('· ')[1]) - parseFloat(b.value!.split('· ')[1]));
  sections.push({ title: L === 'ja' ? '周辺20km の物流施設' : 'Logistics facilities within 20 km', list: near.slice(0, 12),
                  note: near.length ? undefined : (L === 'ja' ? '該当なし（DPLと報道された他社施設）' : 'None (DPL and other developers’ facilities in the news)') });

  // 5. the municipality
  if (lt && mcode && lt.indexOf(mcode) >= 0) {
    const keys = ['pop30', 'pop2050', 'work2050', 'land', 'landChg', 'zone', 'control', 'pool30', 'truck', 'wh', 'hz_flood', 'hz_sabo'];
    const prof = lt.profile(mcode).filter((r) => keys.includes(r.m.key));
    sections.push({ title: `${place}`, rows: prof.map((r) => [r.m[L], `${isFinite(r.v) ? r.m.fmt(r.v) : '–'}${r.rank ? `（${r.rank}/${r.n}）` : ''}`] as [string, string]),
                    note: L === 'ja' ? '順位は物流の立地上有利な順' : 'Ranks: most favourable for logistics first' });
  }

  // 6. live
  if (live.warnTime && mcode) {
    const ks = (live.warnings.get(mcode) ?? []).filter((k) => (WARN[k]?.level ?? 0) >= 2);
    sections.push({ title: tt('liveWarn'), rows: [[place, ks.length ? ks.map((k) => WARN[k]?.[L] ?? k).join('・') : (L === 'ja' ? '発表なし' : 'none')]],
                    note: `${tt('jmaSource')} · ${new Date(live.warnTime).toLocaleString(L === 'ja' ? 'ja-JP' : 'en-GB')}` });
  }

  // mini map: municipalities around the point, facilities, 10 km ring
  let figure = '';
  if (planar) {
    const [cx, cy] = geo.P(planar), r = 12_000 * geo.unitsPerMetre;
    const box = [cx - r, cy - r, 2 * r, 2 * r];
    const shapes = geo.munis.filter((m) => m.bbox[1][0] > box[0] && m.bbox[0][0] < box[0] + box[2] && m.bbox[1][1] > box[1] && m.bbox[0][1] < box[1] + box[3]);
    const dot = (lo: number, la: number, fill: string) => { const [x, y] = geo.P(projectLL(lo, la, geo.layout!).p); return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(r / 60).toFixed(2)}" fill="${fill}" stroke="#fff" stroke-width="${(r / 300).toFixed(2)}"/>`; };
    figure = `<svg viewBox="${box.map((v) => v.toFixed(2)).join(' ')}" role="img" aria-label="${place}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#dfe8f0"/>
      ${shapes.map((m) => `<path d="${m.d}" fill="${m.code === mcode ? '#cfe0f0' : '#eeeeea'}" stroke="#8a8f94" stroke-width="${(r / 400).toFixed(3)}"/>`).join('')}
      <circle cx="${cx}" cy="${cy}" r="${10_000 * geo.unitsPerMetre}" fill="none" stroke="#b26b3a" stroke-dasharray="${r / 50} ${r / 80}" stroke-width="${(r / 250).toFixed(3)}"/>
      ${s.sites.filter((st) => km([lon, lat], [st.lon, st.lat]) < 17).map((st) => dot(st.lon, st.lat, '#f2a900')).join('')}
      ${(s.facilities ?? []).filter((f) => f.ll && km([lon, lat], f.ll) < 17).map((f) => dot(f.ll![0], f.ll![1], '#b26b3a')).join('')}
      <circle cx="${cx}" cy="${cy}" r="${r / 35}" fill="#111" stroke="#fff" stroke-width="${r / 200}"/>
    </svg>`;
  }

  const sources = [
    L === 'ja' ? '国土地理院（標高API・地形分類・住所検索）' : 'GSI (elevation API, landform classification, geocoder)',
    L === 'ja' ? 'ハザードマップポータルサイト（オープンデータ）' : 'Hazard Map Portal (open data)',
    L === 'ja' ? '国土数値情報（用途地域 A29・高速道路 N06）' : 'MLIT National Land Numerical Information (A29, N06)',
    ...(muni ? Object.values(muni.sources).map((x) => x[L]) : []),
  ];
  return {
    title: `${L === 'ja' ? '地点カルテ' : 'Site memo'}：${place}${addr?.town ? ` ${addr.town}` : ''}`,
    subtitle: L === 'ja' ? '地図上の1地点についての一次スクリーニング用メモ。数値は公開データからの推計で、現地確認・行政確認が前提です。'
      : 'First-pass screening memo for one point; figures are estimates from open data — verify on site and with the authorities.',
    sections, sources: [...new Set(sources)], figure,
  };
}
