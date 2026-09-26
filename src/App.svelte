<script lang="ts">
  import { onMount } from 'svelte';
  import { loadCensusIndex, loadDpl, loadJobs, loadRoads, loadSsw, loadWarehouse, METRICS, fmtDate, fmtValue, fmtYm, fmtYoy,
           isBuilt, valueOf, yoyOf, type CensusIndex, type Dpl, type Jobs, type Roads, type Ssw, type Warehouse } from './lib/data';
  import { loadGeo, loadMunis, roadPaths, type GeoData, type Shape } from './lib/geo';
  import { app, type FlowBasis, type FlowMetric, type HashLists, type Layer, type LabourMetric, type Theme } from './lib/state.svelte';
  import { prefName, t, type Key } from './lib/i18n';
  import { fmtCompact, fmtNum, fmtPct, fmtSqm } from './lib/scale';
  import { WarehouseTheme } from './themes/warehouse.svelte';
  import { FlowsTheme, FLOW_METRICS } from './themes/flows.svelte';
  import { LabourTheme } from './themes/labour.svelte';
  import { PRESETS, ScoreTheme, type ExtraCriteria, type PrefStats } from './themes/score.svelte';
  import { MUNI_PRESETS, MuniScoreTheme } from './themes/muniscore.svelte';
  import { LocalTheme } from './themes/local.svelte';
  import { NowTheme, type Diesel } from './themes/now.svelte';
  import { live, WARN } from './lib/live.svelte';
  import { project as projectLL } from './lib/project';
  import MuniProfile from './components/MuniProfile.svelte';
  import { shortlist, type ShortItem } from './lib/shortlist.svelte';
  import { downloadCsv } from './lib/csv';
  import { pad2, type Ctx, type ThemeView } from './themes/types';
  import MapView, { type Marker, type Poi } from './components/MapView.svelte';
  import Legend from './components/Legend.svelte';
  import TimeControl from './components/TimeControl.svelte';
  import Trend from './components/Trend.svelte';
  import RegionTable from './components/RegionTable.svelte';
  import SiteList from './components/SiteList.svelte';
  import ComparePanel from './components/ComparePanel.svelte';
  import BarList from './components/BarList.svelte';
  import WeightPanel from './components/WeightPanel.svelte';
  import ScoreBreakdown from './components/ScoreBreakdown.svelte';
  import NewsFeed, { type News } from './components/NewsFeed.svelte';
  import SiteCard, { type Catchment } from './components/SiteCard.svelte';
  import PlaceSearch, { type Place } from './components/PlaceSearch.svelte';
  import Dossier, { type DossierSection } from './components/Dossier.svelte';
  import Segmented from './components/Segmented.svelte';
  import type { Tip } from './components/Tooltip.svelte';

  interface MuniData {
    codes: string[];
    m: Record<string, (number | null)[]> & { icName: string[]; landEst: number[] };
    prefLand: (number | null)[];
    sites: Record<string, Catchment>;
    siteMedian: Record<string, number | null>;
    sources: Record<string, { ja: string; en: string; url: string }>;
  }

  let w = $state.raw<Warehouse | null>(null);
  let geo = $state.raw<GeoData | null>(null);
  let dpl = $state.raw<Dpl | null>(null);
  let roads = $state.raw<Roads | null>(null);
  let census = $state.raw<CensusIndex | null>(null);
  let ssw = $state.raw<Ssw | null>(null);
  let jobs = $state.raw<Jobs | null>(null);
  let news = $state.raw<News | null>(null);
  /** airports (+ ports / rail freight stations in a non-commercial build) */
  let hubs = $state.raw<{ noncommercial: boolean; items: { kind: 'air' | 'port' | 'rail'; name: string; cls: string; t: number | null; intl?: number | null; teu?: number | null; p: [number, number] }[];
    sites: Record<string, { air: { n: string; km: number } | null; port?: { n: string; km: number } }>; sources: Record<string, { ja: string; en: string; url: string }> } | null>(null);
  /** municipal indicators + DPL catchments (public/data/muni.json) */
  let muni = $state.raw<MuniData | null>(null);
  let risk = $state.raw<{ sites: Record<string, { quake: number | null; flood: number; surge: number }>; depthLegend: { rank: number; ja: string; en: string }[] } | null>(null);
  let error = $state<string | null>(null);
  let highlight = $state<number | null>(null);

  const L = $derived(app.lang);
  const tt = (k: Key) => t(L, k);

  // ------------------------------------------------------------ themes
  const names = $derived(geo ? geo.prefs.map((p) => p.name) : []);
  const pname = (c: number) => prefName(L, c, names[c - 1] ?? '');
  const today = new Date();
  const sites = $derived(dpl ? dpl.sites : []);
  const sitesIn = (pref: number) => sites.map((s, i) => [i, s] as [number, typeof s]).filter(([, s]) => s.pref === pref);
  const dplCount = (pref: number) => {
    const list = sitesIn(pref);
    const built = list.filter(([, s]) => isBuilt(s, today)).length;
    return { built, pipe: list.length - built };
  };
  const ctx: Ctx = {
    get L() { return app.lang; },
    get dark() { return app.dark; },
    get names() { return names; },
    pname,
    tt: (k) => t(app.lang, k),
    anchor: (c) => geo!.anchors[c - 1],
    adjacent: (a, b) => geo!.adjacent.has(`${Math.min(a, b)}-${Math.max(a, b)}`),
    dplCount,
  };
  let wh = $state.raw<WarehouseTheme | null>(null);
  let fl = $state.raw<FlowsTheme | null>(null);
  let lb = $state.raw<LabourTheme | null>(null);
  let sc = $state.raw<ScoreTheme | null>(null);
  let msc = $state.raw<MuniScoreTheme | null>(null);
  let lt = $state.raw<LocalTheme | null>(null);
  let nt = $state.raw<NowTheme | null>(null);
  let diesel = $state.raw<Diesel | null>(null);
  const nowWarn = $derived(app.layer === 'now' && !!nt && nt.isWarn);
  const muniLevel = $derived(app.layer === 'score' && app.slevel === 'muni' && !!msc);
  const localLevel = $derived(app.layer === 'local' && !!lt);
  /** the map shows municipalities (municipal score or the municipal data explorer) */
  const mapMuni = $derived(muniLevel || localLevel || nowWarn);
  /** the active municipal theme */
  const mt = $derived(muniLevel ? msc : localLevel ? lt : null);
  const view = $derived<ThemeView | null>(app.layer === 'flows' ? fl : app.layer === 'labour' ? lb
    : app.layer === 'score' ? (muniLevel ? msc : sc) : app.layer === 'local' ? lt : app.layer === 'now' ? nt : wh);
  /** the active score theme (prefecture or municipal) */
  const scv = $derived(muniLevel ? msc! : sc);

  const lists = $derived<HashLists | null>(w && census && ssw && jobs && sc ? {
    quarters: w.quarters.map((x) => x.id),
    flowYears: census.years.map((y) => y.year),
    flowCuts: ['all', ...census.modes.map((m) => m.key), ...census.commodities.map((c) => c.key)],
    sswPeriods: ssw.periods.map((p) => p.id),
    sswFields: ssw.fields.map((f) => f.key),
    jobPeriods: jobs.periods.map((p) => p.id),
    criteria: [...new Set([...sc.keys, ...(msc?.keys ?? [])])],
    localMetrics: lt?.metrics.map((m) => m.key) ?? [],
  } : null);

  // ------------------------------------------------------------ boot
  async function boot() {
    error = null;
    try {
      const [ww, g, d, ci, s, j, ps, extra] = await Promise.all([loadWarehouse(), loadGeo(), loadDpl(), loadCensusIndex(), loadSsw(), loadJobs(),
        fetch(`${import.meta.env.BASE_URL}geo/prefstats.json`).then((r) => r.json() as Promise<PrefStats>), loadRiskCriteria()]);
      wh = new WarehouseTheme(ww, ctx);
      fl = new FlowsTheme(ci, ctx);
      lb = new LabourTheme(j, s, ctx);
      sc = new ScoreTheme(ww, fl, j, s, ps, extra, ctx);
      w = ww; geo = g; dpl = d; census = ci; ssw = s; jobs = j;
      app.fromHash(location.hash, lists!);
      // municipalities (boundaries, names, municipal score) follow the first paint
      loadMunis(g).then((full) => (geo = full)).catch((e) => console.warn('munis', e));
      // roads are secondary: the map works without them
      loadRoads().then((r) => (roads = r)).catch((e) => console.warn('roads', e));
      diesel = await fetch(`${import.meta.env.BASE_URL}data/diesel.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      fetch(`${import.meta.env.BASE_URL}data/muni.json`).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!d) return;
        muni = d;
        sc!.landRaw = d.prefLand.map((v: number | null) => v ?? NaN);
        const t = new MuniScoreTheme(d, j, extra, ctx);
        t.setNamer(muniLabel);
        msc = t;
        const l = new LocalTheme(d, ctx);
        l.setNamer(muniLabel);
        lt = l;
        const nw = new NowTheme(diesel, d.codes, ctx);
        nw.setNamer(muniLabel);
        nt = nw;
        // the hash may carry municipal weights that were not known at boot
        app.fromHash(location.hash, lists!);
      }).catch((e) => console.warn('muni', e));
      fetch(`${import.meta.env.BASE_URL}data/multimodal.json`).then((r) => (r.ok ? r.json() : null)).then((d) => (hubs = d)).catch(() => {});
      fetch(`${import.meta.env.BASE_URL}data/news.json`).then((r) => (r.ok ? r.json() : null)).then((n) => (news = n)).catch(() => {});
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    boot();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    app.systemDark = mq.matches;
    const onmq = () => (app.systemDark = mq.matches);
    mq.addEventListener('change', onmq);
    const onhash = () => { if (lists && location.hash.slice(1) !== app.toHash(lists)) app.fromHash(location.hash, lists); };
    addEventListener('hashchange', onhash);
    return () => { mq.removeEventListener('change', onmq); removeEventListener('hashchange', onhash); };
  });

  $effect(() => {
    if (!lists) return;
    const h = app.toHash(lists);
    if (location.hash.slice(1) !== h) history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  });
  $effect(() => { document.documentElement.lang = L; document.title = `${tt('title')} · ${L === 'ja' ? 'Japan Logistics Map' : '総合物流マップ'}`; });
  // JMA live data: polled only while the live theme is open
  $effect(() => {
    if (app.layer !== 'now') return;
    live.start();
    return () => live.stop();
  });
  // census tables (~70 KB each) are loaded when the flow theme (or the score, which uses them) is opened
  $effect(() => { if ((app.layer === 'flows' || app.layer === 'score') && fl) fl.load(); });

  /** hazard criteria for the score (public/data/risk.json); the score works without them */
  async function loadRiskCriteria(): Promise<ExtraCriteria[]> {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}data/risk.json`);
      if (!r.ok) return [];
      const j = await r.json();
      risk = j;
      return j.criteria as ExtraCriteria[];
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------ point layers
  const markers = $derived.by((): Marker[] => {
    if (!geo || !app.showDpl) return [];
    // pipeline first so built sites are drawn on top
    return sites.map((s, i) => ({ i, xy: geo!.P(s.p), built: isBuilt(s, today), label: s.name }))
      .sort((x, y) => Number(x.built) - Number(y.built) || (x.i === app.site ? 1 : 0) - (y.i === app.site ? 1 : 0));
  });
  const roadLayer = $derived(geo && roads ? roadPaths(geo, roads) : null);
  /** JMA seismic-intensity colours: fill, text */
  const INT_COLOR: Record<string, [string, string]> = {
    '3': ['#0041ff', '#fff'], '4': ['#fae696', '#111'], '5-': ['#ffe600', '#111'], '5+': ['#ff9900', '#111'],
    '6-': ['#ff2800', '#fff'], '6+': ['#a50021', '#fff'], '7': ['#b40068', '#fff'],
  };
  const toMap = (lon: number, lat: number) => geo!.P(projectLL(lon, lat, geo!.layout).p);
  const livePois = $derived.by((): Poi[] => {
    if (!geo || app.layer !== 'now') return [];
    const out: Poi[] = [];
    for (const q of live.quakes) {
      const [fill, ink] = INT_COLOR[q.maxi] ?? INT_COLOR['3'];
      out.push({ key: `q${q.eid}`, kind: 'quake', xy: toMap(q.lon, q.lat), r: 5 + Math.max(0, (q.mag ?? 3) - 3) * 2.5, color: fill, ink,
                 badge: q.maxi.replace('-', '弱').replace('+', '強'), label: q.name, major: ['5-', '5+', '6-', '6+', '7'].includes(q.maxi),
                 tip: { title: q.name, sub: new Date(q.at).toLocaleString(L === 'ja' ? 'ja-JP' : 'en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        big: `${tt('maxInt')} ${q.maxi.replace('-', '弱').replace('+', '強')}`,
                        rows: [[tt('magnitude'), q.mag !== null ? `M${q.mag}` : '–'], [tt('depth'), q.depth !== null ? `${q.depth} km` : '–']], source: tt('jmaSource') } });
    }
    for (const t of live.typhoons) {
      if (!t.pos || projectLL(t.pos[1], t.pos[0], geo.layout).space === 'outside') continue;
      out.push({ key: `t${t.id}`, kind: 'typhoon', xy: toMap(t.pos[1], t.pos[0]), r: 9, label: `${tt('typhoon')}${Number(t.number.slice(2)) || ''}${L === 'ja' ? '号' : ''}`, major: true,
                 tip: { title: `${tt('typhoon')} ${Number(t.number.slice(2)) || ''}${L === 'ja' ? '号' : ''} ${t.name[L === 'ja' ? 'jp' : 'en']}`, sub: `${t.location} · ${t.time.slice(5, 16).replace('T', ' ')}`,
                        big: `${t.pressure} hPa`, rows: [[L === 'ja' ? '最大風速' : 'Max wind', `${t.wind} m/s`], [L === 'ja' ? '最大瞬間風速' : 'Gust', `${t.gust} m/s`],
                                                      [L === 'ja' ? '進路' : 'Course', `${t.course} ${t.speed} km/h`]], source: tt('jmaSource') } });
    }
    return out;
  });
  /** typhoon tracks (past solid, forecast dashed), split where they jump into / out of an inset */
  const tracks = $derived.by(() => {
    if (!geo || app.layer !== 'now') return [];
    const out: { key: string; d: string; kind: 'past' | 'forecast' }[] = [];
    for (const t of live.typhoons) {
      // only the part of the track in the same map space as the storm now (the Okinawa inset is
      // enlarged and moved, so points outside it would be drawn somewhere misleading)
      const here = t.pos ? projectLL(t.pos[1], t.pos[0], geo.layout).space : 'main';
      for (const [kind, pts] of [['past', t.pos ? [...t.past, t.pos] : t.past], ['forecast', t.pos ? [t.pos, ...t.forecast] : t.forecast]] as const) {
        let d = '', pen = false;
        for (const [lat, lon] of pts) {
          const { p, space } = projectLL(lon, lat, geo.layout);
          if (space !== here || space === 'outside') { pen = false; continue; }
          const [x, y] = geo.P(p);
          d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
          pen = true;
        }
        if (d) out.push({ key: `${t.id}${kind}`, d, kind });
      }
    }
    return out;
  });
  /** news markers: municipality when tagged, else prefecture (last 90 days) */
  const newsPois = $derived.by((): Poi[] => {
    if (!geo || !news || !app.showNews) return [];
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const groups = new Map<string, typeof news.items>();
    for (const it of news.items) {
      if (it.date < since) continue;
      const keys = it.munis.length ? it.munis : it.prefs.map((p) => pad2(p));
      for (const k of keys) (groups.get(k) ?? groups.set(k, []).get(k)!).push(it);
    }
    const out: Poi[] = [];
    for (const [k, items] of groups) {
      let xy: [number, number] | null = null;
      if (k.length === 5 && muni) { const i = muni.codes.indexOf(k); const c = (muni as unknown as { xy?: [number, number][] }).xy?.[i]; if (c) xy = geo.P(c); }
      if (!xy && k.length === 2) xy = geo.anchors[Number(k) - 1];
      if (!xy) continue;
      out.push({ key: `n${k}`, kind: 'news', xy, r: 6, badge: String(items.length), label: '', major: false, code: k,
                 tip: { title: k.length === 5 ? muniLabel(k) : pname(Number(k)), sub: `${items.length} ${tt('newsOnMap')}`,
                        rows: items.slice(0, 4).map((it) => [it.date.slice(5), it.t.length > 34 ? it.t.slice(0, 33) + '…' : it.t] as [string, string]) } });
    }
    return out;
  });
  const pois = $derived.by(() => [...hubPois, ...livePois, ...newsPois]);
  const hubPois = $derived.by((): Poi[] => {
    if (!geo || !hubs || !app.showHubs) return [];
    const maxT = { air: 0, port: 0, rail: 1 };
    for (const h of hubs.items) if (h.t && h.t > maxT[h.kind]) maxT[h.kind] = h.t;
    const label = { air: tt('hubAir'), port: tt('hubPort'), rail: tt('hubRail') };
    return hubs.items.map((h, i) => {
      const r = h.kind === 'rail' ? 4 : 4 + 7 * Math.sqrt((h.t ?? 0) / (maxT[h.kind] || 1));
      const rows: [string, string][] = [];
      if (h.t) rows.push([tt('cargoTons'), `${fmtCompact(L, h.t)}${L === 'ja' ? 'トン' : ' t'}`]);
      if (h.intl && h.t) rows.push([tt('intlShare'), fmtPct(L, (h.intl / h.t) * 100, 0)]);
      if (h.teu) rows.push([tt('teu'), fmtCompact(L, h.teu)]);
      const src = hubs!.sources[h.kind];
      return { key: `${h.kind}${i}`, kind: h.kind, xy: geo!.P(h.p), r, label: h.name, major: (h.t ?? 0) > (h.kind === 'air' ? 50_000 : 30_000_000),
               tip: { title: h.name, sub: `${label[h.kind]} · ${h.cls}`, rows, source: src ? src[L] : undefined } };
    }).sort((a, b) => a.r - b.r);
  });

  /** nearest cargo airport / major port of a DPL site */
  function hubRows(name: string): [string, string][] {
    const hb = hubs?.sites[name];
    const out: [string, string][] = [];
    if (hb?.air) out.push([tt('nearestAir'), `${hb.air.n} ${fmtNum(L, hb.air.km, 0)} km`]);
    if (hb?.port) out.push([tt('nearestPort'), `${hb.port.n} ${fmtNum(L, hb.port.km, 0)} km`]);
    return out;
  }

  /** 10 / 30 / 60 km around the selected DPL site; typhoon gale areas in the live theme */
  const rings = $derived.by(() => [...siteRings, ...typhoonRings]);
  const typhoonRings = $derived.by(() => {
    if (!geo || app.layer !== 'now') return [];
    return live.typhoons.filter((t) => t.pos && t.galeKm && projectLL(t.pos[1], t.pos[0], geo!.layout).space !== 'outside').map((t) => {
      const { p, space } = projectLL(t.pos![1], t.pos![0], geo!.layout);
      const k = geo!.unitsPerMetre * (space === 'okinawa' ? geo!.insetScale.okinawa : space === 'ogasawara' ? geo!.insetScale.ogasawara : 1);
      return { xy: geo!.P(p), r: t.galeKm * 1000 * k, label: `${tt('galeArea')} ${t.number}` };
    });
  });
  const siteRings = $derived.by(() => {
    if (!geo || app.site < 0 || !sites[app.site] || !app.showDpl) return [];
    const s = sites[app.site];
    const k = geo.unitsPerMetre * (s.pref === 47 ? geo.insetScale.okinawa : 1);
    return [10, 30, 60].map((r) => ({ xy: geo!.P(s.p), r: r * 1000 * k, label: `${r} km` }));
  });
  const dplSource = $derived(!dpl ? '' : L === 'ja' ? `${dpl.source.ja}（${fmtDate(L, dpl.source.updated)}更新）`
    : `${dpl.source.en} (updated ${fmtDate(L, dpl.source.updated)})`);

  const muniShape = $derived(geo ? new Map(geo.munis.map((s) => [s.code, s])) : new Map<string, Shape>());
  /** 「川口市（埼玉県）」 / "Kawaguchi City, Saitama" */
  function muniLabel(code: string) {
    const s = muniShape.get(code);
    const c = Number(code.slice(0, 2));
    if (!s) return code;
    return L === 'ja' ? `${s.name}（${names[c - 1] ?? ''}）` : `${s.nameEn || s.name}, ${pname(c)}`;
  }
  function muniTip(s: Shape): Tip {
    const c = Number(s.code.slice(0, 2));
    const n = sites.filter((x) => x.muni === s.code).length;
    return {
      title: L === 'ja' ? s.name : s.nameEn || s.name,
      sub: pname(c),
      rows: app.showDpl ? [[tt('dplIn'), n ? `${n}` : '–']] : [],
      note: tt('muniNote'),
    };
  }
  function siteTip(i: number): Tip {
    const s = sites[i];
    const rows: [string, string][] = [];
    if (s.floor) rows.push([tt('floor'), fmtSqm(L, s.floor)]);
    if (s.plot) rows.push([tt('plot'), fmtSqm(L, s.plot)]);
    rows.push([s.land ? tt('opens') : tt('completed'), fmtYm(L, s.date)]);
    rows.push([tt('address'), `${names[s.pref - 1] ?? ''}${s.address}`]);
    const ct = muni?.sites[s.name];
    if (ct) {
      if (ct.pop30 !== null) rows.push([tt('pop30'), `${fmtCompact(L, ct.pop30)}${L === 'ja' ? '人' : ''}`]);
      if (ct.ic !== null) rows.push([tt('nearestIc'), `${ct.icName ?? ''} ${fmtNum(L, ct.ic, 1)} km`]);
    }
    rows.push(...hubRows(s.name));
    const hz = risk?.sites[s.name];
    const depth = (r: number) => (r ? risk!.depthLegend.find((d) => d.rank === r)?.[L] ?? '–' : tt('hzNone'));
    if (hz) {
      if (hz.quake !== null) rows.push([tt('hzQuake'), fmtPct(L, hz.quake, 0)]);
      rows.push([tt('hzFlood'), depth(hz.flood)]);
      rows.push([tt('hzSurge'), depth(hz.surge)]);
    }
    return {
      title: s.name,
      sub: `${tt(`st_${s.status}`)} · ${isBuilt(s, today) ? tt('operating') : tt('pipeline')}`,
      rows,
      note: [s.approx ? tt('approx') : '', hz ? tt('hzNote') : ''].filter(Boolean).join(' / ') || undefined,
      source: dplSource,
      link: s.url ? { href: s.url, label: tt('detailPage') } : undefined,
    };
  }

  function onpick(code: string) {
    app.site = -1;
    if (code.length === 5) { app.muni = app.muni === code ? '' : code; app.pref = Number(code.slice(0, 2)); return; }
    app.muni = '';
    app.pick(Number(code));
  }
  function onsite(i: number) {
    app.site = app.site === i ? -1 : i;
    if (app.site >= 0 && !app.compare && sites[i].pref !== app.pref) app.pref = sites[i].pref;
  }
  const places = $derived.by((): Place[] => {
    if (!geo) return [];
    const prefs = geo.prefs.map((p) => ({ key: p.code, name: L === 'ja' ? p.name : pname(Number(p.code)), alt: L === 'ja' ? pname(Number(p.code)) : p.name, parent: '', kind: 'pref' as const }));
    const ms = geo.munis.map((m) => ({ key: m.code, name: L === 'ja' ? m.name : m.nameEn || m.name, alt: L === 'ja' ? m.nameEn : m.name,
                                      parent: pname(Number(m.code.slice(0, 2))), kind: 'muni' as const }));
    const ss = sites.map((s, i) => ({ key: String(i), name: s.name, alt: s.address, parent: pname(s.pref), kind: 'site' as const }));
    return [...prefs, ...ms, ...ss];
  });
  function onplace(p: Place) {
    if (p.kind === 'pref') { app.stopCompare(); app.muni = ''; app.site = -1; app.pref = Number(p.key); return; }
    if (p.kind === 'site') { app.stopCompare(); const i = Number(p.key); app.site = i; app.pref = sites[i].pref; return; }
    // municipality: its prefecture; in the municipal score also the municipality itself
    app.stopCompare();
    app.site = -1;
    app.pref = Number(p.key.slice(0, 2));
    app.muni = p.key;
  }

  // ------------------------------------------------------------ site memo (dossier)
  let dossierOpen = $state(false);
  function openDossier() { fl?.load(); dossierOpen = true; }
  const rankIn = (arr: number[], i: number, desc = true) => {
    const v = arr[i];
    if (!isFinite(v)) return '';
    const better = arr.filter((x) => isFinite(x) && (desc ? x > v : x < v)).length;
    return L === 'ja' ? `（${better + 1}位/${arr.filter(isFinite).length}）` : ` (#${better + 1} of ${arr.filter(isFinite).length})`;
  };
  const dossier = $derived.by((): { title: string; sections: DossierSection[]; sources: string[] } | null => {
    if (!dossierOpen || !w || !wh || !fl || !lb || !sc || !jobs || !ssw || !census || !app.pref) return null;
    const p = app.pref, i = p - 1;
    const q = w.quarters.length - 1;
    const sections: DossierSection[] = [];
    // warehouses
    sections.push({ title: `${tt('layerWarehouse')} · ${L === 'ja' ? w.quarters[q].ja : w.quarters[q].en}`, rows: METRICS.map((m) => {
      const all = Array.from({ length: 47 }, (_, k) => valueOf(w!, m, q, k));
      return [tt(`m_${m}`), `${fmtValue(L, m, valueOf(w!, m, q, i))}${rankIn(all, i)} · ${tt('yoy')} ${fmtYoy(L, m, yoyOf(w!, m, q, i))}`] as [string, string];
    }) });
    // freight flows (latest round, annual)
    const ly = census.years.at(-1)!.year;
    const M = fl.data.get(ly)?.annual.all;
    if (M) {
      const tot = FlowsTheme.totals(M);
      sections.push({ title: `${tt('layerFlows')} · ${census.years.at(-1)!.survey[L]}（${tt('basisAnnual')}）`,
        rows: FLOW_METRICS.map((m) => [tt(`fm_${m}`), m === 'net' ? fl!.signedTons(tot.net[i]) : fl!.tons(tot[m][i])] as [string, string]),
        list: [
          ...fl.partners(p, 'out', 5, M).map((x) => ({ label: `→ ${pname(x.code)}`, value: `${fl!.tons(x.v)} (${fmtPct(L, x.share, 0)})` })),
          ...fl.partners(p, 'in', 5, M).map((x) => ({ label: `← ${pname(x.code)}`, value: `${fl!.tons(x.v)} (${fmtPct(L, x.share, 0)})` })),
        ] });
    }
    // labour
    const jp = jobs.periods.length - 1, sp = ssw.periods.length - 1;
    sections.push({ title: `${tt('layerLabour')} · ${jobs.periods[jp][L]} / ${ssw.periods[sp][L]}`, rows: [
      [`${tt('jobsRatio')} · ${jobs.occupations[0][L]}`, `${fmtNum(L, jobs.ratio.driver[jp][i], 2)}${rankIn(jobs.ratio.driver[jp], i, false)}`],
      [`${tt('jobsRatio')} · ${jobs.occupations[1][L]}`, `${fmtNum(L, jobs.ratio.handling[jp][i], 2)}${rankIn(jobs.ratio.handling[jp], i, false)}`],
      [`${tt('ssw1')} · ${lb.fieldLabel('total')}`, lb.fmtPeople(lb.ssw1(p, sp, 'total'))],
      [`${tt('ssw1')} · ${lb.fieldLabel('transport')}`, lb.fmtPeople(lb.ssw1(p, sp, 'transport'))],
      ...(lb.region(p) ? [[tt('shortfall2024'), `${fmtPct(L, lb.region(p)!.pct)}（${lb.region(p)![L]}）`] as [string, string]] : []),
    ], note: tt('jobsHint') });
    // prefecture score with the current weights
    const presetName = (app.preset ? PRESETS.find((x) => x.key === app.preset)?.[L] : tt('custom')) ?? '';
    const st = sc.strengths(p);
    sections.push({ title: `${tt('layerScore')}（${tt('byPref')} · ${presetName}）`, rows: [
      [tt('layerScore'), `${sc.fmt(sc.result.total[i])}${rankIn(sc.result.total, i)}`],
      ...st.slice(0, 3).map((x) => [`＋ ${x.c[L]}`, `${x.c.fmt(x.c.raw[i])} · ${fmtNum(L, x.p, 0)}`] as [string, string]),
      ...st.slice(-2).map((x) => [`− ${x.c[L]}`, `${x.c.fmt(x.c.raw[i])} · ${fmtNum(L, x.p, 0)}`] as [string, string]),
    ] });
    // municipality
    if (app.muni && msc && muni) {
      const mi = msc.indexOf(app.muni);
      if (mi >= 0) {
        const mm = muni.m;
        const num = (v: number | null | undefined) => (v === null || v === undefined ? NaN : v);
        sections.push({ title: `${muniLabel(app.muni)}`, rows: [
          [`${tt('layerScore')}（${tt('byMuni')}）`, `${msc.fmt(msc.result.total[mi])}${rankIn(msc.result.total, mi)}`],
          [tt('pop30'), `${fmtCompact(L, num(mm.pop30[mi]))}${L === 'ja' ? '人' : ''}`],
          [tt('pop60'), `${fmtCompact(L, num(mm.pop60[mi]))}${L === 'ja' ? '人' : ''}`],
          [tt('nearestIc'), `${mm.icName[mi] ?? ''} ${fmtNum(L, num(mm.ic[mi]), 1)} km`],
          [tt('landPref'), `${fmtCompact(L, num(mm.land[mi]))}${L === 'ja' ? '円/㎡' : ' ¥/m²'}${mm.landEst[mi] ? ' *' : ''}`],
          [L === 'ja' ? '工業系用途地域' : 'Industrial zoning', `${fmtCompact(L, num(mm.zone[mi]))} ha`],
          [tt('pool30'), `${fmtCompact(L, num(mm.pool30[mi]))}${L === 'ja' ? '人' : ''}`],
          [tt('cluster20'), `${fmtCompact(L, num(mm.cluster20[mi]))}${L === 'ja' ? '人' : ''}`],
          [tt('hzQuake'), `${fmtNum(L, num(mm.quake[mi]), 0)}%`],
        ], note: mm.landEst[mi] ? tt(mm.landEst[mi] === 1 ? 'landEst15' : 'landEstPref') : undefined });
      }
    }
    // hazards (prefecture)
    const rc = (risk as unknown as { criteria?: ExtraCriteria[] } | null)?.criteria ?? [];
    if (rc.length) sections.push({ title: tt('groupRisk'), rows: rc.map((c) => [c[L], `${fmtNum(L, c.raw[i], c.digits)}${c.unit[L]}${rankIn(c.raw, i, false)}`] as [string, string]),
      note: L === 'ja' ? '順位は低リスク順' : 'Rank: lowest risk first' });
    // DPL sites
    const list = sitesIn(p);
    if (list.length) sections.push({ title: `${tt('dplIn')}（${list.length}）`, list: list.slice(0, 20).map(([, s]) => {
      const ct = muni?.sites[s.name];
      return { label: s.name, href: s.url ?? undefined,
               value: [tt(`st_${s.status}`), fmtYm(L, s.date), ct?.pop30 ? `${tt('pop30')} ${fmtCompact(L, ct.pop30)}` : '', ct?.ic != null ? `IC ${fmtNum(L, ct.ic, 1)} km` : ''].filter(Boolean).join(' · ') };
    }) });
    // news
    const nn = (news?.items ?? []).filter((it) => it.prefs.includes(p)).slice(0, 6);
    if (nn.length) sections.push({ title: tt('news'), list: nn.map((it) => ({ label: it.t, href: it.link, value: it.date })) });
    const sources = [
      `${w.source[L]}`, `${census.source[L]}`, `${jobs.source[L]}`, `${ssw.source[L]}`,
      ...(dpl ? [dpl.source[L]] : []), ...rc.map((c) => c.source[L]),
      ...(muni ? Object.values(muni.sources).map((s) => s[L]) : []),
    ];
    return { title: `${pname(p)}${app.muni && muniShape.get(app.muni) ? ` · ${L === 'ja' ? muniShape.get(app.muni)!.name : muniShape.get(app.muni)!.nameEn}` : ''}`, sections, sources: [...new Set(sources)] };
  });

  // ------------------------------------------------------------ shortlist & CSV
  function shortLabel(it: ShortItem) {
    if (it.kind === 'pref') return pname(Number(it.code));
    if (it.kind === 'muni') return muniLabel(it.code);
    return sites[Number(it.code)]?.name ?? it.code;
  }
  const shortKind = (it: ShortItem) => tt(it.kind === 'pref' ? 'byPref' : it.kind === 'muni' ? 'byMuni' : 'dplIn');
  function openShort(it: ShortItem) {
    app.stopCompare();
    if (it.kind === 'pref') { app.muni = ''; app.site = -1; app.pref = Number(it.code); }
    else if (it.kind === 'muni') { app.site = -1; app.pref = Number(it.code.slice(0, 2)); app.muni = it.code; }
    else { const i = Number(it.code); if (sites[i]) { app.site = i; app.pref = sites[i].pref; } }
  }
  function exportShortlist() {
    const lm = lt?.metrics ?? [];
    const head = ['kind', 'code', 'name', 'prefecture', ...(sc ? [tt('layerScore') + '（' + tt('byPref') + '）'] : []),
      ...(msc ? [tt('layerScore') + '（' + tt('byMuni') + '）'] : []), ...lm.map((m) => m[L]), tt('pop30'), tt('nearestIc'), tt('nearestAir')];
    const rows = shortlist.items.map((it) => {
      const pc = it.kind === 'pref' ? Number(it.code) : it.kind === 'muni' ? Number(it.code.slice(0, 2)) : sites[Number(it.code)]?.pref ?? 0;
      const mc = it.kind === 'muni' ? it.code : it.kind === 'site' ? sites[Number(it.code)]?.muni ?? '' : '';
      const mi = mc && lt ? lt.indexOf(mc) : -1;
      const ct = it.kind === 'site' ? muni?.sites[sites[Number(it.code)]?.name ?? ''] : undefined;
      const hb = it.kind === 'site' ? hubs?.sites[sites[Number(it.code)]?.name ?? '']?.air : undefined;
      return [it.kind, it.code, shortLabel(it), pname(pc), ...(sc ? [sc.result.total[pc - 1]?.toFixed(1)] : []),
        ...(msc ? [mi >= 0 && msc ? msc.result.total[msc.indexOf(mc)]?.toFixed(1) : ''] : []),
        ...lm.map((m) => (mi >= 0 ? m.get(mi) : '')), ct?.pop30 ?? '', ct ? `${ct.icName ?? ''} ${ct.ic ?? ''}` : '', hb ? `${hb.n} ${hb.km}` : ''];
    });
    downloadCsv(`shortlist-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows]);
  }
  function exportTable() {
    if (!view) return;
    const cols = view.table.columns;
    const areas = mt
      ? mt.codes.map((c, i) => ({ id: i, label: muniLabel(c), code: c })).filter((x) => !app.pref || Number(x.code.slice(0, 2)) === app.pref)
      : Array.from({ length: 47 }, (_, i) => ({ id: i + 1, label: pname(i + 1), code: pad2(i + 1) }));
    downloadCsv(`${app.layer}-${new Date().toISOString().slice(0, 10)}.csv`,
      [['code', tt('area'), ...cols.map((c) => c.label)], ...areas.map((a) => [a.code, a.label, ...cols.map((c) => { const v = c.get(a.id); return isFinite(v) ? v : ''; })])]);
  }

  function clearFocus() {
    app.pref = 0;
    app.site = -1;
    app.muni = '';
  }

  // ------------------------------------------------------------ side panel helpers
  const rank = (v: ThemeView, p: number) => {
    const vals = [...v.values.values()].filter((x) => isFinite(x)).sort((a, b) => b - a);
    const x = v.value(p);
    return isFinite(x) ? vals.indexOf(x) + 1 : 0;
  };
  const topBars = (v: ThemeView) => {
    const arr = [...v.values.entries()].filter(([, x]) => isFinite(x)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const max = Math.max(...arr.map(([, x]) => Math.abs(x)), 1e-9);
    return arr.map(([c, x]) => ({ key: c, label: pname(Number(c)), value: v.fmt(x), pct: (Math.abs(x) / max) * 100, neg: x < 0,
                                   onclick: () => onpick(c) }));
  };

  const subjects = $derived([
    { value: 'warehouse', label: tt('layerWarehouse') },
    { value: 'flows', label: tt('layerFlows') },
    { value: 'labour', label: tt('layerLabour') },
    { value: 'local', label: tt('layerLocal') },
    { value: 'score', label: tt('layerScore') },
    { value: 'now', label: tt('layerNow') },
  ] as { value: Layer; label: string }[]);
  const cutOptions = $derived(census ? [
    { group: '', items: [{ key: 'all', label: tt('allGoods'), disabled: false }] },
    { group: tt('byMode'), items: census.modes.map((m) => ({ key: m.key, label: m[L], disabled: app.basis === 'annual' })) },
    { group: tt('byCommodity'), items: census.commodities.map((c) => ({ key: c.key, label: c[L], disabled: false })) },
  ] : []);
  const fieldOptions = $derived(ssw ? [
    ssw.fields.find((f) => f.key === 'total')!,
    ...ssw.fields.filter((f) => f.logistics),
    ...ssw.fields.filter((f) => !f.logistics && f.key !== 'total'),
  ].map((f) => ({ key: f.key, label: f[L], disabled: !(f.key in ssw!.s1) })) : []);

  let mapView: MapView | undefined = $state();
</script>

<a class="skip" href="#main">{tt('skip')}</a>

<header class="top">
  <div class="brand">
    <svg class="logo" width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--blue)" /><path d="M7 22V13l9-5 9 5v9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" /><rect x="12" y="16" width="8" height="6" fill="var(--mark)" /></svg>
    <div>
      <h1>{tt('title')} <span class="phase mono">{tt('phase')}</span></h1>
      <p class="sub">{tt('subtitle')}</p>
    </div>
  </div>
  <div class="prefs">
    <Segmented label={tt('language')} value={app.lang} options={[{ value: 'ja', label: '日本語' }, { value: 'en', label: 'EN' }]}
               onchange={(v) => app.setLang(v)} />
    <Segmented label={tt('theme')} value={app.theme}
               options={[{ value: 'light', label: tt('themeLight') }, { value: 'dark', label: tt('themeDark') }, { value: 'system', label: tt('themeSystem') }] as { value: Theme; label: string }[]}
               onchange={(v) => app.setTheme(v)} />
  </div>
</header>

{#if error}
  <div class="state" role="alert">
    <p>{tt('loadError')}</p>
    <p class="mono small">{error}</p>
    <button type="button" class="btn" onclick={boot}>{tt('retry')}</button>
  </div>
{:else if !w || !geo || !dpl || !census || !ssw || !jobs || !view || !wh || !fl || !lb || !sc}
  <div class="state" aria-busy="true"><p>{tt('loading')}</p></div>
{:else}
  <nav class="subjects" aria-label={tt('subject')}>
    <Segmented label={tt('subject')} value={app.layer} options={subjects} onchange={(v) => { app.layer = v; highlight = null; }} />
  </nav>

  <section class="controls" aria-label={tt('metric')}>
    {#if app.layer === 'warehouse'}
      <div class="ctl">
        <span class="lab">{tt('metric')}</span>
        <Segmented label={tt('metric')} value={app.metric}
                   options={METRICS.map((m) => ({ value: m, label: tt(`m_${m}`), title: tt(`mh_${m}`) }))} onchange={(v) => (app.metric = v)} />
      </div>
      <div class="ctl">
        <span class="lab">{tt('mode')}</span>
        <Segmented label={tt('mode')} value={app.mode}
                   options={[{ value: 'value', label: tt('modeValue') }, { value: 'yoy', label: tt('modeYoy') }]}
                   onchange={(v) => (app.mode = v)} />
      </div>
      <div class="ctl time"><TimeControl quarters={w.quarters} q={app.q} lang={L} onchange={(q) => (app.q = q)} /></div>
    {:else if app.layer === 'flows'}
      <div class="ctl">
        <span class="lab">{tt('metric')}</span>
        <Segmented label={tt('metric')} value={app.fmetric}
                   options={FLOW_METRICS.map((m) => ({ value: m, label: tt(`fm_${m}`) })) as { value: FlowMetric; label: string }[]}
                   onchange={(v) => (app.fmetric = v)} />
      </div>
      <div class="ctl">
        <span class="lab">{tt('surveyYear')}</span>
        <Segmented label={tt('surveyYear')} value={app.flowYear}
                   options={census.years.map((y) => ({ value: y.year, label: String(y.year) }))} onchange={(v) => (app.flowYear = v)} />
      </div>
      <div class="ctl">
        <span class="lab">{tt('basis')}</span>
        <Segmented label={tt('basis')} value={app.basis}
                   options={[{ value: 'annual', label: tt('basisAnnual') }, { value: 'day3', label: tt('basis3day'), title: tt('basisHint') }] as { value: FlowBasis; label: string; title?: string }[]}
                   onchange={(v) => (app.basis = v)} />
      </div>
      <label class="ctl">
        <span class="lab">{tt('cut')}</span>
        <select class="sel" value={fl.cut} onchange={(e) => (app.cut = e.currentTarget.value)}>
          {#each cutOptions as g (g.group)}
            {#if g.group}
              <optgroup label={g.group}>
                {#each g.items as o (o.key)}<option value={o.key} disabled={o.disabled}>{o.label}</option>{/each}
              </optgroup>
            {:else}
              {#each g.items as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
            {/if}
          {/each}
        </select>
      </label>
      {#if !app.pref && !app.compare}
        <div class="ctl">
          <span class="lab">{tt('arcs')}</span>
          <button type="button" class="btn chip" aria-pressed={app.near} onclick={() => (app.near = !app.near)}
                  title={tt('nearHint')}>{tt('near')}</button>
        </div>
      {/if}
    {:else if app.layer === 'now'}
      <div class="ctl">
        <span class="lab">{tt('nowMode')}</span>
        <Segmented label={tt('nowMode')} value={app.nmet}
                   options={[{ value: 'warn', label: tt('liveWarn') }, ...(diesel ? [{ value: 'diesel', label: tt('diesel') }] : [])] as { value: 'warn' | 'diesel'; label: string }[]}
                   onchange={(v) => { app.nmet = v; app.muni = ''; }} />
      </div>
      {#if app.nmet === 'warn'}
        <div class="ctl">
          <span class="lab">{tt('liveWarn')}</span>
          <button type="button" class="btn chip" aria-pressed={app.nlog} title={tt('logisticsOnlyHint')} onclick={() => (app.nlog = !app.nlog)}>{tt('logisticsOnly')}</button>
        </div>
      {/if}
    {:else if app.layer === 'local'}
      {#if lt}
        <label class="ctl">
          <span class="lab">{tt('localMetric')}</span>
          <select class="sel" value={app.lmet} onchange={(e) => (app.lmet = e.currentTarget.value)}>
            {#each ['people', 'access', 'land', 'industry', 'labour', 'risk'] as g (g)}
              <optgroup label={tt(`lg_${g}` as Key)}>
                {#each lt.metrics.filter((m) => m.group === g) as m (m.key)}<option value={m.key}>{m[L]}</option>{/each}
              </optgroup>
            {/each}
          </select>
        </label>
      {/if}
    {:else if app.layer === 'score'}
      {#if msc}
        <div class="ctl">
          <span class="lab">{tt('scoreLevel')}</span>
          <Segmented label={tt('scoreLevel')} value={app.slevel}
                     options={[{ value: 'pref', label: tt('byPref') }, { value: 'muni', label: tt('byMuni') }] as { value: 'pref' | 'muni'; label: string }[]}
                     onchange={(v) => { app.slevel = v; app.preset = 'balanced'; app.weights = {}; app.muni = ''; if (v === 'muni') app.stopCompare(); }} />
        </div>
      {/if}
      <div class="ctl">
        <span class="lab">{tt('preset')}</span>
        <Segmented label={tt('preset')} value={app.preset}
                   options={[...(muniLevel ? MUNI_PRESETS : PRESETS).map((p) => ({ value: p.key, label: p[L] })), ...(app.preset ? [] : [{ value: '', label: tt('custom') }])]}
                   onchange={(v) => { app.preset = v; app.weights = {}; }} />
      </div>
    {:else}
      <div class="ctl">
        <span class="lab">{tt('labourMetric')}</span>
        <Segmented label={tt('labourMetric')} value={app.lmetric}
                   options={[{ value: 'jobs', label: tt('lm_jobs') }, { value: 'ssw', label: tt('lm_ssw') }] as { value: LabourMetric; label: string }[]}
                   onchange={(v) => (app.lmetric = v)} />
      </div>
      {#if app.lmetric === 'jobs'}
        <div class="ctl">
          <span class="lab">{tt('occupation')}</span>
          <Segmented label={tt('occupation')} value={app.occ}
                     options={jobs.occupations.map((o) => ({ value: o.key as 'driver' | 'handling', label: o[L] }))} onchange={(v) => (app.occ = v)} />
        </div>
        <div class="ctl time"><TimeControl quarters={jobs.periods} q={app.jp} lang={L} label="fiscalYear" onchange={(q) => (app.jp = q)} /></div>
      {:else}
        <label class="ctl">
          <span class="lab">{tt('field')}</span>
          <select class="sel" value={app.field} onchange={(e) => (app.field = e.currentTarget.value)}>
            {#each fieldOptions as o (o.key)}<option value={o.key} disabled={o.disabled}>{o.label}{o.disabled ? `（${L === 'ja' ? '未計上' : 'no data yet'}）` : ''}</option>{/each}
          </select>
        </label>
        <div class="ctl time"><TimeControl quarters={ssw.periods} q={app.sp} lang={L} onchange={(q) => (app.sp = q)} /></div>
      {/if}
    {/if}
    <div class="ctl">
      <span class="lab">{tt('layers')}</span>
      <div class="toggles">
        <button type="button" class="btn chip" aria-pressed={app.showDpl} onclick={() => (app.showDpl = !app.showDpl)}>
          <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" class="k-built" /></svg>DPL
        </button>
        <button type="button" class="btn chip" aria-pressed={app.showRoads} onclick={() => (app.showRoads = !app.showRoads)}>
          <svg width="16" height="10" aria-hidden="true"><path d="M1 5h14" stroke="currentColor" stroke-width="2" /></svg>{tt('layerRoads')}
        </button>
        {#if news}
          <button type="button" class="btn chip" aria-pressed={app.showNews} onclick={() => (app.showNews = !app.showNews)}>
            <svg width="16" height="12" aria-hidden="true"><rect x="1" y="1.5" width="14" height="9" rx="4.5" class="k-news" /></svg>{tt('layerNews')}
          </button>
        {/if}
        {#if hubs}
          <button type="button" class="btn chip" aria-pressed={app.showHubs} onclick={() => (app.showHubs = !app.showHubs)}>
            <svg width="12" height="12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="3" class="k-hub" /></svg>{tt('layerHubs')}
          </button>
        {/if}
        <button type="button" class="btn chip" aria-pressed={app.compare} disabled={mapMuni}
                onclick={() => (app.compare ? app.stopCompare() : app.startCompare())}>
          <span class="ab" aria-hidden="true">A</span><span class="ab b" aria-hidden="true">B</span>{tt('compare')}
        </button>
      </div>
    </div>
  </section>

  <main id="main" class="grid">
    <div class="mapcol">
      <div class="viewbar">
        <Segmented label={`${tt('map')} / ${tt('table')}`} value={app.view}
                   options={[{ value: 'map', label: tt('map') }, { value: 'table', label: tt('table') }]}
                   onchange={(v) => (app.view = v)} />
        {#if app.pref && !app.compare}
          <button type="button" class="linkish" onclick={clearFocus}>← {tt('backToJapan')}</button>
        {/if}
        {#if app.view === 'table'}<button type="button" class="btn" onclick={exportTable}>{tt('exportCsv')}</button>{/if}
        <div class="search-slot"><PlaceSearch {places} lang={L} onpick={onplace} /></div>
        {#if app.layer === 'flows' && fl.loading}<span class="small" role="status">{tt('loadingFlows')}</span>{/if}
      </div>

      {#if app.view === 'map'}
        <MapView
          bind:this={mapView}
          {geo} values={view.values} classes={view.classes} lang={L} {highlight}
          level={mapMuni ? 'muni' : 'pref'} selMuni={app.muni && !app.compare ? app.muni : null}
          muniA={localLevel ? app.ma || null : null} muniB={localLevel ? app.mb || null : null}
          focus={app.pref ? pad2(app.pref) : null}
          compare={app.compare} a={app.a} b={app.b}
          {markers} site={app.site}
          roads={roadLayer} showRoads={app.showRoads}
          flows={view.flows} {rings} {pois} {tracks} mutedMarkers={app.layer === 'flows'} zoomFocus={app.layer !== 'flows' && (app.layer !== 'score' || muniLevel)}
          prefTip={view.prefTip} {muniTip} {siteTip}
          {onpick} onclear={clearFocus} {onsite}
        />
      {:else}
        {#if nowWarn && nt && muni}
          <RegionTable {names} columns={view.table.columns} primary={view.table.primary} lang={L} focus={muni.codes.indexOf(app.muni)}
                       areas={muni.codes.map((c, i) => ({ id: i, code: c })).filter((x) => live.level(x.code, app.nlog) > 0 && (!app.pref || Number(x.code.slice(0, 2)) === app.pref))
                                .map((x) => ({ id: x.id, label: muniLabel(x.code) }))}
                       onpick={(i) => onpick(muni!.codes[i])} />
        {:else if mt}
          <RegionTable {names} columns={view.table.columns} primary={view.table.primary} lang={L} focus={mt.indexOf(app.muni)}
                       areas={mt.codes.map((c, i) => ({ id: i, code: c })).filter((x) => !app.pref || Number(x.code.slice(0, 2)) === app.pref)
                                .map((x) => ({ id: x.id, label: muniLabel(x.code) }))}
                       onpick={(i) => onpick(mt!.codes[i])} />
        {:else}
          <RegionTable {names} columns={view.table.columns} primary={view.table.primary} lang={L} focus={app.pref}
                       compare={app.compare} a={app.a} b={app.b} onpick={(c) => onpick(String(c))} />
        {/if}
      {/if}

      <div class="below">
        <Legend classes={view.classes} lang={L} title={view.legend.title} fmt={view.legend.fmt} hint={view.legend.hint}
                flows={app.view === 'map' ? view.legend.flows : null}
                showDpl={app.showDpl} showRoads={app.showRoads} compare={app.compare}
                hubs={app.showHubs && hubs ? [...new Set(hubs.items.map((h) => h.kind))] : []}
                categories={app.layer === 'now' && nt ? nt.categories : null} bind:highlight />
        {#if app.layer === 'flows' && view.flows.length}
          <p class="src">{!app.pref && !app.compare ? `${tt(app.near ? 'arcsNationalNear' : 'arcsNational')}${L === 'ja' ? '。' : '. '}` : ''}{tt('flowArcNote')}</p>
        {/if}
        <p class="src">{tt('source')}：<a href={view.source.url}>{view.source.text}</a></p>
      </div>
    </div>

    <aside class="side" aria-live="polite">
      {#if app.compare}
        <section class="panel">
          <p class="eyebrow">{tt('compare')} · {view.periodLabel}</p>
          <ComparePanel {names} lang={L} a={app.a} b={app.b} rows={view.compareRows}
                        onset={(slot, c) => (app[slot] = c)} onswap={() => ([app.a, app.b] = [app.b, app.a])} />
        </section>
        {#if (app.a || app.b) && view.trend}
          {@const tr = view.trend}
          <section class="panel"><Trend series={tr.series} quarters={tr.periods} q={tr.q} lang={L} label={tr.label} format={tr.fmt}
                                        tick={tr.tick} xticks={tr.xticks} dots={tr.dots} onselect={tr.setQ} /></section>
        {/if}
      {:else}
        {@const p = app.pref}
        {@const r = p && !mapMuni ? rank(view, p) : 0}
        {@const tr = view.trend}
        <section class="panel readout">
          {#if mt && app.muni && mt.indexOf(app.muni) >= 0}
            {@const mr = mt.ranks.get(app.muni)}
            <p class="eyebrow">{muniLabel(app.muni)} · {view.periodLabel}</p>
            <p class="kpi tnum">{view.fmt(mt.muniValue(app.muni))}</p>
            <p class="kpi-sub">{view.legend.title}{#if mr} · {tt('rank')} <strong class="tnum">{mr}</strong> / {mt.ranks.size}{/if}</p>
            <p class="memo">
              <button type="button" class="btn" onclick={() => shortlist.toggle('muni', app.muni)}>{shortlist.has('muni', app.muni) ? `★ ${tt('inShort')}` : `☆ ${tt('addShort')}`}</button>
              {#if localLevel}
                <button type="button" class="btn" onclick={() => (app.ma = app.muni)} disabled={app.ma === app.muni}>{tt('setA')}</button>
                <button type="button" class="btn" onclick={() => (app.mb = app.muni)} disabled={app.mb === app.muni}>{tt('setB')}</button>
              {/if}
            </p>
          {:else}
          <p class="eyebrow">{p ? pname(p) : tt('japan')} · {view.periodLabel}</p>
          {#if mt}
            {#if p}
              <p class="kpi tnum">{view.fmt(view.value(p))}</p>
              <p class="kpi-sub">{tt('medianOfMunis')}</p>
            {:else}
              {@const best = [...mt.values].filter(([, v]) => isFinite(v)).sort((x, y) => y[1] - x[1])[0]}
              <p class="kpi tnum">{best ? `${muniLabel(best[0])} ${view.fmt(best[1])}` : '–'}</p>
            {/if}
          {:else if app.layer === 'score' && !p}
            {@const best = topBars(view)[0]}
            <p class="kpi tnum">{best ? `${best.label} ${best.value}` : '–'}</p>
          {:else}
            <p class="kpi tnum">{view.fmt(view.value(p))}</p>
          {/if}
          <p class="kpi-sub">
            {view.legend.title}
            {#if app.layer === 'warehouse' && app.mode === 'value'} · {tt('yoy')} <strong class="tnum">{fmtYoy(L, app.metric, yoyOf(w, app.metric, app.q, p - 1))}</strong>{/if}
            {#if r && !(app.layer === 'flows' && app.fmetric === 'net')} · {tt('rank')} <strong class="tnum">{r}</strong>{L === 'ja' ? tt('rankOf') : ` ${tt('rankOf')}`}{/if}
            {#if p && app.layer === 'warehouse' && app.mode === 'value' && app.metric !== 'vacancy'}
              · {tt('shareOfJapan')} <strong class="tnum">{fmtPct(L, (valueOf(w, app.metric, app.q, p - 1) / valueOf(w, app.metric, app.q, -1)) * 100)}</strong>
            {/if}
          </p>
          {#if app.layer === 'warehouse'}<p class="help">{tt(`mh_${app.metric}`)}</p>
          {:else if app.layer === 'flows'}<p class="help">{census.source.note[L]}</p>
          {:else if app.layer === 'score'}<p class="help">{tt(muniLevel ? 'muniScoreHint' : 'scoreHint')}</p>
          {:else if app.layer === 'now'}<p class="help">{app.nmet === 'warn' ? tt('warnL3Count') : tt('dieselHint')}</p>
          {:else if app.layer === 'local'}<p class="help">{lt?.metric.hint[L] ?? ''}</p>
          {:else}<p class="help">{app.lmetric === 'jobs' ? jobs.source.note[L] : ssw.source.note[L]}</p>{/if}
          {/if}
          {#if p}<p class="memo">
            <button type="button" class="btn" onclick={openDossier}>{tt('makeDossier')}</button>
            <button type="button" class="btn" onclick={() => shortlist.toggle('pref', String(p))}>{shortlist.has('pref', String(p)) ? `★ ${tt('inShort')}` : `☆ ${tt('addShort')}`}</button>
          </p>{/if}
        </section>

        {#if app.layer === 'warehouse' && p}
          <section class="panel">
            <p class="eyebrow">{tt('allMetrics')}</p>
            <div class="tiles">
              {#each METRICS as m (m)}
                <button type="button" class="tile" aria-pressed={m === app.metric} onclick={() => (app.metric = m)}>
                  <span class="tl">{tt(`m_${m}`)}</span>
                  <span class="tv tnum">{fmtValue(L, m, valueOf(w, m, app.q, p - 1))}</span>
                  <span class="ty tnum">{tt('yoy')} {fmtYoy(L, m, yoyOf(w, m, app.q, p - 1))}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}
        {#if app.layer === 'flows' && p}
          <section class="panel">
            <p class="eyebrow">{tt('allMetrics')}</p>
            <div class="tiles">
              {#each FLOW_METRICS as m (m)}
                <button type="button" class="tile" aria-pressed={m === app.fmetric} onclick={() => (app.fmetric = m)}>
                  <span class="tl">{tt(`fm_${m}`)}</span>
                  <span class="tv tnum">{m === 'net' ? fl!.signedTons(fl!.metricOf(m, p)) : fl!.tons(fl!.metricOf(m, p))}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if app.layer === 'now' && nt}
          {#if nt.isWarn}
            {@const lv = (muni?.codes ?? []).map((c) => ({ c, v: live.level(c, app.nlog) })).filter((x) => x.v > 0 && (!p || Number(x.c.slice(0, 2)) === p))}
            <section class="panel">
              <div class="head-row">
                <p class="eyebrow">{tt('warnCounts')}{p ? ` · ${pname(p)}` : ''}</p>
                <span class="small" role="status">{live.loading ? '…' : live.warnTime ? `${tt('liveUpdated')} ${new Date(live.warnTime).toLocaleTimeString(L === 'ja' ? 'ja-JP' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
              </div>
              {#if live.error}<p class="src">{tt('liveError')}: {live.error}</p>{/if}
              <ul class="lvls">
                {#each [5, 4, 3, 2] as l (l)}
                  <li><span class="lv-sw" style:background={nt.categories?.[l - 1]?.color}></span>{nt.levelName(l)} <strong class="tnum">{lv.filter((x) => x.v === l).length}</strong></li>
                {/each}
              </ul>
              <BarList ranked={false} bars={lv.filter((x) => x.v >= 3).sort((a, b) => b.v - a.v || a.c.localeCompare(b.c)).slice(0, 15).map((x) => ({
                key: x.c, label: muniLabel(x.c),
                value: nt!.kinds(x.c).filter((k) => (WARN[k]?.level ?? 2) >= 3).map((k) => WARN[k]?.[L] ?? k).join('・'),
                pct: (x.v / 5) * 100, onclick: () => onpick(x.c) }))} />
              <p class="src note">{tt('warnHint')}</p>
            </section>
          {:else if diesel}
            {@const k = diesel.dates.length - 1}
            {@const order = Array.from({ length: 47 }, (_, i) => i + 1).filter((c) => isFinite(nt!.price(c))).sort((a, b) => nt!.price(b) - nt!.price(a))}
            <section class="panel">
              <p class="eyebrow">{tt('diesel')} · {diesel.dates[k]}</p>
              <BarList bars={[...order.slice(0, 5), ...order.slice(-5)].map((c) => ({ key: String(c), label: pname(c), value: `${nt!.yen(nt!.price(c))} (${nt!.signedYen(nt!.change(c, 1))})`,
                                                                                         pct: ((nt!.price(c) - nt!.price(order.at(-1)!) + 1) / (nt!.price(order[0]) - nt!.price(order.at(-1)!) + 1)) * 100, onclick: () => onpick(pad2(c)) }))} />
              <p class="src note">{tt('dieselStale')}</p>
            </section>
          {/if}
          <section class="panel">
            <p class="eyebrow">{tt('typhoon')}</p>
            {#if live.typhoons.length}
              <ul class="plain">
                {#each live.typhoons as t (t.id)}
                  <li><strong>{tt('typhoon')} {Number(t.number.slice(2)) || ''}{L === 'ja' ? '号' : ''} {t.name[L === 'ja' ? 'jp' : 'en']}</strong> — {t.location}, {t.pressure} hPa,
                    {L === 'ja' ? '最大風速' : 'max wind'} {t.wind} m/s, {t.course} {t.speed} km/h{t.galeKm ? ` · ${tt('galeArea')} ${t.galeKm} km` : ''}
                    {#if t.pos && geo && projectLL(t.pos[1], t.pos[0], geo.layout).space === 'outside'}<span class="small">（{tt('offMap')}）</span>{/if}</li>
                {/each}
              </ul>
            {:else}<p class="src">{tt('noTyphoon')}</p>{/if}
          </section>
          <section class="panel">
            <p class="eyebrow">{tt('quakes')}</p>
            {#if live.quakes.length}
              <ul class="plain">
                {#each live.quakes.slice(0, 10) as q (q.eid)}
                  <li><span class="int" style:background={INT_COLOR[q.maxi]?.[0]} style:color={INT_COLOR[q.maxi]?.[1]}>{q.maxi.replace('-', '弱').replace('+', '強')}</span>
                    {q.name} · {new Date(q.at).toLocaleString(L === 'ja' ? 'ja-JP' : 'en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{q.mag !== null ? ` · M${q.mag}` : ''}</li>
                {/each}
              </ul>
            {:else}<p class="src">{tt('noQuakes')}</p>{/if}
            <p class="src note">{tt('jmaSource')}</p>
          </section>
        {/if}

        {#if localLevel && lt}
          {#if app.muni && lt.indexOf(app.muni) >= 0}
            <section class="panel">
              <p class="eyebrow">{tt('profile')} · {muniLabel(app.muni)}</p>
              <MuniProfile rows={lt.profile(app.muni)} lang={L} current={app.lmet} onmetric={(k) => (app.lmet = k)} />
            </section>
          {/if}
          {#if app.ma || app.mb}
            <section class="panel">
              <p class="eyebrow">{tt('compareMunis')}</p>
              <ComparePanel {names} lang={L} a={1} b={2} rows={lt.compareRows}
                            labels={[app.ma ? muniLabel(app.ma) : '', app.mb ? muniLabel(app.mb) : '']}
                            onset={() => {}} onswap={() => ([app.ma, app.mb] = [app.mb, app.ma])}
                            onclear={(slot) => (slot === 'a' ? (app.ma = '') : (app.mb = ''))} />
            </section>
          {/if}
          {@const met = lt.metric}
          {@const topM = lt.codes.map((c, i) => ({ c, v: lt!.raw[i] })).filter((x) => isFinite(x.v) && (!p || Number(x.c.slice(0, 2)) === p))
            .sort((a, b) => (met.better === -1 ? a.v - b.v : b.v - a.v)).slice(0, 10)}
          <section class="panel">
            <p class="eyebrow">{tt('topMunis')}{p ? ` · ${pname(p)}` : ''} · {met[L]}</p>
            <BarList bars={topM.map((x) => ({ key: x.c, label: muniLabel(x.c), value: met.fmt(x.v),
                                              pct: (Math.abs(x.v) / Math.max(...topM.map((y) => Math.abs(y.v)), 1e-9)) * 100, neg: x.v < 0, onclick: () => onpick(x.c) }))} />
          </section>
        {/if}

        {#if app.layer === 'score'}
          <section class="panel">
            <div class="head-row">
              <p class="eyebrow">{tt('weights')}</p>
              {#if app.preset !== 'balanced'}<button type="button" class="linkish" onclick={() => { app.preset = 'balanced'; app.weights = {}; }}>{tt('resetWeights')}</button>{/if}
            </div>
            <WeightPanel criteria={scv!.criteria} weights={scv!.weights} lang={L} onweight={(k, v) => scv!.setWeight(k, v)} />
            <p class="src note">{tt('scoreCaveat')}{#if muniLevel} {tt('inheritedNote')}{/if} <a href="#method" onclick={() => { const d = document.getElementById('method') as HTMLDetailsElement | null; if (d) d.open = true; }}>{tt('method')}</a></p>
          </section>
          {#if muniLevel && msc && app.muni && msc.indexOf(app.muni) >= 0}
            <section class="panel">
              <p class="eyebrow">{tt('breakdown')} · {muniLabel(app.muni)}</p>
              <ScoreBreakdown criteria={msc.criteria} parts={msc.result.parts} weights={msc.weights} code={msc.indexOf(app.muni) + 1} lang={L} />
            </section>
          {:else if !muniLevel && p}
            <section class="panel">
              <p class="eyebrow">{tt('breakdown')} · {pname(p)}</p>
              <ScoreBreakdown criteria={sc.criteria} parts={sc.result.parts} weights={sc.weights} code={p} lang={L} />
            </section>
          {/if}
          {#if muniLevel && msc}
            {@const inPref = msc.codes.map((c, i) => ({ c, i, v: msc!.result.total[i] })).filter((x) => isFinite(x.v) && (!p || Number(x.c.slice(0, 2)) === p))
              .sort((a, b) => b.v - a.v).slice(0, 10)}
            <section class="panel">
              <p class="eyebrow">{tt('topMunis')}{p ? ` · ${pname(p)}` : ''}</p>
              <BarList bars={inPref.map((x) => ({ key: x.c, label: muniLabel(x.c), value: view.fmt(x.v), pct: x.v, onclick: () => onpick(x.c) }))} />
            </section>
          {/if}
        {/if}

        {#if tr}
        <section class="panel">
          <Trend series={tr.series} quarters={tr.periods} q={tr.q} lang={L} label={tr.label} format={tr.fmt}
                 tick={tr.tick} xticks={tr.xticks} dots={tr.dots} onselect={tr.setQ} />
          {#if app.layer === 'labour' && app.lmetric === 'jobs'}<p class="src note">{tt('breakNote')}</p>{/if}
        </section>
        {/if}

        {#if app.layer === 'flows'}
          {#if p}
            {#each ['out', 'in'] as const as dir (dir)}
              {@const list = fl.partners(p, dir, 10)}
              <section class="panel">
                <p class="eyebrow">{tt(dir === 'out' ? 'topOut' : 'topIn')}</p>
                <BarList bars={list.map((x) => ({ key: String(x.code), label: pname(x.code), value: `${fl!.tons(x.v)} · ${fmtPct(L, x.share, 0)}`,
                                                   pct: (x.v / (list[0]?.v || 1)) * 100, onclick: () => onpick(String(x.code)) }))} />
              </section>
            {/each}
          {:else}
            {@const pairs = fl.topPairs(10)}
            <section class="panel">
              <p class="eyebrow">{tt('topPairs')}</p>
              <BarList bars={pairs.map((x) => ({ key: `${x.o}-${x.d}`, label: `${pname(x.o)} → ${pname(x.d)}`, value: fl!.tons(x.v),
                                                  pct: (x.v / (pairs[0]?.v || 1)) * 100, onclick: () => onpick(String(x.o)) }))} />
            </section>
          {/if}
        {/if}

        {#if app.layer === 'labour'}
          {#if app.lmetric === 'ssw'}
            <section class="panel note-card">
              <p class="eyebrow">{tt('warehouseField')}</p>
              <p>{tt('warehouseFieldNote')}</p>
              {#if app.field === 'transport'}<p>{tt('transportFieldNote')}</p>{/if}
            </section>
          {:else}
            <section class="panel">
              <p class="eyebrow">{tt('regionShortfall')}</p>
              <BarList ranked={false} bars={jobs.shortfall2024.regions.map((r) => ({ key: r.en, label: r[L], value: fmtPct(L, r.pct),
                                                                                      pct: (r.pct / 20) * 100 }))} />
              <p class="src note">{tt('shortfallNote')} <a href={jobs.shortfall2024.source.url}>{jobs.shortfall2024.source[L]}</a> ·
                <a href={jobs.shortfall2024.national.source.url}>{jobs.shortfall2024.national.source[L]}</a></p>
            </section>
          {/if}
        {/if}

        {#if app.site >= 0 && sites[app.site] && muni?.sites[sites[app.site].name]}
          <section class="panel">
            <SiteCard name={sites[app.site].name} c={muni.sites[sites[app.site].name]} median={muni.siteMedian} lang={L}
                      extra={hubRows(sites[app.site].name)} />
            <p class="memo"><button type="button" class="btn" onclick={() => shortlist.toggle('site', String(app.site))}>{shortlist.has('site', String(app.site)) ? `★ ${tt('inShort')}` : `☆ ${tt('addShort')}`}</button></p>
          </section>
        {/if}
        {#if p && (app.layer === 'warehouse' || app.showDpl)}
          <section class="panel">
            <p class="eyebrow">{tt('dplIn')} · {pname(p)}</p>
            <SiteList sites={sitesIn(p)} lang={L} selected={app.site} {onsite} />
            <p class="src">{dplSource}</p>
          </section>
        {:else if !p && app.layer !== 'flows' && !mapMuni && app.layer !== 'now'}
          <section class="panel">
            <p class="eyebrow">{app.layer === 'score' ? tt('ranking') : tt('top')}</p>
            <BarList bars={topBars(view)} />
          </section>
        {/if}
        <section class="panel">
          <div class="head-row">
            <p class="eyebrow">{tt('shortlist')}{shortlist.items.length ? `（${shortlist.items.length}）` : ''}</p>
            {#if shortlist.items.length}
              <span class="acts">
                <button type="button" class="linkish" onclick={exportShortlist}>{tt('exportCsv')}</button>
                <button type="button" class="linkish" onclick={() => shortlist.clear()}>{tt('clearAll')}</button>
              </span>
            {/if}
          </div>
          {#if shortlist.items.length}
            <ul class="short">
              {#each shortlist.items as it (it.kind + it.code)}
                <li>
                  <button type="button" class="linkish" onclick={() => openShort(it)}>{shortLabel(it)}</button>
                  <span class="kind">{shortKind(it)}</span>
                  <button type="button" class="btn ghost x" aria-label={tt('remove')} onclick={() => shortlist.toggle(it.kind, it.code)}>×</button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="src">{tt('shortEmpty')}</p>
          {/if}
        </section>
        {#if news}
          <section class="panel">
            <p class="eyebrow">{tt('news')}</p>
            <NewsFeed {news} lang={L} pref={p} {pname} onpref={(c) => onpick(String(c))} />
          </section>
        {/if}
      {/if}
    </aside>
  </main>

  <footer class="foot">
    <h2 class="eyebrow">{tt('sources')}</h2>
    <dl>
      <dt>{L === 'ja' ? '営業倉庫' : 'Warehouses'}</dt>
      <dd>
        <a href={w.source.url}>{w.source[L]}</a>. {w.source.scope[L]}
        {L === 'ja' ? '収録' : 'Coverage'}: {L === 'ja' ? w.quarters[0].ja : w.quarters[0].en} – {L === 'ja' ? w.quarters.at(-1)!.ja : w.quarters.at(-1)!.en}
        {L === 'ja' ? `（最新号 ${fmtDate(L, w.quarters.at(-1)!.published)}公表）。` : ` (latest issue published ${fmtDate(L, w.quarters.at(-1)!.published)}).`}
        {tt('lagNote')} {#if w.notes.length}{tt('totalReplaced')} ({w.notes.map((n) => n.quarter).join(', ')}){/if}
      </dd>
      <dt>{tt('layerFlows')}</dt>
      <dd><a href={census.source.url}>{census.source[L]}</a>: {census.years.map((y) => y.survey[L]).join(', ')}. {census.source.note[L]} {census.source.licence[L]}.</dd>
      <dt>{tt('lm_jobs')}</dt>
      <dd><a href={jobs.source.url}>{jobs.source[L]}</a> ({jobs.periods[0][L]}–{jobs.periods.at(-1)![L]}). {jobs.source.note[L]}</dd>
      <dt>{tt('lm_ssw')}</dt>
      <dd><a href={ssw.source.url}>{ssw.source[L]}</a> ({ssw.periods[0][L]}–{ssw.periods.at(-1)![L]}). {ssw.source.note[L]}</dd>
      <dt>{L === 'ja' ? '輸送力不足' : 'Capacity shortfall'}</dt>
      <dd><a href={jobs.shortfall2024.national.source.url}>{jobs.shortfall2024.national.source[L]}</a>; <a href={jobs.shortfall2024.source.url}>{jobs.shortfall2024.source[L]}</a></dd>
      <dt>DPL</dt>
      <dd><a href={dpl.source.url}>{dpl.source[L]}</a>{L === 'ja'
        ? `（${fmtDate(L, dpl.source.updated)}更新、${fmtDate(L, dpl.source.retrieved)}取得）。`
        : ` (updated ${fmtDate(L, dpl.source.updated)}, retrieved ${fmtDate(L, dpl.source.retrieved)}). `}{dpl.source.note[L]}</dd>
      {#if roads}
        <dt>{tt('layerRoads')}</dt>
        <dd><a href={roads.source.url}>{roads.source[L]}</a></dd>
      {/if}
      {#if risk}
        <dt>{tt('groupRisk')}</dt>
        <dd>{#each (risk as unknown as { criteria: ExtraCriteria[] }).criteria as c, i (c.key)}{i ? '; ' : ''}{c[L]}: {c.source[L]}{/each}.
          {L === 'ja' ? 'DPL地点のハザード：' : 'Hazards at DPL sites: '}<a href="https://www.j-shis.bosai.go.jp/">J-SHIS</a>,
          <a href="https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html">{L === 'ja' ? 'ハザードマップポータルサイト' : 'Hazard Map Portal'}</a>.</dd>
      {/if}
      {#if news}
        <dt>{tt('news')}</dt>
        <dd>{#each news.sources as s, i (s.key)}{i ? ', ' : ''}<a href={s.url}>{s[L]}</a>{/each}. {L === 'ja' ? '国土交通省の見出しは国土交通省ウェブサイトへのリンクです。' : 'MLIT headlines link to the MLIT website.'}</dd>
      {/if}
      {#if hubs}
        <dt>{tt('layerHubs')}</dt>
        <dd>{#each Object.values(hubs.sources) as s, i (s.url)}{i ? '; ' : ''}<a href={s.url}>{s[L]}</a>{/each}</dd>
      {/if}
      <dt>{tt('boundaries')}</dt>
      <dd>{tt('boundarySource')}</dd>
    </dl>
    {#if hubs?.noncommercial}<p class="next">{tt('noncommercialNote')}</p>{/if}
    <details id="method" class="method">
      <summary>{tt('method')}</summary>
      <p>{tt('methodBody')}</p>
    </details>
    <p class="next">{tt('phaseNext')}</p>
  </footer>
  {#if dossierOpen && dossier}
    <Dossier title={dossier.title} subtitle={tt('dossierSub')} sections={dossier.sections} sources={dossier.sources} lang={L} onclose={() => (dossierOpen = false)} />
  {/if}
{/if}

<style>
  .skip { position: absolute; left: -9999px; top: 8px; z-index: 100; background: var(--surface); padding: 8px 12px; border-radius: 8px; }
  .skip:focus { left: 8px; }

  .top {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px;
    padding: 16px clamp(16px, 3vw, 32px) 12px;
  }
  .brand { display: flex; gap: 12px; align-items: center; min-width: 0; }
  .logo { flex: none; }
  h1 { margin: 0; font-size: 20px; line-height: 1.25; letter-spacing: 0.01em; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .phase { font-size: 11px; font-weight: 500; color: var(--muted); border: 1px solid var(--line-strong); border-radius: 4px; padding: 1px 6px; }
  .sub { margin: 2px 0 0; font-size: 13px; color: var(--muted); max-width: 72ch; }
  .prefs { display: flex; gap: 8px; flex-wrap: wrap; }

  .state { padding: 64px 16px; text-align: center; color: var(--ink-2); }
  .small { font-size: 12px; color: var(--muted); }

  .subjects { padding: 0 clamp(16px, 3vw, 32px) 12px; border-bottom: 1px solid var(--line); }
  .subjects :global(.seg button) { min-height: 38px; padding: 0 18px; font-size: 14.5px; }

  .controls {
    display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end;
    padding: 12px clamp(16px, 3vw, 32px);
    border-bottom: 1px solid var(--line);
    background: var(--surface);
    position: sticky; top: 0; z-index: 40;
  }
  .ctl { display: grid; gap: 4px; min-width: 0; }
  .ctl .lab { font-size: 12px; color: var(--muted); }
  .ctl.time { flex: 1 1 280px; max-width: 520px; }
  .sel {
    min-height: 38px; padding: 0 10px; max-width: 100%;
    border: 1px solid var(--line-strong); border-radius: 9px; background: var(--surface-2); font-size: 13.5px;
  }
  .toggles { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { min-height: 36px; font-size: 13px; }
  .chip[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
  .chip:disabled { opacity: 0.4; cursor: not-allowed; }
  .chip[aria-pressed='true'] .ab { background: var(--bg); }
  .k-built { fill: var(--mark); stroke: var(--mark-ring); stroke-width: 1.4; }
  .k-hub { fill: var(--surface); stroke: var(--hub); stroke-width: 1.6; }
  .k-news { fill: currentColor; }

  .grid {
    display: grid; gap: 24px 32px;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 400px);
    padding: 16px clamp(16px, 3vw, 32px) 24px;
  }
  .mapcol { min-width: 0; display: grid; gap: 10px; align-content: start; }
  .viewbar { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; }
  .search-slot { margin-left: auto; flex: 0 1 300px; }
  @media (max-width: 720px) { .search-slot { flex-basis: 100%; margin-left: 0; } }
  .below { display: grid; gap: 8px; }
  .src { margin: 0; font-size: 11.5px; color: var(--muted); }
  .src a { color: var(--muted); }
  .src.note { margin-top: 8px; }

  .side { display: grid; gap: 20px; align-content: start; min-width: 0; border-left: 1px solid var(--line); padding-left: 32px; }
  .panel { min-width: 0; }
  .readout .kpi { margin: 0; font-size: clamp(28px, 4vw, 36px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
  .kpi-sub { margin: 6px 0 0; font-size: 13px; color: var(--ink-2); }
  .kpi-sub strong { color: var(--ink); font-weight: 600; }
  .help { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
  .head-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .head-row .eyebrow { margin-bottom: 10px; }
  .lvls { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; }
  .lvls li { display: inline-flex; align-items: center; gap: 6px; }
  .lv-sw { width: 14px; height: 10px; border-radius: 2px; border: 1px solid var(--line-strong); display: inline-block; }
  .plain { margin: 0; padding-left: 0; list-style: none; display: grid; gap: 6px; font-size: 13px; }
  .int { display: inline-block; min-width: 30px; text-align: center; border-radius: 4px; font-weight: 700; font-size: 12px; padding: 0 4px; margin-right: 6px; }
  .memo { margin: 12px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .acts { display: inline-flex; gap: 12px; }
  .short { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .short li { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; min-height: 36px; border-bottom: 1px solid var(--line); }
  .short .kind { font-size: 11.5px; color: var(--muted); }
  .short .x { min-height: 32px; padding: 0 8px; }
  .note-card { border: 1px solid var(--line); border-left: 3px solid var(--mark); border-radius: var(--radius); padding: 12px 14px; background: var(--surface); font-size: 13px; }
  .note-card p { margin: 0; }
  .note-card p + p { margin-top: 8px; color: var(--ink-2); }

  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .tile {
    display: grid; gap: 2px; text-align: left; padding: 10px 12px; min-height: 44px;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
  }
  .tile:hover { border-color: var(--line-strong); }
  .tile[aria-pressed='true'] { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
  .tl { font-size: 12px; color: var(--muted); }
  .tv { font-size: 16px; font-weight: 600; }
  .ty { font-size: 11.5px; color: var(--ink-2); }

  .foot { padding: 20px clamp(16px, 3vw, 32px) 40px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--ink-2); }
  .foot dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; max-width: 110ch; }
  .foot dt { color: var(--muted); }
  .foot dd { margin: 0; }
  .next { margin: 16px 0 0; color: var(--muted); }
  .method { margin-top: 16px; max-width: 110ch; }
  .method summary { cursor: pointer; font-weight: 600; color: var(--ink); min-height: 32px; }
  .method p { margin: 6px 0 0; line-height: 1.7; }

  @media (max-width: 1080px) {
    .grid { grid-template-columns: 1fr; }
    .side { border-left: 0; padding-left: 0; border-top: 1px solid var(--line); padding-top: 20px;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 24px 32px; }
  }
  @media (max-width: 720px) {
    .top { padding-top: 12px; }
    h1 { font-size: 18px; }
    .sub { display: none; }
    .subjects :global(.seg) { display: flex; width: 100%; }
    .subjects :global(.seg button) { flex: 1; padding: 0 8px; }
    .controls { position: static; gap: 10px 16px; }
    .controls :global(.seg) { max-width: 100%; flex-wrap: wrap; }
    .ctl.time { flex-basis: 100%; }
    .foot dl { grid-template-columns: 1fr; }
    .foot dt { margin-top: 8px; }
  }
</style>
