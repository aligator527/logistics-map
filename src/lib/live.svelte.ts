// Live data from the Japan Meteorological Agency (bosai JSON, CORS allowed), fetched by the browser:
// weather warnings by municipality, recent earthquakes and active typhoons. Polling runs only while
// `start()` is active and the tab is visible. Source: 気象庁ホームページ (公共データ利用規約 1.0);
// warnings are relayed as published, not modified (気象業務法).

const JMA = 'https://www.jma.go.jp/bosai';

/** warning / advisory codes of the 2026 system (大雨 03 = L3 警報, 43 = L4 危険警報, 33 = L5 特別警報 …) */
export const WARN: Record<string, { ja: string; en: string; level: 2 | 3 | 4 | 5 }> = {
  '10': { ja: '大雨注意報', en: 'Heavy rain advisory', level: 2 }, '03': { ja: '大雨警報', en: 'Heavy rain warning', level: 3 },
  '43': { ja: '大雨危険警報', en: 'Heavy rain danger warning', level: 4 }, '33': { ja: '大雨特別警報', en: 'Heavy rain emergency warning', level: 5 },
  '29': { ja: '土砂災害注意報', en: 'Landslide advisory', level: 2 }, '09': { ja: '土砂災害警報', en: 'Landslide warning', level: 3 },
  '49': { ja: '土砂災害危険警報', en: 'Landslide danger warning', level: 4 }, '39': { ja: '土砂災害特別警報', en: 'Landslide emergency warning', level: 5 },
  '19': { ja: '高潮注意報', en: 'Storm surge advisory', level: 2 }, '08': { ja: '高潮警報', en: 'Storm surge warning', level: 3 },
  '48': { ja: '高潮危険警報', en: 'Storm surge danger warning', level: 4 }, '38': { ja: '高潮特別警報', en: 'Storm surge emergency warning', level: 5 },
  '15': { ja: '強風注意報', en: 'Gale advisory', level: 2 }, '05': { ja: '暴風警報', en: 'Storm warning', level: 3 }, '35': { ja: '暴風特別警報', en: 'Storm emergency warning', level: 5 },
  '13': { ja: '風雪注意報', en: 'Snowstorm advisory', level: 2 }, '02': { ja: '暴風雪警報', en: 'Blizzard warning', level: 3 }, '32': { ja: '暴風雪特別警報', en: 'Blizzard emergency warning', level: 5 },
  '12': { ja: '大雪注意報', en: 'Heavy snow advisory', level: 2 }, '06': { ja: '大雪警報', en: 'Heavy snow warning', level: 3 }, '36': { ja: '大雪特別警報', en: 'Heavy snow emergency warning', level: 5 },
  '16': { ja: '波浪注意報', en: 'High wave advisory', level: 2 }, '07': { ja: '波浪警報', en: 'High wave warning', level: 3 }, '37': { ja: '波浪特別警報', en: 'High wave emergency warning', level: 5 },
  '14': { ja: '雷注意報', en: 'Thunderstorm advisory', level: 2 }, '17': { ja: '融雪注意報', en: 'Snowmelt advisory', level: 2 },
  '20': { ja: '濃霧注意報', en: 'Dense fog advisory', level: 2 }, '21': { ja: '乾燥注意報', en: 'Dry air advisory', level: 2 },
  '22': { ja: 'なだれ注意報', en: 'Avalanche advisory', level: 2 }, '23': { ja: '低温注意報', en: 'Low temperature advisory', level: 2 },
  '24': { ja: '霜注意報', en: 'Frost advisory', level: 2 }, '25': { ja: '着氷注意報', en: 'Icing advisory', level: 2 }, '26': { ja: '着雪注意報', en: 'Snow accretion advisory', level: 2 },
  // designated-river flood forecasts (指定河川洪水予報), mapped onto the areas along the river
  F2: { ja: '氾濫注意報', en: 'River flood advisory', level: 2 }, F3: { ja: '氾濫警報', en: 'River flood warning', level: 3 },
  F4: { ja: '氾濫危険警報', en: 'River flood danger warning', level: 4 }, F5: { ja: '氾濫特別警報', en: 'River flood emergency warning', level: 5 },
};
/** 指定河川洪水予報 item code -> level (as JMA's own page reads them) */
const floodLevel = (c: string) => (['50', '51', '52', '53'].includes(c) ? 5 : ['40', '41'].includes(c) ? 4 : ['30', '31'].includes(c) ? 3 : ['20', '21', '22'].includes(c) ? 2 : 0);
export interface RiverFlood { river: string; level: number; name: string; at: string; munis: string[] }
/** codes that matter for road freight (rain, landslide, surge, wind, snow, waves, fog) */
export const LOGISTICS_CODES = new Set(['F2', 'F3', 'F4', 'F5', '10', '03', '43', '33', '29', '09', '49', '39', '19', '08', '48', '38', '15', '05', '35', '13', '02', '32', '12', '06', '36', '16', '07', '37', '20', '22', '25', '26']);

export interface Quake { eid: string; at: string; name: string; lat: number; lon: number; depth: number | null; mag: number | null; maxi: string }
export interface Typhoon {
  id: string; number: string; name: { jp: string; en: string }; category: string;
  pos: [number, number] | null; pressure: string; wind: string; gust: string; location: string; course: string; speed: string;
  galeKm: number; stormKm: number; past: [number, number][]; forecast: [number, number][]; time: string;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${JMA}/${path}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}
const intensityRank = (s: string) => ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'].indexOf(s);

class Live {
  /** municipality code -> active warning codes */
  warnings = $state.raw(new Map<string, string[]>());
  warnTime = $state<string | null>(null);
  /** rivers under a flood forecast now (level 2+) */
  rivers = $state.raw<RiverFlood[]>([]);
  /** weather warnings only; `warnings` adds the river floods */
  private weather = new Map<string, string[]>();
  quakes = $state.raw<Quake[]>([]);
  typhoons = $state.raw<Typhoon[]>([]);
  error = $state<string | null>(null);
  loading = $state(false);
  /** JMA class20 area -> municipality codes (public/data/jma-areas.json) */
  private areas: Record<string, string[]> | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private lastControl = '';
  private users = 0;

  start() {
    if (this.users++ > 0) return;
    const tick = () => { if (document.visibilityState === 'visible') this.refresh(); };
    tick();
    this.timers.push(setInterval(tick, 90_000));
    document.addEventListener('visibilitychange', tick);
    this.stopVis = () => document.removeEventListener('visibilitychange', tick);
  }
  private stopVis = () => {};
  stop() {
    if (--this.users > 0) return;
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.stopVis();
  }

  private lastQuake = 0;
  private lastTyphoon = 0;
  async refresh() {
    this.loading = true;
    try {
      await this.loadWarnings();
      await this.loadRivers();
      if (Date.now() - this.lastQuake > 180_000) { this.lastQuake = Date.now(); await this.loadQuakes(); }
      if (Date.now() - this.lastTyphoon > 900_000) { this.lastTyphoon = Date.now(); await this.loadTyphoons(); }
      this.error = null;
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
    }
  }

  private async loadWarnings() {
    const t = await get<{ latestControlDatetime: string }>('warning/data/r8/map_time.json');
    if (t.latestControlDatetime === this.lastControl) return;
    this.areas ??= await (await fetch(`${import.meta.env.BASE_URL}data/jma-areas.json`)).json();
    const reports = await get<{ warning?: { class20Items?: { areaCode: string; kinds: { code?: string; status: string }[] }[] } }[]>('warning/data/r8/map.json');
    const byArea = new Map<string, Set<string>>();
    for (const rep of reports) {
      for (const it of rep.warning?.class20Items ?? []) {
        const set = byArea.get(it.areaCode) ?? byArea.set(it.areaCode, new Set()).get(it.areaCode)!;
        for (const k of it.kinds) if (k.code && (k.status === '発表' || k.status === '継続')) set.add(k.code);
      }
    }
    const out = new Map<string, string[]>();
    for (const [area, codes] of byArea) {
      if (!codes.size) continue;
      for (const m of this.areas![area] ?? []) {
        const cur = new Set(out.get(m) ?? []);
        codes.forEach((c) => cur.add(c));
        out.set(m, [...cur].sort());
      }
    }
    this.weather = out;
    this.merge();
    this.warnTime = t.latestControlDatetime;
    this.lastControl = t.latestControlDatetime;
  }

  /** 指定河川洪水予報 (bosai/flood): small, fetched on every refresh */
  private async loadRivers() {
    this.areas ??= await (await fetch(`${import.meta.env.BASE_URL}data/jma-areas.json`)).json();
    const items = await get<{ infoType: string; riverName: string; item: { code: string; name: string }; reportDatetime: string; class20Codes?: string[] }[]>('flood/data/r8/flood_xml.json');
    const rivers: RiverFlood[] = [];
    for (const it of items) {
      const level = floodLevel(it.item?.code ?? '');
      if (it.infoType === '取消' || level < 2) continue;
      const munis = [...new Set((it.class20Codes ?? []).flatMap((a) => this.areas![a] ?? []))];
      rivers.push({ river: it.riverName, level, name: it.item.name, at: it.reportDatetime, munis });
    }
    this.rivers = rivers.sort((a, b) => b.level - a.level || a.river.localeCompare(b.river));
    this.merge();
  }
  private merge() {
    const out = new Map([...this.weather].map(([k, v]) => [k, [...v]]));
    for (const r of this.rivers) for (const m of r.munis) {
      const cur = out.get(m) ?? [];
      if (!cur.includes(`F${r.level}`)) out.set(m, [...cur, `F${r.level}`].sort());
    }
    this.warnings = out;
  }

  private async loadQuakes() {
    const list = await get<{ eid: string; at: string; anm: string; cod?: string; mag?: string; maxi?: string }[]>('quake/data/list.json');
    const byId = new Map<string, Quake>();
    const week = Date.now() - 7 * 864e5;
    for (const q of list) {
      const m = q.cod?.match(/^([+-][\d.]+)([+-][\d.]+)([+-]\d+)?/);
      if (!m || !q.maxi || new Date(q.at).getTime() < week) continue;
      if (intensityRank(q.maxi) < intensityRank('3')) continue;
      if (byId.has(q.eid)) continue; // the list is newest first: keep the latest report of each event
      byId.set(q.eid, { eid: q.eid, at: q.at, name: q.anm, lat: Number(m[1]), lon: Number(m[2]),
                        depth: m[3] ? Math.abs(Number(m[3])) / 1000 : null, mag: q.mag ? Number(q.mag) : null, maxi: q.maxi });
    }
    this.quakes = [...byId.values()];
  }

  private async loadTyphoons() {
    const targets = await get<{ tropicalCyclone: string; typhoonNumber?: string }[]>('typhoon/data/targetTc.json');
    const out: Typhoon[] = [];
    for (const tc of targets) {
      try {
        type Part = Record<string, unknown> & { part: unknown };
        const spec = await get<Part[]>(`typhoon/data/${tc.tropicalCyclone}/specifications.json`);
        const fc = await get<Part[]>(`typhoon/data/${tc.tropicalCyclone}/forecast.json`).catch(() => [] as Part[]);
        const title = spec.find((p) => p.part === 'title') as { typhoonNumber?: string; name?: { jp: string; en: string }; category?: { jp: string } } | undefined;
        const now = spec.find((p) => (p.part as { jp?: string })?.jp === '実況') as Record<string, never> | undefined;
        const pos = (now?.position as { deg?: [number, number] } | undefined)?.deg ?? null;
        const range = (arr: unknown) => Math.max(0, ...((arr as { range?: { km?: number } }[] | undefined) ?? []).map((g) => g.range?.km ?? 0));
        const forecast = spec.filter((p) => /予報/.test(String((p.part as { jp?: string })?.jp ?? '')))
          .map((p) => ((p as { position?: { deg?: [number, number] } }).position?.deg ?? (p as { center?: { deg?: [number, number] } }).center?.deg))
          .filter(Boolean) as [number, number][];
        const trackPart = fc.find((p) => (p as { track?: unknown }).track) as { track?: Record<string, [number, number][]> } | undefined;
        const past = [...(trackPart?.track?.preTyphoon ?? []), ...(trackPart?.track?.typhoon ?? [])];
        const w = now?.maximumWind as { sustained?: { 'm/s'?: string }; gust?: { 'm/s'?: string } } | undefined;
        out.push({
          id: tc.tropicalCyclone, number: title?.typhoonNumber ?? tc.typhoonNumber ?? '', name: title?.name ?? { jp: '', en: '' },
          category: title?.category?.jp ?? '', pos, pressure: String(now?.pressure ?? ''), wind: w?.sustained?.['m/s'] ?? '', gust: w?.gust?.['m/s'] ?? '',
          location: String(now?.location ?? ''), course: String(now?.course ?? ''), speed: String((now?.speed as { 'km/h'?: string } | undefined)?.['km/h'] ?? ''),
          galeKm: range(now?.galeWarning), stormKm: range(now?.stormWarning), past, forecast,
          time: String((now?.validtime as { JST?: string } | undefined)?.JST ?? ''),
        });
      } catch { /* skip a cyclone whose files are not ready */ }
    }
    this.typhoons = out;
  }

  /** highest warning level (0 = none, 2 = 注意報 … 5 = 特別警報) of a municipality */
  level(code: string, logisticsOnly = false): number {
    const cs = this.warnings.get(code);
    if (!cs) return 0;
    return Math.max(0, ...cs.filter((c) => !logisticsOnly || LOGISTICS_CODES.has(c)).map((c) => WARN[c]?.level ?? 2));
  }
}

export const live = new Live();

/** JMA seismic-intensity colours: fill, text */
export const INT_COLOR: Record<string, [string, string]> = {
  '3': ['#0041ff', '#fff'], '4': ['#fae696', '#111'], '5-': ['#ffe600', '#111'], '5+': ['#ff9900', '#111'],
  '6-': ['#ff2800', '#fff'], '6+': ['#a50021', '#fff'], '7': ['#b40068', '#fff'],
};

// JMA typhoon text in English: the 16-point course and "X の 南 約 210 km" positions
const DIRS: Record<string, string> = { 北: 'N', 北北東: 'NNE', 北東: 'NE', 東北東: 'ENE', 東: 'E', 東南東: 'ESE', 南東: 'SE', 南南東: 'SSE',
  南: 'S', 南南西: 'SSW', 南西: 'SW', 西南西: 'WSW', 西: 'W', 西北西: 'WNW', 北西: 'NW', 北北西: 'NNW' };
export function jmaCourse(s: string, lang: 'ja' | 'en') {
  if (lang === 'ja') return s;
  return DIRS[s] ?? (/停滞/.test(s) ? 'stationary' : /ゆっくり/.test(s) ? 'slowly' : s);
}
export function jmaLocation(s: string, lang: 'ja' | 'en') {
  if (lang === 'ja') return s;
  const m = s.match(/^(.+?)の(北北東|北東|東北東|東南東|南東|南南東|南南西|南西|西南西|西北西|北西|北北西|北|東|南|西)約?(\d+)(?:km|キロ)/);
  return m ? `about ${m[3]} km ${DIRS[m[2]]} of ${m[1]}` : s;
}
