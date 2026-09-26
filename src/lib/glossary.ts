// Short explanations of Japanese terms used on the map (shown as tooltips and in the 用語 list).
// Keys are the Japanese terms as they appear in labels; longer terms first when matching.
import type { Lang } from './i18n';

export interface Term { ja: string; en: string; read?: string; def: { ja: string; en: string }; layers?: string[] }

export const GLOSSARY: Term[] = [
  { ja: '営業倉庫', en: 'Commercial warehouse', read: 'eigyō sōko', layers: ['warehouse'],
    def: { ja: '倉庫業法の登録を受け、他人の物品を保管する倉庫。統計は普通倉庫1〜3類。', en: 'A warehouse registered under the Warehousing Business Act that stores goods for others; the statistics cover ordinary warehouses, classes 1–3.' } },
  { ja: '所管面積', en: 'Floor area in operation', layers: ['warehouse'],
    def: { ja: '登録された営業倉庫の床面積の合計（四半期末）。', en: 'Total registered floor area of commercial warehouses at the end of the quarter.' } },
  { ja: '空面積率', en: 'Vacancy rate', layers: ['warehouse'],
    def: { ja: '所管面積のうち貨物が置かれていない面積の割合。低いほど逼迫。', en: 'Share of the floor area without cargo; the lower, the tighter the market.' } },
  { ja: '入庫高', en: 'Inbound tonnage', layers: ['warehouse'],
    def: { ja: '四半期の3か月に倉庫へ入った貨物の量（トン）。', en: 'Tonnes of cargo taken into warehouses during the quarter.' } },
  { ja: '保管残高', en: 'Stock held', layers: ['warehouse'],
    def: { ja: '四半期末に倉庫に保管されている貨物の量（トン）。', en: 'Tonnes of cargo held in warehouses at the end of the quarter.' } },
  { ja: '物流センサス', en: 'Logistics Census', layers: ['flows'],
    def: { ja: '国土交通省の全国貨物純流動調査。5年ごと、荷主側から見た貨物の流れ。', en: 'MLIT’s nationwide net freight flow survey, every five years, seen from the shipper.' } },
  { ja: '有効求人倍率', en: 'Jobs-to-applicants ratio', layers: ['labour', 'score'],
    def: { ja: '求職者1人あたりの求人数。1を超えると人手不足、採用しにくい。', en: 'Job openings per job seeker; above 1 means labour is short and hiring is hard.' } },
  { ja: '特定技能', en: 'Specified Skilled Worker', layers: ['labour'],
    def: { ja: '人手不足分野で外国人が働ける在留資格。自動車運送業は2024年、物流倉庫は2026年に追加。', en: 'Residence status for foreign workers in short-staffed fields; trucking was added in 2024, warehousing in 2026.' } },
  { ja: '育成就労', en: 'Employment for Skill Development', layers: ['labour'],
    def: { ja: '技能実習に代わる制度（2027年4月開始）。', en: 'The scheme replacing the Technical Intern Training Program (from April 2027).' } },
  { ja: '2024年問題', en: 'The 2024 problem', layers: ['labour', 'local'],
    def: { ja: '2024年4月からのトラック運転者の時間外労働の上限規制で輸送力が不足する問題。', en: 'Transport capacity shortfall caused by the overtime cap for truck drivers from April 2024.' } },
  { ja: '改善基準告示', en: 'Working-time standards for drivers', layers: ['local'],
    def: { ja: 'トラック運転者の拘束時間（1日13時間原則）・運転時間（2日平均9時間）・休憩のルール。', en: 'Rules for truck drivers: 13 h on duty a day as a rule, 9 h driving (two-day average), breaks.' } },
  { ja: '拘束時間', en: 'Time on duty', layers: ['local'],
    def: { ja: '始業から終業まで（休憩を含む）。', en: 'From the start to the end of the working day, breaks included.' } },
  { ja: '中継', en: 'Relay transport', layers: ['local'],
    def: { ja: '途中で運転者やトレーラーを交代して長距離を運ぶ方式（中継輸送）。', en: 'Long hauls split between drivers or tractors at a relay point.' } },
  { ja: '用途地域', en: 'Zoning district', layers: ['local', 'score'],
    def: { ja: '都市計画で定める土地利用の区分（13種類）。倉庫が建てやすいのは準工業・工業・工業専用地域など。', en: 'Land-use districts set in the city plan (13 kinds); warehouses fit best in light-industrial, industrial and exclusively industrial zones.' } },
  { ja: '工業専用地域', en: 'Exclusively industrial zone', layers: ['local'],
    def: { ja: '工業のための地域。住宅は建てられない。', en: 'Zone for industry only; no housing.' } },
  { ja: '準工業地域', en: 'Light-industrial zone', layers: ['local'],
    def: { ja: '環境悪化のおそれが少ない工業・倉庫と住宅が混在できる地域。', en: 'Zone where low-impact industry and warehouses mix with housing.' } },
  { ja: '市街化調整区域', en: 'Urbanisation control area', layers: ['local'],
    def: { ja: '市街化を抑える区域。倉庫の新設は開発許可が必要で原則難しい。', en: 'Area where urban development is restrained; a new warehouse needs a development permit and is usually hard.' } },
  { ja: '市街化区域', en: 'Urbanisation promotion area', layers: ['local'],
    def: { ja: '市街化を進める区域。用途地域が定められる。', en: 'Area where urban development is promoted; zoning districts apply.' } },
  { ja: '想定最大規模', en: 'Maximum-scenario', layers: ['local', 'score'],
    def: { ja: '想定し得る最大規模の降雨（概ね千年に1度）による浸水想定。', en: 'Flooding assumed for the largest conceivable rainfall (roughly once in 1,000 years).' } },
  { ja: '土砂災害警戒区域', en: 'Landslide-warning zone', layers: ['local', 'score'],
    def: { ja: '土砂災害のおそれがあるとして都道府県が指定した区域（イエローゾーン）。', en: 'Area designated by the prefecture as at risk of landslides (“yellow zone”).' } },
  { ja: '高潮', en: 'Storm surge', layers: ['local', 'now'],
    def: { ja: '台風などで海面が上昇し、沿岸が浸水する現象。', en: 'Sea level driven up by a typhoon or low pressure, flooding the coast.' } },
  { ja: '震度6弱', en: 'Seismic intensity 6-lower', layers: ['local', 'score'],
    def: { ja: '気象庁震度階級。固定していない家具の多くが移動・転倒する揺れ。', en: 'JMA intensity scale: most unsecured furniture moves or falls.' } },
  { ja: '危険警報', en: 'Danger warning', layers: ['now'],
    def: { ja: '2026年からの防災気象情報の警戒レベル4。危険な場所からの避難が必要。', en: 'Alert level 4 of the 2026 weather warning system: leave dangerous places.' } },
  { ja: '特別警報', en: 'Emergency warning', layers: ['now'],
    def: { ja: '警戒レベル5相当。数十年に一度の現象で、命を守る行動が必要。', en: 'Alert level 5: once-in-decades event, act to save lives.' } },
  { ja: '指定河川洪水予報', en: 'Designated-river flood forecast', layers: ['now'],
    def: { ja: '国・都道府県と気象庁が共同で発表する、指定された河川の氾濫の予報。', en: 'Flood forecast for designated rivers, issued by the river authority together with JMA.' } },
  { ja: 'マルチテナント型物流施設', en: 'Multi-tenant logistics facility', layers: ['warehouse'],
    def: { ja: '複数の企業が区画を賃借して使う大型の物流施設。', en: 'Large logistics building leased to several tenants in sections.' } },
  { ja: '延床面積', en: 'Gross floor area', layers: ['warehouse'],
    def: { ja: '建物の各階の床面積の合計。1坪≈3.306㎡。', en: 'Sum of the floor areas of all storeys; 1 tsubo ≈ 3.306 m².' } },
  { ja: 'スマートIC', en: 'Smart interchange', layers: ['warehouse', 'local'],
    def: { ja: 'ETC専用の簡易インターチェンジ。大型車が通れない所もある。', en: 'ETC-only interchange; some are closed to large trucks.' } },
  { ja: 'TEU', en: 'TEU', layers: ['local'],
    def: { ja: '20フィートコンテナ換算の個数。', en: 'Twenty-foot equivalent units, the standard count of containers.' } },
  { ja: '政令指定都市', en: 'Designated city', layers: ['local', 'score'],
    def: { ja: '人口50万人以上で区を置く市。地図では区ごとに表示。', en: 'City of 500,000+ divided into wards; the map shows each ward.' } },
];

const byLen = [...GLOSSARY].sort((a, b) => b.ja.length - a.ja.length);
/** split a label into text and glossary terms (each term marked once per label); in English the
 *  English names are matched too */
export function withTerms(text: string, lang: Lang = 'ja'): (string | Term)[] {
  const out: (string | Term)[] = [];
  let rest = text;
  const seen = new Set<string>();
  const find = (t: Term) => {
    const i = rest.indexOf(t.ja);
    if (i >= 0 || lang === 'ja' || t.en.length < 4) return { i, len: t.ja.length };
    const j = rest.toLowerCase().indexOf(t.en.toLowerCase());
    return { i: j, len: t.en.length };
  };
  while (rest) {
    let hit: { i: number; len: number; t: Term } | null = null;
    for (const t of byLen) {
      if (seen.has(t.ja)) continue;
      const f = find(t);
      if (f.i >= 0 && (!hit || f.i < hit.i)) hit = { ...f, t };
    }
    if (!hit) { out.push(rest); break; }
    if (hit.i) out.push(rest.slice(0, hit.i));
    out.push({ ...hit.t, shown: rest.slice(hit.i, hit.i + hit.len) } as Term & { shown: string });
    seen.add(hit.t.ja);
    rest = rest.slice(hit.i + hit.len);
  }
  return out;
}
export const termsFor = (layer: string) => GLOSSARY.filter((t) => t.layers?.includes(layer));
export const termLabel = (t: Term, lang: Lang) => (lang === 'ja' ? t.ja : `${t.en} (${t.ja})`);
