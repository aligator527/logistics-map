// News feed -> public/data/news.json (headline, date, link, source, topic and prefecture tags)
//
//   node scripts/fetch-news.mjs
//
// Runs daily in GitHub Actions (.github/workflows/update-news.yml). Only headlines and links are
// stored — never article bodies or descriptions. The file is a rolling archive: new items are
// merged with the previous run (feeds such as MLIT cover only ~2 days), deduplicated by link and
// kept for KEEP_DAYS.
//
// Sources are chosen by their terms of use (see SOURCES[].terms). Trade media reserve reuse and
// ask commercial sites for permission, so they are listed but disabled until permission is given.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'public/data/news.json');
const KEEP_DAYS = 180, MAX_ITEMS = 400;
const UA = 'Mozilla/5.0 (compatible; logistics-map news fetcher; +https://github.com/aligator527)';
const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

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
    terms: 'https://prtimes.jp/main/html/kiyaku (営利目的の無断利用は不可 — 非営利の範囲で使用)',
    keep: (it) => /DPL|物流|倉庫|ロジスティクス/.test(it.title),
  },
  // --- trade media: disabled until the publisher allows headline links (see their terms)
  { key: 'lnews', ja: 'LNEWS', en: 'LNEWS', enabled: false, url: 'https://www.lnews.jp/institution/feed',
    terms: 'https://www.lnews.jp/contents/appropriation.html', keep: (it) => !/^【PR】/.test(it.title) },
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
  ? JSON.parse(readFileSync(resolve(root, 'public/data/dpl.json'), 'utf8')).sites.map((s) => ({ name: norm(s.name), pref: s.pref }))
  : [];
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
      byLink.set(it.link, {
        t: it.title,
        link: it.link,
        date: it.date.toISOString().slice(0, 10),
        src: src.key,
        topics: TOPICS.filter((tp) => tp.re.test(it.title)).map((tp) => tp.key),
        prefs: prefsOf(it.title),
      });
    }
    report.push(`${src.key}: ${kept.length}/${items.length}`);
  } catch (e) {
    report.push(`${src.key}: FAILED (${e.message}) — keeping previous items`);
  }
}
const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
const items = [...byLink.values()].filter((it) => it.date >= cutoff)
  .sort((a, b) => b.date.localeCompare(a.date) || a.t.localeCompare(b.t)).slice(0, MAX_ITEMS);
writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString(),
  sources: SOURCES.filter((s) => s.enabled).map(({ key, ja, en, url, terms }) => ({ key, ja, en, url, terms })),
  topics: TOPICS.map(({ key, ja, en }) => ({ key, ja, en })),
  items,
}));
console.log(`news.json: ${items.length} items (${report.join(', ')})`);
