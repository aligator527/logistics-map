// Loaded data, the theme objects and the helpers shared by App.svelte and the side panels
// (labels, picking a place). App.svelte loads everything in boot(); components read from here.

import type { CensusIndex, Dpl, Jobs, Roads, Ssw, Warehouse } from './data';
import type { GeoData, Shape } from './geo';
import { app, type ScreenRule } from './state.svelte';
import { prefName, t, type Key } from './i18n';
import { fmtMinutes, fmtNum } from './scale';
import { unproject } from './project';
import type { News } from '../components/NewsFeed.svelte';
import type { Catchment } from '../components/SiteCard.svelte';
import type { WarehouseTheme } from '../themes/warehouse.svelte';
import type { FlowsTheme } from '../themes/flows.svelte';
import type { LabourTheme } from '../themes/labour.svelte';
import type { ScoreTheme } from '../themes/score.svelte';
import type { MuniScoreTheme } from '../themes/muniscore.svelte';
import type { LocalTheme } from '../themes/local.svelte';
import type { NowTheme, Diesel } from '../themes/now.svelte';
import type { ThemeView } from '../themes/types';

export interface MuniData {
  codes: string[];
  m: Record<string, (number | null)[]> & { icName: string[]; landEst: number[] };
  prefLand: (number | null)[];
  sites: Record<string, Catchment>;
  siteMedian: Record<string, number | null>;
  sources: Record<string, { ja: string; en: string; url: string }>;
  /** population centre in map coordinates */
  xy?: ([number, number] | null)[];
}
/** airports (+ ports / rail freight stations in a non-commercial build) */
export interface Hubs {
  noncommercial: boolean;
  items: { kind: 'air' | 'port' | 'rail'; name: string; cls: string; t: number | null; intl?: number | null; teu?: number | null; /** airports only: ports and rail stations are 非商用 and drawn from tiles */ p?: [number, number] }[];
  sites: Record<string, { air: { n: string; km: number } | null; port?: { n: string; km: number } }>;
  sources: Record<string, { ja: string; en: string; url: string }>;
}
/** other developers' facilities named in the news (public/data/facilities.json) */
export interface Facility { name: string; brand: string; src: string; muni: string; pref: number; floor: number | null; ll?: [number, number]; addr?: string; events: { stage: string; date: string; link: string; t: string }[] }
export interface Risk {
  sites: Record<string, { quake: number | null; flood: number; surge: number }>;
  depthLegend: { rank: number; ja: string; en: string }[];
}

class Store {
  w = $state.raw<Warehouse | null>(null);
  geo = $state.raw<GeoData | null>(null);
  dpl = $state.raw<Dpl | null>(null);
  roads = $state.raw<Roads | null>(null);
  census = $state.raw<CensusIndex | null>(null);
  ssw = $state.raw<Ssw | null>(null);
  jobs = $state.raw<Jobs | null>(null);
  news = $state.raw<News | null>(null);
  hubs = $state.raw<Hubs | null>(null);
  muni = $state.raw<MuniData | null>(null);
  risk = $state.raw<Risk | null>(null);
  diesel = $state.raw<Diesel | null>(null);
  facilities = $state.raw<Facility[] | null>(null);
  /** logistics rental market by region (一五不動産情報サービス) */
  rent = $state.raw<import('./rent').Rent | null>(null);

  wh = $state.raw<WarehouseTheme | null>(null);
  fl = $state.raw<FlowsTheme | null>(null);
  lb = $state.raw<LabourTheme | null>(null);
  sc = $state.raw<ScoreTheme | null>(null);
  msc = $state.raw<MuniScoreTheme | null>(null);
  lt = $state.raw<LocalTheme | null>(null);
  nt = $state.raw<NowTheme | null>(null);

  /** reach map: the next map click picks the origin; the 1 km grid is being loaded */
  pickArmed = $state(false);
  gridLoading = $state(false);
  /** 地点を調べる: the next map click inspects a point (elevation, landform) */
  inspectArmed = $state(false);
  /** 通行止め: the next map clicks close / open expressway stretches */
  closeArmed = $state(false);
  inspect = $state.raw<import('./pointinfo').PointInfo | null>(null);
  inspectLoading = $state(false);

  // ------------------------------------------------------------ which view is on
  readonly nowWarn = $derived.by(() => app.layer === 'now' && !!this.nt && this.nt.isWarn);
  readonly muniLevel = $derived.by(() => app.layer === 'score' && app.slevel === 'muni' && !!this.msc);
  readonly localLevel = $derived.by(() => app.layer === 'local' && !!this.lt);
  /** the map shows municipalities (municipal score, the municipal data explorer, live warnings) */
  readonly mapMuni = $derived.by(() => this.muniLevel || this.localLevel || this.nowWarn);
  /** the active municipal theme */
  readonly mt = $derived.by(() => (this.muniLevel ? this.msc : this.localLevel ? this.lt : null));
  readonly view = $derived.by((): ThemeView | null => (app.layer === 'flows' ? this.fl : app.layer === 'labour' ? this.lb
    : app.layer === 'score' ? (this.muniLevel ? this.msc : this.sc) : app.layer === 'local' ? this.lt : app.layer === 'now' ? this.nt : this.wh));
  /** the active score theme (prefecture or municipal) */
  readonly scv = $derived.by(() => (this.muniLevel ? this.msc : this.sc));

  // ------------------------------------------------------------ screening (絞り込み)
  /** each condition in turn: how many municipalities are left; `keep` = those passing all (null = no conditions) */
  readonly screened = $derived.by(() => {
    const lt = this.lt;
    if (!lt || !this.localLevel || !app.screen.length) return null;
    const byKey = new Map(lt.metrics.map((m) => [m.key, m]));
    let left = lt.codes.map((_, i) => i);
    const steps: { rule: ScreenRule; n: number; label: string }[] = [];
    for (const r of app.screen) {
      const m = byKey.get(r.key);
      if (!m) continue;
      left = left.filter((i) => { const v = m.get(i); return isFinite(v) && (r.op === 'ge' ? v >= r.v : v <= r.v); });
      steps.push({ rule: r, n: left.length, label: m[app.lang] });
    }
    return { total: lt.codes.length, steps, keep: new Set(left.map((i) => lt.codes[i])), idx: left };
  });

  // ------------------------------------------------------------ labels
  readonly names = $derived.by(() => (this.geo ? this.geo.prefs.map((p) => p.name) : []));
  readonly sites = $derived.by(() => (this.dpl ? this.dpl.sites : []));
  readonly muniShape = $derived.by(() => (this.geo ? new Map(this.geo.munis.map((s) => [s.code, s])) : new Map<string, Shape>()));
  tt = (k: Key) => t(app.lang, k);
  pname = (c: number) => prefName(app.lang, c, this.names[c - 1] ?? '');
  /** 「川口市（埼玉県）」 / "Kawaguchi City, Saitama" */
  muniLabel = (code: string) => {
    const s = this.muniShape.get(code);
    const c = Number(code.slice(0, 2));
    if (!s) return code;
    return app.lang === 'ja' ? `${s.name}（${this.names[c - 1] ?? ''}）` : `${s.nameEn || s.name}, ${this.pname(c)}`;
  };
  srcName = (k: string) => this.news?.sources.find((s) => s.key === k)?.[app.lang] ?? k;
  /** a reach-map origin: 'muni:<code>' or 'site:<DPL name>' */
  originName = (k: string) => (k.startsWith('muni:') ? this.muniLabel(k.slice(5)) : k.startsWith('pt:') ? this.tt('pointOrigin')
    : k === 'net:dpl' ? this.tt('originDpl') : k === 'net:short' ? this.tt('originShort') : k === 'net:sim' ? this.tt('simTitle') : k.slice(5));

  // ------------------------------------------------------------ picking
  onpick = (code: string) => {
    app.site = -1;
    if (code.length === 5) { app.muni = app.muni === code ? '' : code; app.pref = Number(code.slice(0, 2)); return; }
    app.muni = '';
    app.pick(Number(code));
  };
  onsite = (i: number) => {
    app.site = app.site === i ? -1 : i;
    const s = this.sites[i];
    if (app.site >= 0 && s && !app.compare && s.pref !== app.pref) app.pref = s.pref;
  };
  clearFocus = () => { app.pref = 0; app.site = -1; app.muni = ''; };
  showReach = (key: string) => { app.stopCompare(); app.layer = 'local'; app.lmet = 'iso'; app.iso = key; app.tab = 'calc'; };

  /** a municipality's population centre as lon/lat (from its map position, insets undone) */
  muniLonLat = (code: string): [number, number] | null => {
    const m = this.muni, g = this.geo;
    if (!m || !g?.layout) return null;
    const xy = m.xy?.[m.codes.indexOf(code)];
    if (!xy) return null;
    const space = code === '13421' ? 'ogasawara' : code.startsWith('47') ? 'okinawa' : 'main';
    return unproject(xy, g.layout, space);
  };
  /** a DPL site's nearest port / airport / rail station: road time once the network is in, else distance */
  hubRows = (name: string): [string, string][] => {
    const L = app.lang, lt = this.lt;
    const out: [string, string][] = [];
    if (lt?.router) {
      for (const [g, key] of [['port', 'tPortHub'], ['air', 'tAirHub'], ['rail', 'tRailHub']] as const) {
        const h = lt.hubsFrom(`site:${name}`, g, 1)[0];
        if (h) out.push([this.tt(key), `${h.name} · ${fmtMinutes(L, h.t)}`]);
      }
      if (out.length) return out;
    }
    const hb = this.hubs?.sites[name];
    if (hb?.air) out.push([this.tt('nearestAir'), `${hb.air.n} ${fmtNum(L, hb.air.km, 0)} km`]);
    if (hb?.port) out.push([this.tt('nearestPort'), `${hb.port.n} ${fmtNum(L, hb.port.km, 0)} km`]);
    return out;
  };
}

export const store = new Store();
