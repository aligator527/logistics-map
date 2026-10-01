// News feed -> public/data/news.json (headline, date, link, source, topic and place tags, preview)
//
//   node scripts/fetch-news.mjs
//
// Runs daily in GitHub Actions (.github/workflows/update-news.yml). Stored per item: headline, link,
// a short excerpt (the lead, EXCERPT characters, quoted with source and link — never the article
// body) and, for PR TIMES releases, the URL of the release's own preview image (og:image, loaded
// from the PR TIMES CDN by the browser, not copied). The file is a rolling archive: new items are
// merged with the previous run (feeds such as MLIT cover only ~2 days), deduplicated by link and
// kept for KEEP_DAYS.
//
// Sources are chosen by their terms of use (see SOURCES[].terms). Trade media reserve reuse and
// ask commercial sites for permission, so they are listed but disabled until permission is given.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { facilityOf, stageOf } from '../src/lib/related.ts';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'public/data/news.json');
const KEEP_DAYS = 180, MAX_ITEMS = 400;
const UA = 'Mozilla/5.0 (compatible; logistics-map news fetcher; +https://github.com/aligator527)';
const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const EXCERPT = 110, MAX_PAGE_FETCHES = 80;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// logistics real-estate brands: 「MFLP八千代勝田台」, 「Landport」, 「LOGI'Q」 …
// (not a bare 「ロジ」: it is inside 「プロジェクト」)
const FACILITY = /物流|倉庫|ロジス|ロジック|ロジクロス|MFLP|Landport|LOGI|DPL|配送センター|冷凍冷蔵/;
const PRTIMES_TERMS = 'https://prtimes.jp/main/html/kiyaku (営利目的の無断利用は不可 — 非営利の範囲で使用)';
/** a developer's own releases on PR TIMES (company RSS), logistics items only */
const developer = (key, id, ja, en) => ({
  key, ja: `${ja}（PR TIMES）`, en: `${en} (PR TIMES)`, enabled: true, group: 'developer',
  url: `https://prtimes.jp/companyrdf.php?company_id=${id}`, terms: PRTIMES_TERMS, keep: (it) => FACILITY.test(it.title),
});

const LOGI = /物流|倉庫|貨物|運送|トラック|ドライバー|自動車運送|宅配|荷主|ロジスティクス|港湾|フェリー|鉄道貨物|2024年問題|特定技能|育成就労/;
const SOURCES = [
  {
    key: 'mlit', ja: '国土交通省 報道発表', en: 'MLIT press releases', enabled: true,
    url: 'https://www.mlit.go.jp/pressrelease.rdf', encoding: 'shift_jis',
    terms: 'https://www.mlit.go.jp/link.html (リンクフリー、PDL1.0)',
    // bureau codes in /report/press/<code>_hh_… : 物流政策 / トラック / 自動物流道路 / 港湾
    keep: (it) => !/\/jidosha08_/.test(it.link) && !/造船|船舶の安全|IMO|国際海事機関|離接岸/.test(it.title)
      && (/\/(tokatsu01|jidosha04|road01|port0\d)_/.test(it.link) || LOGI.test(it.title)),
  },
  {
    key: 'egov', ja: 'e-Govパブリック・コメント', en: 'e-Gov public comments', enabled: true,
    url: 'https://public-comment.e-gov.go.jp/rss/pcm_list.xml',
    terms: 'https://public-comment.e-gov.go.jp/',
    keep: (it) => LOGI.test(it.title) || /物流・自動車局/.test(it.desc),
  },
  {
    key: 'daiwa', ja: '大和ハウス工業（PR TIMES）', en: 'Daiwa House (PR TIMES)', enabled: true,
    url: 'https://prtimes.jp/companyrdf.php?company_id=2296',
    terms: PRTIMES_TERMS, group: 'developer',
    keep: (it) => /DPL|物流|倉庫|ロジスティクス/.test(it.title),
  },
  developer('prologis', 95695, 'プロロジス', 'Prologis'),
  developer('mitsui', 51782, '三井不動産', 'Mitsui Fudosan'),
  developer('nomura', 25694, '野村不動産HD', 'Nomura Real Estate'),
  developer('tokyu', 6953, '東急不動産', 'Tokyu Land'),
  developer('nskre', 1379, '日鉄興和不動産', 'Nippon Steel Kowa Real Estate'),
  developer('cre', 12732, 'シーアールイー', 'CRE'),
  developer('hhre', 33147, '阪急阪神不動産', 'Hankyu Hanshin Properties'),
  developer('kasumigaseki', 48076, '霞ヶ関キャピタル', 'Kasumigaseki Capital'),
  developer('tlc', 91164, '東京流通センター', 'Tokyo Ryutsu Center'),
  // --- trade media: disabled until the publisher allows headline links (see their terms)
  // LNEWS (メディアビズ) declined in writing (2026-10): their RSS is linked only to incorporated partners, so not for
  // projects run by individuals, commercial or not. Left out for good; do not re-enable.
  { key: 'weekly', ja: '物流ウィークリー', en: 'Butsuryu Weekly', enabled: false, url: 'https://weekly-net.co.jp/feed/',
    terms: 'https://weekly-net.co.jp/copyright/', keep: () => true },
  { key: 'logitoday', ja: 'LOGISTICS TODAY', en: 'LOGISTICS TODAY', enabled: false, url: 'https://www.logi-today.com/feed',
    terms: 'https://www.logi-today.com/use-article', keep: () => true },
];

const TOPICS = [
  { key: 'policy', ja: '政策・補助金', en: 'Policy & subsidies', re: /補助金|公募|検討会|法律|省令|告示|改正|政策|パブリック|意見募集|ガイドライン/ },
  { key: 'labour', ja: '人材・2024年問題', en: 'Labour & 2024', re: /2024年問題|特定技能|育成就労|外国人|ドライバー|人手|担い手|働き方|労働/ },
  { key: 'facility', ja: '物流施設', en: 'Facilities', re: /DPL|物流施設|倉庫|着工|竣工|稼働|開設|センター|用地/ },
  { key: 'transport', ja: '輸送・交通', en: 'Transport', re: /トラック|鉄道|港湾|フェリー|海運|航空貨物|自動物流道路|高速道路|共同輸送|モーダルシフト/ },
];

const PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟',
  '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根',
  '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];
// DPL facility names -> prefecture (「DPL札幌南Ⅴ 着工」 → 北海道)
const dpl = existsSync(resolve(root, 'public/data/dpl.json'))
  ? JSON.parse(readFileSync(resolve(root, 'public/data/dpl.json'), 'utf8')).sites.map((s) => ({ name: norm(s.name), pref: s.pref, muni: s.muni }))
  : [];
// Municipality names -> codes. Designated cities (「横浜市」) point at their most populated ward.
// Names shared by several prefectures (府中市, 伊達市, 中央区 …) only count when the title also
// names the prefecture. Longest names first, and matched text is blanked out, so 「つくばみらい市」
// is not read as 「つくば市」.
const munis = (() => {
  const topoFile = resolve(root, 'public/geo/japan.topo.json'), muniFile = resolve(root, 'public/data/muni.json');
  if (!existsSync(topoFile)) return [];
  const geoms = JSON.parse(readFileSync(topoFile, 'utf8')).objects.muni.geometries;
  const md = existsSync(muniFile) ? JSON.parse(readFileSync(muniFile, 'utf8')) : null;
  const popOf = (c) => (md ? md.m.pop[md.codes.indexOf(c)] ?? 0 : 0);
  const byName = new Map();
  const add = (name, code) => (byName.get(name) ?? byName.set(name, []).get(name)).push(code);
  const cityBest = new Map();
  for (const g of geoms) {
    const code = String(g.id), n = g.properties.n;
    const w = n.match(/^(.+?市)(.+区)$/);
    if (w) {
      add(w[2], code);                      // ward alone (「中央区」): ambiguous unless the prefecture is named
      const k = `${code.slice(0, 2)}|${w[1]}`;
      if (!cityBest.has(k) || popOf(code) > popOf(cityBest.get(k).code)) cityBest.set(k, { name: w[1], code });
    } else add(n, code);
  }
  for (const { name, code } of cityBest.values()) add(name, code);
  return [...byName].map(([name, codes]) => ({ name, codes })).sort((a, b) => b.name.length - a.name.length);
})();
function munisOf(title, prefs) {
  let s = title;
  const out = new Set();
  for (const { name, codes } of munis) {
    if (name.length < 2 || !s.includes(name)) continue;
    const cand = codes.length === 1 ? codes : codes.filter((c) => prefs.includes(Number(c.slice(0, 2))));
    if (cand.length === 1) out.add(cand[0]);
    s = s.split(name).join('　'.repeat(name.length));
  }
  return [...out].sort();
}

function prefsOf(title) {
  const out = new Set();
  PREFS.forEach((p, i) => {
    // bare 「京都」 would also hit 東京都; 「東京」 hits 東京湾 etc. — accept both, they are rare in practice
    const re = p === '京都' ? /(^|[^東])京都/ : new RegExp(p);
    if (re.test(title)) out.add(i + 1);
  });
  for (const d of dpl) if (title.includes(d.name)) out.add(d.pref);
  return [...out].sort((a, b) => a - b);
}

/** place tags from the headline; the excerpt only when the headline names no place. Parentheses are
 *  dropped from the excerpt first: they hold the company's head office (「（所在：東京都中央区…）」). */
function tagsOf(title, ex = '') {
  let tags = tagsOfText(title);
  if (!tags.prefs.length && ex) {
    const fromEx = tagsOfText(ex.replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[(（][^)）]*$/, ''));
    tags = { ...tags, prefs: fromEx.prefs, munis: fromEx.munis };
  }
  return tags;
}
function tagsOfText(title) {
  const prefs = prefsOf(title);
  const ms = munisOf(title, prefs);
  // DPL facility names carry their municipality (longest name first: 「DPL新横浜II」 before 「DPL新横浜」)
  for (const d of [...dpl].sort((a, b) => b.name.length - a.name.length)) if (d.muni && title.includes(d.name) && !ms.includes(d.muni)) { ms.push(d.muni); break; }
  // a municipality implies its prefecture
  for (const c of ms) if (!prefs.includes(Number(c.slice(0, 2)))) prefs.push(Number(c.slice(0, 2)));
  return { topics: TOPICS.filter((tp) => tp.re.test(title)).map((tp) => tp.key), prefs: prefs.sort((a, b) => a - b), munis: ms };
}

// ------------------------------------------------------------------ fetch + parse (RSS 1.0 / 2.0)
const tag = (s, t) => {
  const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)) : '';
};
function parseDate(s) {
  if (!s) return null;
  // e-Gov writes "2026-09-24T15:00:Z" (no seconds)
  const fixed = s.trim().replace(/T(\d{2}):(\d{2}):Z$/, 'T$1:$2:00Z');
  const d = new Date(fixed);
  return isNaN(+d) ? null : d;
}
async function fetchSource(src) {
  const r = await fetch(src.url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const text = new TextDecoder(src.encoding ?? 'utf-8').decode(buf);
  const now = new Date();
  return [...text.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map((m) => {
    const x = m[0];
    const title = norm(tag(x, 'title'));
    const link = norm(tag(x, 'link')).replace(/^http:\/\//, 'https://');
    let date = parseDate(tag(x, 'dc:date') || tag(x, 'pubDate'));
    if (date && date > now) date = now; // some feeds carry future dates
    return { title, link, date, desc: norm(tag(x, 'description')) };
  }).filter((it) => it.title && it.link && it.date);
}

// ------------------------------------------------------------------ previews
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
/** first sentence(s) of a lead, cut to EXCERPT characters */
function excerpt(text) {
  const s = norm(decode(text))
    .replace(/\[表: [^\]]*\]|\[画像[^\]]*\]|^\[[^\]]*\]\s*/g, '')   // PR TIMES: 「[会社名]」「[表: url]」
    .replace(/[(（][^()（）]*(本社|所在|代表|社長|CEO)[^()（）]*([)）]|$)/g, '')   // head-office boilerplate (NFKC: （） → ())
    .replace(/(以下|、以下)「[^」]*」/g, '').trim();
  if (!s) return '';
  return s.length > EXCERPT ? `${s.slice(0, EXCERPT - 1)}…` : s;
}
/** PR TIMES og:image, resized by the PR TIMES CDN to a card-sized preview */
function prtimesImage(html) {
  const m = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!m || !/prcdn|prtimes/.test(m[1])) return null;
  const u = new URL(decode(m[1]));
  u.searchParams.set('width', '480'); u.searchParams.set('height', '320'); u.searchParams.set('fit', 'bounds');
  return u.toString();
}
/** lead paragraph of a press page: the first sentence-like line after the headline */
function leadOf(html, title) {
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/h\d>/g, '\n').replace(/<[^>]+>/g, ''));
  const lines = text.split('\n').map((l) => norm(l)).filter(Boolean);
  const start = Math.max(0, lines.findIndex((l) => l.includes(norm(title).slice(0, 12))));
  return lines.slice(start + 1).find((l) => l.length > 40 && /。/.test(l) && !/Copyright|JavaScript|Cookie/.test(l)) ?? '';
}
/** 延床面積 in m² from a release page (「延床面積：約120,512.35㎡（36,454坪）」), null when not given */
function floorOf(html) {
  const s = norm(decode(html.replace(/<[^>]+>/g, ' ')));
  const m = s.match(/延(床|べ)面積[^0-9約]{0,12}約?\s*([\d,.]+)\s*(万)?\s*(㎡|m2|m²|平方メートル|坪)/);
  if (!m) return null;
  let v = Number(m[2].replace(/,/g, '')) * (m[3] ? 1e4 : 1);
  if (m[4] === '坪') v *= 3.305785;
  return v > 500 && v < 2e6 ? Math.round(v) : null;
}
let pageFetches = 0;
async function preview(it, srcKey, desc) {
  const out = {};
  if (desc) out.ex = excerpt(desc);
  const isPr = /prtimes\.jp/.test(it.link);
  if ((out.ex && !isPr) || pageFetches >= MAX_PAGE_FETCHES) return out;
  try {
    pageFetches++;
    const r = await fetch(it.link, { headers: { 'User-Agent': UA } });
    if (r.ok) {
      const html = new TextDecoder('utf-8').decode(Buffer.from(await r.arrayBuffer()));
      // img: null = looked, none; missing = not looked yet (retried on the next run)
      if (isPr) out.img = prtimesImage(html);
      out.floor = floorOf(html);
      if (!out.ex) out.ex = excerpt(leadOf(html, it.t));
    }
    await sleep(400);
  } catch { /* keep what we have */ }
  return out;
}

const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { items: [] };
// re-apply the current source rules to the archive (sources may be disabled or filters tightened)
const rules = new Map(SOURCES.filter((s) => s.enabled).map((s) => [s.key, s.keep]));
const byLink = new Map(prev.items
  .filter((it) => rules.has(it.src) && rules.get(it.src)({ title: it.t, link: it.link, desc: '' }))
  .map((it) => [it.link, it]));
const report = [];
for (const src of SOURCES.filter((s) => s.enabled)) {
  try {
    const items = await fetchSource(src);
    const kept = items.filter((it) => src.keep(it));
    for (const it of kept) {
      if (it.date.toISOString().slice(0, 10) < cutoff) continue; // outside the archive window: no preview fetch
      const old = byLink.get(it.link);
      const base = { t: it.title, link: it.link, date: it.date.toISOString().slice(0, 10), src: src.key };
      // previews are fetched once per item and kept in the archive
      const done = old && 'ex' in old && (!/prtimes\.jp/.test(it.link) || 'img' in old);
      const pv = done ? { ex: old.ex, img: old.img, floor: old.floor } : await preview(base, src.key, it.desc || '');
      byLink.set(it.link, { ...base, ex: pv.ex || old?.ex || '', ...(pv.img !== undefined ? { img: pv.img } : old && 'img' in old ? { img: old.img } : {}),
                            ...(pv.floor !== undefined ? { floor: pv.floor } : old && 'floor' in old ? { floor: old.floor } : {}) });
    }
    report.push(`${src.key}: ${kept.length}/${items.length}`);
  } catch (e) {
    report.push(`${src.key}: FAILED (${e.message}) — keeping previous items`);
  }
}
// tags are recomputed for the whole archive, so improvements to the rules apply to old items too
for (const [k, it] of byLink) {
  // archive items from before previews existed get one now (limited per run)
  // facility releases also want the floor area (read from the page once)
  const done = 'ex' in it && (!/prtimes\.jp/.test(it.link) || 'img' in it) && (!facilityOf(it.t) || 'floor' in it);
  const pv = done ? {} : await preview(it, it.src, '');
  const ex = pv.ex || it.ex || '';
  const img = pv.img !== undefined ? pv.img : it.img;
  const floor = pv.floor !== undefined ? pv.floor : it.floor;
  byLink.set(k, { ...it, ex, ...(img !== undefined ? { img } : {}), ...(floor !== undefined ? { floor } : {}), ...tagsOf(it.t, ex) });
}

const items = [...byLink.values()].filter((it) => it.date >= cutoff)
  .sort((a, b) => b.date.localeCompare(a.date) || a.t.localeCompare(b.t)).slice(0, MAX_ITEMS);
writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString(),
  sources: SOURCES.filter((s) => s.enabled).map(({ key, ja, en, url, terms, group }) => ({ key, ja, en, url, terms, group: group ?? 'public' })),
  topics: TOPICS.map(({ key, ja, en }) => ({ key, ja, en })),
  items,
}));
// ------------------------------------------------------------------ facility registry
// Logistics facilities of other developers named in the releases (DPL has its own layer), with the
// stages seen so far. Cumulative: entries are never dropped when their news leaves the archive.
{
  const FAC = resolve(root, 'public/data/facilities.json');
  // 「プロロジスパーク北本」「ロジスクエア朝霞B」: the place is in the name without 市・町・村 — an
  // unambiguous stripped name (in the item's prefecture when it names one) places the facility
  const stripped = new Map();
  const topoNames = new Map(JSON.parse(readFileSync(resolve(root, 'public/geo/japan.topo.json'), 'utf8')).objects.muni.geometries.map((g) => [String(g.id), g.properties.n]));
  for (const { name, codes } of munis) {
    const s = name.replace(/(市|町|村|区)$/, '');
    if (s.length < 2 || /^(中央|東|西|南|北|港|緑|青葉)$/.test(s) || PREFS.includes(s)) continue;
    // a designated city stands for one of its wards: no single place (「千葉ニュータウン」 is not in 千葉市)
    if (name.endsWith('市') && codes.some((c) => topoNames.get(c) !== name)) continue;
    stripped.set(s, [...(stripped.get(s) ?? []), ...codes]);
  }
  const placeFromName = (fname, brand, prefs) => {
    const rest = fname.replace(brand, '');
    const hits = [];
    for (const [s, codes] of stripped) if (rest.includes(s)) hits.push(...codes.filter((c) => !prefs.length || prefs.includes(Number(c.slice(0, 2)))));
    const uniq = [...new Set(hits)];
    return uniq.length === 1 ? uniq[0] : '';
  };
  const reg = new Map((existsSync(FAC) ? JSON.parse(readFileSync(FAC, 'utf8')).items : []).map((f) => [f.name, f]));
  for (const it of items) {
    const f = facilityOf(it.t);
    if (!f || f.brand === 'DPL') continue;
    const cur = reg.get(f.name) ?? { name: f.name, brand: f.brand, src: it.src, muni: '', pref: 0, floor: null, events: [] };
    if (!cur.muni && it.munis.length) cur.muni = it.munis[0];
    if (!cur.muni) cur.muni = placeFromName(f.name, f.brand, it.prefs);
    if (cur.muni && !cur.pref) cur.pref = Number(cur.muni.slice(0, 2));
    if (!cur.pref && it.prefs.length) cur.pref = it.prefs[0];
    if (!cur.floor && it.floor) cur.floor = it.floor;
    if (!cur.events.some((e) => e.link === it.link)) cur.events.push({ stage: stageOf(it.t) ?? 'other', date: it.date, link: it.link, t: it.t });
    cur.events.sort((a, b) => a.date.localeCompare(b.date));
    reg.set(f.name, cur);
  }
  // exact position: the facility's 所在地 from its latest release, geocoded with the GSI address search
  // (once per facility; `geo: false` = tried, not found). The company's own head office — the
  // address followed by 電話番号, or on a floor (…階) — is skipped.
  let geocoded = 0;
  for (const f of reg.values()) {
    if (f.ll || f.geo === false || geocoded >= 20) continue;
    geocoded++;
    try {
      const html = await (await fetch(f.events.at(-1).link, { headers: { 'User-Agent': UA } })).text();
      const text = norm(decode(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')));
      const addrs = [...text.matchAll(/(?:所在地|建設地|計画地)\s*[:：]?\s*((?:北海道|東京都|京都府|大阪府|.{2,3}県).{2,40}?)(?=\s+(?:https?:|敷地|延床|用途|構造|電話|代表|竣工|着工|規模|交通|アクセス|最寄)|[、。（(・]|$)/g)]
        .map((m) => m[1].trim()).filter((a) => !/階|ビル|タワー|Tower/.test(a));
      const pick = addrs.find((a) => !f.pref || a.startsWith(PREFS[f.pref - 1])) ?? addrs[0];
      if (!pick) { f.geo = false; continue; }
      const res = await (await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(pick)}`)).json();
      const c = res?.[0]?.geometry?.coordinates;
      if (!c) { f.geo = false; continue; }
      const rev = await (await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${c[1]}&lon=${c[0]}`)).json();
      const mc = String(rev?.results?.muniCd ?? '').padStart(5, '0');
      // a release can name several facilities: the address must agree with a place in the facility's own name
      const fromName = placeFromName(f.name, f.brand, []);
      if (fromName && /^\d{5}$/.test(mc) && fromName !== mc) { f.geo = false; f.muni = fromName; f.pref = Number(fromName.slice(0, 2)); continue; }
      f.ll = [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
      f.addr = pick;
      if (/^\d{5}$/.test(mc) && mc !== '00000') { f.muni = mc; f.pref = Number(mc.slice(0, 2)); }
      await sleep(400);
    } catch { /* next run */ }
  }
  // hand corrections (data/facilities-overrides.json: { "<name>": { "ll": [lon, lat], "muni": "…", "floor": …, "hide": true } })
  const OVR = resolve(root, 'data/facilities-overrides.json');
  const overrides = existsSync(OVR) ? JSON.parse(readFileSync(OVR, 'utf8')) : {};
  for (const [name, o] of Object.entries(overrides)) if (reg.has(name)) Object.assign(reg.get(name), o);
  for (const [name, f] of reg) if (f.hide) reg.delete(name);
  const list = [...reg.values()].sort((a, b) => b.events.at(-1).date.localeCompare(a.events.at(-1).date));
  writeFileSync(FAC, JSON.stringify({ generated: new Date().toISOString(), note: 'facilities named in developer releases (fetch-news.mjs); cumulative', items: list }));
  console.log(`facilities.json: ${list.length} facilities, ${list.filter((f) => f.ll).length} geocoded, ${list.filter((f) => f.muni).length} with a municipality, ${list.filter((f) => f.floor).length} with floor area`);
}
console.log(`news.json: ${items.length} items, ${items.filter((i) => i.munis.length).length} with a municipality, ${items.filter((i) => i.img).length} with an image (${report.join(', ')})`);
