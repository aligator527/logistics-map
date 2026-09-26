// Daiwa House DPL logistics sites -> public/data/dpl.json
//
//   node scripts/build-dpl.mjs
//
// Input: data/dpl/datas03.xml, a snapshot of the XML behind the public property list
//   https://www.daiwahouse.co.jp/business/logistics/dproject/list/index.html
//   (https://www.daiwahouse.co.jp/business/logistics/dproject/xml/datas03.xml).
// The site answers 403 to non-browser clients, so the snapshot is refreshed by hand from a browser
// (open the list page, then save the XML URL above) and committed together with its date in
// data/dpl/snapshot.json.
//
// The list is Daiwa House's leasing catalogue, not the whole portfolio: 募集中 / 即入居可 /
// 開発予定 / 契約済 sites only. Sites without coordinates are geocoded with the GSI address search;
// every site gets its municipality code from the GSI reverse geocoder. Both are cached in
// data/dpl/geocode.json so reruns do not hit the APIs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, r10 } from './lib/project.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const XML = resolve(root, 'data/dpl/datas03.xml');
const SNAP = resolve(root, 'data/dpl/snapshot.json');
const CACHE = resolve(root, 'data/dpl/geocode.json');
const OUT = resolve(root, 'public/data/dpl.json');

const snapshot = JSON.parse(readFileSync(SNAP, 'utf8'));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ parse (commented-out projects are dropped)
const xml = readFileSync(XML, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&').trim();
const tag = (s, t) => decode(s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] ?? '');
const STATUS = { type01: 'leasing', type02: 'available', type03: 'planned', type04: 'contracted' };
const sqm = (s) => (s ? Number(s.match(/^([\d,]+)m/)?.[1].replace(/,/g, '')) || null : null);
const ym = (s) => {
  const m = s.match(/(\d{4})年(\d{1,2})月/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : s || null; // e.g. 「着工前」 kept as text
};

const sites = [];
for (const pm of xml.matchAll(/<pref name="([^"]+)"[^>]*cd="(\d+)"[^>]*>([\s\S]*?)<\/pref>/g)) {
  const [, prefName, prefCd, body] = pm;
  // the XML also lists overseas sites (category kaigai: cd 48+ = ベトナム, タイ, …) — Japan only
  if (Number(prefCd) < 1 || Number(prefCd) > 47) continue;
  for (const m of body.matchAll(/<project([^>]*)>([\s\S]*?)<\/project>/g)) {
    const land = /dpflag="1"/.test(m[1]);
    const p = m[2];
    const name = tag(p, 'name');
    sites.push({
      name,
      pref: Number(prefCd),
      prefName,
      address: tag(p, 'add'),
      status: STATUS[tag(p, 'icon')] ?? 'unknown',
      land, // 事業用地: only the plot is known (敷地面積 / 利用開始時期)
      floor: land ? null : sqm(tag(p, 'site')),
      plot: land ? sqm(tag(p, 'site2')) : null,
      date: ym(land ? tag(p, 'date2') : tag(p, 'date')),
      lat: Number(tag(p, 'ido')) || null,
      lon: Number(tag(p, 'kdo')) || null,
      url: tag(p, 'url') ? `https://www.daiwahouse.co.jp${tag(p, 'url')}` : null,
      vr: tag(p, 'vr') === 'true',
    });
  }
}

// ------------------------------------------------------------------ geocode (cached)
async function gsi(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    await sleep(1000 * (i + 1));
  }
  throw new Error(`GSI ${url}`);
}
for (const s of sites) {
  const key = `${s.name}|${s.address}`;
  const c = (cache[key] ??= {});
  if (!s.lat || !s.lon) {
    if (!c.lat) {
      const q = `${s.prefName}${s.address.replace(/(土地区画整理事業地内|字.*|大字)$/, '')}`;
      const res = await gsi(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
      if (!res.length) { console.warn(`  ! no geocode for ${s.name} (${q})`); continue; }
      [c.lon, c.lat] = res[0].geometry.coordinates;
      c.approx = true;
      await sleep(300);
    }
    s.lat = c.lat; s.lon = c.lon; s.approx = true; // located by address only (town level)
  }
  if (!c.muni || c.at !== `${s.lat},${s.lon}`) {
    const res = await gsi(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${s.lat}&lon=${s.lon}`);
    c.muni = res.results?.muniCd ?? null;
    c.at = `${s.lat},${s.lon}`;
    await sleep(300);
  }
  s.muni = c.muni;
  if (s.muni && Number(s.muni.slice(0, 2)) !== s.pref) console.warn(`  ! ${s.name}: muni ${s.muni} outside pref ${s.pref}`);
}
writeFileSync(CACHE, JSON.stringify(cache, null, 1));

// ------------------------------------------------------------------ write
const located = sites.filter((s) => s.lat && s.lon);
const out = {
  source: {
    ja: '大和ハウス工業「物件一覧（物流センター・事業用地）」',
    en: 'Daiwa House Industry, logistics property list (物件一覧)',
    url: 'https://www.daiwahouse.co.jp/business/logistics/dproject/list/index.html',
    updated: snapshot.updated,   // 最終更新日 shown on the list page
    retrieved: snapshot.retrieved,
    note: {
      ja: '大和ハウス工業が募集・紹介している物件（募集中・即入居可・開発予定・契約済）のみで、全施設ではありません。',
      en: 'Only the properties Daiwa House lists for leasing (leasing, available, planned, contracted) — not its entire portfolio.',
    },
  },
  sites: located.map((s) => ({
    name: s.name, pref: s.pref, muni: s.muni, address: s.address, status: s.status, land: s.land,
    floor: s.floor, plot: s.plot, date: s.date, url: s.url, vr: s.vr || undefined, approx: s.approx || undefined,
    lat: +s.lat.toFixed(5), lon: +s.lon.toFixed(5), p: r10(project([s.lon, s.lat])),
  })),
};
writeFileSync(OUT, JSON.stringify(out));
const by = Object.groupBy(out.sites, (s) => s.status);
console.log(`wrote ${OUT}: ${out.sites.length} sites`, Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])),
  `(${sites.length - located.length} without location, ${out.sites.filter((s) => s.approx).length} geocoded by address)`);
