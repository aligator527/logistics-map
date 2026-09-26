// Application state (Svelte 5 runes). Everything a viewer can change lives here and is
// mirrored into the URL hash, so any view can be bookmarked or shared.

import { detectLang, type Lang } from './i18n';
import { METRICS, type Metric, type Mode } from './data';

export type Theme = 'system' | 'light' | 'dark';
/** subject shown on the map */
export type Layer = 'warehouse' | 'flows' | 'labour' | 'score' | 'local' | 'now';
export type FlowBasis = 'annual' | 'day3';
export type FlowMetric = 'out' | 'in' | 'net' | 'intra';
export type LabourMetric = 'ssw' | 'jobs';
/** lists the hash is validated against */
export interface HashLists { quarters: string[]; flowYears: number[]; flowCuts: string[]; sswPeriods: string[]; sswFields: string[]; jobPeriods: string[]; criteria: string[]; localMetrics: string[] }

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : null;
  } catch {
    return null;
  }
}
function store(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode etc. */ }
}

export const SIDE_TABS = ['overview', 'screen', 'metrics', 'calc', 'short', 'news'] as const;
/** a screening condition: municipal metric ≥ / ≤ a value (in the metric's own units) */
export interface ScreenRule { key: string; op: 'ge' | 'le'; v: number }
export type SideTab = (typeof SIDE_TABS)[number];

class AppState {
  lang = $state<Lang>(readStored('lang', ['ja', 'en'] as const) ?? detectLang());
  theme = $state<Theme>(readStored('theme', ['system', 'light', 'dark'] as const) ?? 'system');
  systemDark = $state(false);

  layer = $state<Layer>('warehouse');

  // ---- warehouse
  metric = $state<Metric>('area');
  mode = $state<Mode>('value');
  /** quarter index into warehouse.quarters */
  q = $state(0);

  /** focused prefecture 1..47 — 0 = all of Japan */
  pref = $state(0);
  /** compare mode: prefectures A and B (0 = not chosen yet) */
  compare = $state(false);
  a = $state(0);
  b = $state(0);

  // ---- freight flows (物流センサス)
  flowYear = $state(2021);
  basis = $state<FlowBasis>('annual');
  /** 'all', a mode (3-day survey only) or a commodity group */
  cut = $state('all');
  fmetric = $state<FlowMetric>('out');
  /** national arcs: include flows between neighbouring prefectures */
  near = $state(false);

  // ---- labour
  lmetric = $state<LabourMetric>('ssw');
  /** index into ssw.periods */
  sp = $state(0);
  field = $state('total');
  /** index into jobs periods */
  jp = $state(0);
  /** occupation of the jobs ratio: drivers or cargo handling */
  occ = $state<'driver' | 'handling'>('driver');

  // ---- site score: weight 0..5 per criterion key (missing = default)
  weights = $state<Record<string, number>>({});
  /** preset the weights came from ('' = edited by hand) */
  preset = $state('balanced');
  /** score by prefecture or by municipality */
  slevel = $state<'pref' | 'muni'>('pref');
  /** selected municipality (5-digit code, municipal score) — '' = none */
  muni = $state('');
  /** municipal data explorer: indicator key */
  lmet = $state('pop2050');
  /** 現況: weather warnings (municipalities) or diesel price (prefectures) */
  nmet = $state<'warn' | 'diesel'>('warn');
  /** warnings that matter for road freight only (no 雷・乾燥・霜 …) */
  nlog = $state(true);
  /** news markers on the map */
  showNews = $state(false);
  /** news callout opened with its related news (group key) */
  newsOpen = $state<string | null>(null);
  /** municipal comparison: two 5-digit codes ('' = empty slot) */
  ma = $state('');
  mb = $state('');
  /** reach by road: origin as 'muni:<code>', 'site:<DPL name>', 'pt:<lon>,<lat>,<land>' (a point on the map),
   *  'net:dpl' (every DPL site) or 'net:short' (the shortlist); '' = the selected municipality */
  iso = $state('');
  /** reach map on the 1 km population grid instead of municipalities */
  igrid = $state(false);
  /** reach and hub times use the long-distance ferries */
  ferries = $state(true);

  showDpl = $state(true);
  showRoads = $state(true);
  /** airports / ports / rail freight stations */
  showHubs = $state(false);
  /** other developers' logistics facilities named in the news */
  showFac = $state(false);
  /** industrial zoning (用途地域) of the focused prefecture */
  showZone = $state(false);
  /** screening conditions (市区町村) */
  screen = $state<ScreenRule[]>([]);
  /** side panel tab */
  tab = $state<SideTab>('overview');
  /** buildings / land parcels at street level (on unless turned off) */
  showBld = $state(true);
  showFude = $state(true);
  /** 地理院タイル under the map ('' = none) and the opacity of the area fills over it */
  base = $state('');
  fillOp = $state(0.5);
  /** map view "z/lat/lon" (地理院タイル zoom level), '' = whole map or framed by the selection */
  mv = $state('');
  /** selected DPL site (index into dpl.sites) — -1 = none */
  site = $state(-1);

  view = $state<'map' | 'table'>('map');

  get dark() {
    return this.theme === 'dark' || (this.theme === 'system' && this.systemDark);
  }

  setLang(l: Lang) { this.lang = l; store('lang', l); }
  setTheme(t: Theme) {
    this.theme = t;
    store('theme', t);
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }

  /** Click on a prefecture: focus it, or fill the A / B slots in compare mode. */
  pick(code: number) {
    if (!this.compare) { this.pref = code; return; }
    if (code === this.a) { this.a = this.b; this.b = 0; return; }
    if (code === this.b) { this.b = 0; return; }
    if (!this.a) this.a = code;
    else if (!this.b) this.b = code;
    else this.b = code; // both taken: replace B
  }
  startCompare() {
    this.compare = true;
    if (this.pref && !this.a) this.a = this.pref;
  }
  stopCompare() {
    this.compare = false;
    if (this.a && !this.pref) this.pref = this.a;
  }

  // ------------------------------------------------------------ URL <-> state
  /** the side tab a view opens on: a reach map shows its numbers */
  defaultTab(): SideTab { return this.layer === 'local' && (this.lmet === 'iso' || this.lmet === 'shift') ? 'calc' : 'overview'; }

  toHash(lists: HashLists): string {
    const p = new URLSearchParams();
    if (this.layer !== 'warehouse') p.set('t', this.layer);
    if (this.layer === 'flows') {
      if (this.flowYear !== lists.flowYears.at(-1)) p.set('fy', String(this.flowYear));
      if (this.basis !== 'annual') p.set('fb', this.basis);
      if (this.cut !== 'all') p.set('fc', this.cut);
      if (this.fmetric !== 'out') p.set('fm', this.fmetric);
      if (this.near) p.set('fn', '1');
    }
    if (this.layer === 'labour') {
      if (this.lmetric !== 'ssw') p.set('lm', this.lmetric);
      if (this.lmetric === 'ssw' && this.sp !== lists.sswPeriods.length - 1) p.set('sp', lists.sswPeriods[this.sp]);
      if (this.lmetric === 'ssw' && this.field !== 'total') p.set('sf', this.field);
      if (this.lmetric === 'jobs' && lists.jobPeriods.length && this.jp !== lists.jobPeriods.length - 1) p.set('jp', lists.jobPeriods[this.jp]);
      if (this.lmetric === 'jobs' && this.occ !== 'driver') p.set('jo', this.occ);
    }
    if (this.layer === 'now') {
      if (this.nmet !== 'warn') p.set('nm', this.nmet);
      if (!this.nlog) p.set('na', '1');
    }
    if (this.showNews) p.set('nw', '1');
    if (this.showNews && this.newsOpen) p.set('nx', this.newsOpen);
    if (this.layer === 'local') {
      if (this.lmet !== 'pop2050') p.set('lk', this.lmet);
      if (this.muni) p.set('mu', this.muni);
      if (this.ma || this.mb) p.set('mc', `${this.ma}-${this.mb}`);
      if (this.iso) p.set('io', this.iso);
      if (this.igrid) p.set('ig', '1');
      if (!this.ferries) p.set('nf', '1');
      if (this.screen.length) p.set('fx', this.screen.map((r) => `${r.key}.${r.op}.${+r.v.toPrecision(4)}`).join('~'));
    }
    if (this.layer === 'score') {
      if (this.slevel === 'muni') p.set('sl', 'muni');
      if (this.slevel === 'muni' && this.muni) p.set('mu', this.muni);
      if (this.preset && this.preset !== 'balanced') p.set('pr', this.preset);
      if (!this.preset) p.set('sw', lists.criteria.map((k) => `${k}-${this.weights[k] ?? 1}`).join('.'));
    }
    const quarters = lists.quarters;
    if (this.layer === 'warehouse' && this.q !== quarters.length - 1) p.set('q', quarters[this.q]);
    if (this.layer === 'warehouse' && this.metric !== 'area') p.set('m', this.metric);
    if (this.layer === 'warehouse' && this.mode !== 'value') p.set('y', '1');
    if (this.pref) p.set('r', String(this.pref));
    if (this.compare) p.set('c', `${this.a}-${this.b}`);
    if (!this.showDpl) p.set('dpl', '0');
    if (!this.showRoads) p.set('rd', '0');
    if (this.showHubs) p.set('hb', '1');
    if (this.showFac) p.set('fc', '1');
    if (this.showZone) p.set('zn', '1');
    if (!this.showBld) p.set('bd', '0');
    if (this.tab !== this.defaultTab()) p.set('tb', this.tab);
    if (!this.showFude) p.set('fd', '0');
    if (this.base) p.set('bm', this.base);
    if (this.base && this.fillOp !== 0.5) p.set('fo', String(this.fillOp));
    if (this.view !== 'map') p.set('v', this.view);
    if (this.mv) p.set('mv', this.mv);
    return p.toString().replace(/%2F/g, '/').replace(/%7E/g, '~');
  }

  fromHash(hash: string, lists: HashLists) {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const quarters = lists.quarters;
    const tl = p.get('t');
    this.layer = tl === 'flows' || tl === 'labour' || tl === 'score' || tl === 'local' || tl === 'now' ? tl : 'warehouse';
    this.nmet = p.get('nm') === 'diesel' ? 'diesel' : 'warn';
    this.nlog = p.get('na') !== '1';
    this.showNews = p.get('nw') === '1';
    this.newsOpen = /^(m\d{5}|p\d{2}|jp)$/.test(p.get('nx') ?? '') ? p.get('nx') : null;
    const lk = p.get('lk') ?? 'pop2050';
    this.lmet = lists.localMetrics.length && !lists.localMetrics.includes(lk) ? 'pop2050' : lk;
    const [ma, mb] = (p.get('mc') ?? '').split('-');
    this.ma = /^\d{5}$/.test(ma ?? '') ? ma : '';
    this.mb = /^\d{5}$/.test(mb ?? '') ? mb : '';
    const io = p.get('io') ?? '';
    this.iso = /^(muni:\d{5}|site:.{1,80}|pt:-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+|net:(dpl|short|sim))$/.test(io) ? io : '';
    this.igrid = p.get('ig') === '1';
    this.ferries = p.get('nf') !== '1';
    this.screen = (p.get('fx') ?? '').split('~').map((s) => s.match(/^([A-Za-z0-9_]{1,20})\.(ge|le)\.(-?[\d.e+-]+)$/)).filter((m): m is RegExpMatchArray => !!m && isFinite(Number(m[3])))
      .slice(0, 12).map((m) => ({ key: m[1], op: m[2] as 'ge' | 'le', v: Number(m[3]) }));
    // score weights: "sw=stock-3.demand-2…" (hand-edited) or a preset name in "sp"
    const sw = p.get('sw');
    this.weights = {};
    if (sw) {
      for (const pair of sw.split('.')) {
        const [k, v] = pair.split('-');
        const n = Number(v);
        if (lists.criteria.includes(k) && Number.isInteger(n) && n >= 0 && n <= 5) this.weights[k] = n;
      }
      this.preset = '';
    } else this.preset = p.get('pr') ?? 'balanced';
    this.slevel = p.get('sl') === 'muni' ? 'muni' : 'pref';
    this.muni = /^\d{5}$/.test(p.get('mu') ?? '') ? p.get('mu')! : '';
    const fy = Number(p.get('fy'));
    this.flowYear = lists.flowYears.includes(fy) ? fy : lists.flowYears.at(-1)!;
    this.basis = p.get('fb') === 'day3' ? 'day3' : 'annual';
    const fc = p.get('fc') ?? 'all';
    this.cut = lists.flowCuts.includes(fc) ? fc : 'all';
    const fm = p.get('fm');
    this.fmetric = fm === 'in' || fm === 'net' || fm === 'intra' ? fm : 'out';
    this.near = p.get('fn') === '1';
    this.lmetric = p.get('lm') === 'jobs' ? 'jobs' : 'ssw';
    const sp = lists.sswPeriods.indexOf(p.get('sp') ?? '');
    this.sp = sp >= 0 ? sp : lists.sswPeriods.length - 1;
    const sf = p.get('sf') ?? 'total';
    this.field = lists.sswFields.includes(sf) ? sf : 'total';
    const jp = lists.jobPeriods.indexOf(p.get('jp') ?? '');
    this.jp = jp >= 0 ? jp : Math.max(0, lists.jobPeriods.length - 1);
    this.occ = p.get('jo') === 'handling' ? 'handling' : 'driver';
    const qi = quarters.indexOf(p.get('q') ?? '');
    this.q = qi >= 0 ? qi : quarters.length - 1;
    const m = p.get('m') as Metric;
    this.metric = METRICS.includes(m) ? m : 'area';
    this.mode = p.get('y') === '1' ? 'yoy' : 'value';
    const code = (v: string | null | undefined) => Math.min(47, Math.max(0, Number(v) || 0));
    this.pref = code(p.get('r'));
    const c = p.get('c');
    this.compare = c !== null;
    const [a, b] = (c ?? '').split('-');
    this.a = code(a);
    this.b = code(b) === this.a ? 0 : code(b);
    this.showDpl = p.get('dpl') !== '0';
    this.showRoads = p.get('rd') !== '0';
    this.showHubs = p.get('hb') === '1';
    this.showFac = p.get('fc') === '1';
    this.showZone = p.get('zn') === '1';
    this.showBld = p.get('bd') !== '0';
    const tb = p.get('tb') as SideTab | null;
    this.tab = tb && (SIDE_TABS as readonly string[]).includes(tb) ? tb : this.defaultTab();
    this.showFude = p.get('fd') !== '0';
    this.base = /^[a-z]{2,12}$/.test(p.get('bm') ?? '') ? p.get('bm')! : '';
    const fo = Number(p.get('fo'));
    this.fillOp = p.has('fo') && fo >= 0 && fo <= 1 ? fo : 0.5;
    const mv = p.get('mv') ?? '';
    this.mv = /^\d{1,2}(\.\d)?\/-?\d{1,3}(\.\d+)?\/-?\d{1,3}(\.\d+)?$/.test(mv) ? mv : '';
    this.view = p.get('v') === 'table' ? 'table' : 'map';
  }
}

export const app = new AppState();
