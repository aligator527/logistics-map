// Related news: the same facility (with its timeline), the same series or developer, the same
// place, or the same topic in the same region. Everything is read from the headline and tags.

export interface NewsLite {
  t: string;
  link: string;
  date: string;
  /** source key and display name; developers' own releases count as "the same company" */
  src: string;
  srcName: string;
  developer: boolean;
  topics: string[];
  prefs: number[];
  munis: string[];
}
export type Reason = 'facility' | 'series' | 'company' | 'place' | 'area' | 'topic';
export interface Related { it: NewsLite; reason: Reason }

// logistics-facility brands (NFKC; 「LOGI’Q」 has a curly apostrophe in some releases)
const BRAND = /(DPL|MFLP|プロロジスパーク|ロジスクエア|LOGI'?Q|LOGI FLAG(?: COLD)?|LOGIFRONT|Landport|ロジスタ|ロジクロス|GLP|ESR|SOSiLA|T-LOGI)/;
const STAGES: [RegExp, string][] = [
  [/開発(を)?決定|開発計画|用地(を)?取得|取得/, 'plan'],
  [/着工|起工|地鎮祭/, 'start'],
  [/上棟/, 'topout'],
  [/竣工|完成|完工/, 'done'],
  [/内覧会|見学会/, 'viewing'],
  [/入居|稼働|開設|オープン|運用開始/, 'open'],
  [/売却|譲渡/, 'sale'],
];
const norm = (s: string) => s.normalize('NFKC').replace(/[’‘]/g, "'");

/** facility named in a headline: the quoted name with a brand, else a brand followed by a name */
export function facilityOf(title: string): { name: string; brand: string } | null {
  const s = norm(title);
  for (const m of s.matchAll(/[「『]([^」』]{2,40})[」』]/g)) {
    const b = m[1].match(BRAND);
    if (!b) continue;
    // 「DPL小牧施設見学会&…」 → DPL小牧; a series name alone (「LOGI'Q」「LOGIFRONT(ロジフロント)」) is no facility
    const name = m[1].replace(/\(仮称\)|\s+/g, '').replace(/(施設)?(見学会|内覧会|&).*$/, '');
    const own = name.replace(/\([^)]*\)/g, '').replace(new RegExp(BRAND.source.replace(/\\s\?|\(\?: COLD\)\?/g, '').replace(/ /g, '')), '');
    if (own.length >= 2 && !/^(シリーズ|ロジフロント|ロジック)$|ロジスティクスパーク$/.test(own)) return { name, brand: b[1].replace(/ COLD$/, '') };
  }
  const m = s.match(new RegExp(`${BRAND.source}\\s?([^\\s、。「」『』()【】・]{1,20})`));
  if (!m) return null;
  const rest = m[2].replace(/(着工|起工|竣工|完成|上棟|稼働|開設|入居|内覧会|売却|取得|を|が|に|の|へ|で|が).*$/, '');
  return rest ? { name: `${m[1]}${rest}`.replace(/\s+/g, ''), brand: m[1].replace(/ COLD$/, '') } : null;
}
export function stageOf(title: string): string | null {
  const s = norm(title);
  for (const [re, k] of STAGES) if (re.test(s)) return k;
  return null;
}

/** 地方 of a prefecture (1 北海道 … 8 九州・沖縄) */
const region = (p: number) => (p === 1 ? 1 : p <= 7 ? 2 : p <= 14 ? 3 : p <= 23 ? 4 : p <= 30 ? 5 : p <= 35 ? 6 : p <= 39 ? 7 : 8);

const SCORE: Record<Reason, number> = { facility: 100, series: 50, company: 40, place: 35, area: 20, topic: 10 };

/** up to n related items, the strongest reason first, then the most recent */
export function relatedOf(it: NewsLite, all: NewsLite[], n = 5): Related[] {
  const fac = facilityOf(it.t);
  const out: (Related & { s: number })[] = [];
  for (const o of all) {
    if (o.link === it.link || o.t === it.t) continue;
    let reason: Reason | null = null;
    const of = facilityOf(o.t);
    if (fac && of && of.name === fac.name) reason = 'facility';
    else if (fac && of && of.brand === fac.brand) reason = 'series';
    else if (it.developer && o.src === it.src) reason = 'company';
    else if (it.munis.some((c) => o.munis.includes(c))) reason = 'place';
    else if (it.prefs.some((p) => o.prefs.includes(p))) reason = 'area';
    else if (it.topics.some((k) => o.topics.includes(k)) && it.prefs.some((p) => o.prefs.some((q) => region(q) === region(p)))) reason = 'topic';
    if (!reason) continue;
    // a small recency bonus orders items within the same reason
    const age = Math.abs(Date.parse(it.date) - Date.parse(o.date)) / 864e5;
    out.push({ it: o, reason, s: SCORE[reason] - Math.min(age, 365) / 40 });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, n).map(({ it, reason }) => ({ it, reason }));
}

/** every item about the same facility, oldest first (only when there are two or more) */
export function timelineOf(it: NewsLite, all: NewsLite[]): NewsLite[] {
  const fac = facilityOf(it.t);
  if (!fac) return [];
  const same = all.filter((o) => facilityOf(o.t)?.name === fac.name);
  const seen = new Set<string>();
  const list = same.filter((o) => (seen.has(o.t) ? false : (seen.add(o.t), true))).sort((a, b) => a.date.localeCompare(b.date));
  return list.length >= 2 ? list : [];
}

/** the map place of an item (as in the news groups): first municipality, else prefecture, else national */
export const placeKey = (it: { munis: string[]; prefs: number[] }) =>
  it.munis.length ? `m${it.munis[0]}` : it.prefs.length ? `p${String(it.prefs[0]).padStart(2, '0')}` : 'jp';
