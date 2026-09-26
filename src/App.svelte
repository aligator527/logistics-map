<script lang="ts">
  import { onMount } from 'svelte';
  import { store as s } from './lib/store.svelte';
  import NowPanels from './panels/NowPanels.svelte';
  import LocalPanels from './panels/LocalPanels.svelte';
  import ScorePanels from './panels/ScorePanels.svelte';
  import FlowsPanels from './panels/FlowsPanels.svelte';
  import LabourPanels from './panels/LabourPanels.svelte';
  import ShortlistPanel from './panels/ShortlistPanel.svelte';
  import SourcesFooter from './panels/SourcesFooter.svelte';
  import GlossaryPanel from './panels/GlossaryPanel.svelte';
  import TermText from './components/TermText.svelte';
  import { loadCensusIndex, loadDpl, loadJobs, loadRoads, loadSsw, loadWarehouse, METRICS, fmtDate, fmtValue, fmtYm, fmtYoy,
           isBuilt, valueOf, yoyOf, type CensusIndex, type Dpl, type Jobs, type Roads, type Ssw, type Warehouse } from './lib/data';
  import { loadGeo, loadMunis, roadPaths, type GeoData, type Shape } from './lib/geo';
  import { app, type FlowBasis, type FlowMetric, type HashLists, type Layer, type LabourMetric, type Theme } from './lib/state.svelte';
  import { prefName, t, type Key } from './lib/i18n';
  import { fmtCompact, fmtMinutes, fmtNum, fmtPct, fmtSqm } from './lib/scale';
  import { WarehouseTheme } from './themes/warehouse.svelte';
  import { FlowsTheme, FLOW_METRICS } from './themes/flows.svelte';
  import { LabourTheme } from './themes/labour.svelte';
  import { PRESETS, ScoreTheme, type ExtraCriteria, type PrefStats } from './themes/score.svelte';
  import { MUNI_PRESETS } from './themes/muni-presets';
  import { tripClass } from './lib/trips';
  import type { Diesel } from './themes/now.svelte';
  import { live, WARN, INT_COLOR } from './lib/live.svelte';
  import type { Network } from './lib/travel';
  import { TILE_LAYERS } from './lib/tiles';
  import { pointInfo, groundRisk, type PointInfo } from './lib/pointinfo';
  import { unproject } from './lib/project';
  import PointPanel from './panels/PointPanel.svelte';
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
  import NewsFeed, { type News, type NewsItem } from './components/NewsFeed.svelte';
  import NewsStrip from './components/NewsStrip.svelte';
  import type { NewsGroup } from './lib/newsmap';
  import { relatedOf, timelineOf, type NewsLite, type Related } from './lib/related';
  import SiteCard, { type Catchment } from './components/SiteCard.svelte';
  import PlaceSearch, { type Place } from './components/PlaceSearch.svelte';
  import type { DossierSection } from './components/Dossier.svelte';
  import Segmented from './components/Segmented.svelte';
  import type { Tip } from './components/Tooltip.svelte';


  // loaded data lives in the shared store (the side panels read it too)
  const w = $derived(s.w), geo = $derived(s.geo), dpl = $derived(s.dpl), roads = $derived(s.roads), census = $derived(s.census);
  const ssw = $derived(s.ssw), jobs = $derived(s.jobs), news = $derived(s.news), hubs = $derived(s.hubs), muni = $derived(s.muni);
  const risk = $derived(s.risk), diesel = $derived(s.diesel);
  let error = $state<string | null>(null);
  let highlight = $state<number | null>(null);

  const L = $derived(app.lang);
  const tt = (k: Key) => t(L, k);

  // ------------------------------------------------------------ themes
  const names = $derived(s.names), muniShape = $derived(s.muniShape);
  const { pname, muniLabel, onpick, onsite, clearFocus, showReach, originName, hubRows, srcName } = s;
  const today = new Date();
  const sites = $derived(s.sites);
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
  const wh = $derived(s.wh), fl = $derived(s.fl), lb = $derived(s.lb), sc = $derived(s.sc), msc = $derived(s.msc), lt = $derived(s.lt), nt = $derived(s.nt);
  const nowWarn = $derived(s.nowWarn), muniLevel = $derived(s.muniLevel), localLevel = $derived(s.localLevel), mapMuni = $derived(s.mapMuni);
  const mt = $derived(s.mt), view = $derived(s.view), scv = $derived(s.scv);

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
      const [ww, g, d, ci, sw, j, ps, extra] = await Promise.all([loadWarehouse(), loadGeo(), loadDpl(), loadCensusIndex(), loadSsw(), loadJobs(),
        fetch(`${import.meta.env.BASE_URL}geo/prefstats.json`).then((r) => r.json() as Promise<PrefStats>), loadRiskCriteria()]);
      s.wh = new WarehouseTheme(ww, ctx);
      const flows = new FlowsTheme(ci, ctx);
      s.fl = flows;
      s.lb = new LabourTheme(j, sw, ctx);
      s.sc = new ScoreTheme(ww, flows, j, sw, ps, extra, ctx);
      s.w = ww; s.geo = g; s.dpl = d; s.census = ci; s.ssw = sw; s.jobs = j;
      app.fromHash(location.hash, lists!);
      // The rest follows the first paint: at once when the opening view needs municipalities,
      // else when the browser is idle (parsing 1,898 boundaries is the heaviest work on a phone).
      const needMunis = app.layer === 'local' || app.layer === 'now' || (app.layer === 'score' && app.slevel === 'muni') || !!app.pref || !!app.muni;
      const later = (fn: () => void) => (needMunis ? setTimeout(fn, 0)
        : 'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 400));
      // roads are secondary: the map works without them
      loadRoads().then((r) => (s.roads = r)).catch((e) => console.warn('roads', e));
      later(() => loadMunis(g).then((full) => (s.geo = full)).catch((e) => console.warn('munis', e)));
      later(() => void loadSecondary(j, extra));
    } catch (e) {
      error = String(e);
    }
  }
  async function loadSecondary(j: Jobs, extra: ExtraCriteria[]) {
    try {
      s.diesel = await fetch(`${import.meta.env.BASE_URL}data/diesel.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      // the municipal themes are split out of the first download
      const themes = Promise.all([import('./themes/muniscore.svelte'), import('./themes/local.svelte'), import('./themes/now.svelte')]);
      fetch(`${import.meta.env.BASE_URL}data/muni.json`).then((r) => (r.ok ? r.json() : null)).then(async (d) => {
        if (!d) return;
        const [{ MuniScoreTheme }, { LocalTheme }, { NowTheme }] = await themes;
        s.muni = d;
        sc!.landRaw = d.prefLand.map((v: number | null) => v ?? NaN);
        const t = new MuniScoreTheme(d, j, extra, ctx);
        t.setNamer(muniLabel);
        s.msc = t;
        const l = new LocalTheme(d, ctx);
        l.setNamer(muniLabel);
        s.lt = l;
        const nw = new NowTheme(diesel, d.codes, ctx);
        nw.setNamer(muniLabel);
        s.nt = nw;
        // the hash may carry municipal weights that were not known at boot
        app.fromHash(location.hash, lists!);
      }).catch((e) => console.warn('muni', e));
      fetch(`${import.meta.env.BASE_URL}data/multimodal.json`).then((r) => (r.ok ? r.json() : null)).then((d) => (s.hubs = d)).catch(() => {});
      fetch(`${import.meta.env.BASE_URL}data/news.json`).then((r) => (r.ok ? r.json() : null)).then((n) => (s.news = n)).catch(() => {});
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
    if (app.layer !== 'now' && !shortlist.items.length) return;
    live.start();
    return () => live.stop();
  });
  // road network (~300 KB) for travel times: loaded when a view needs it
  let netLoading = $state(false);
  $effect(() => {
    if (!lt || !hubs || lt.router || netLoading) return;
    if (!(app.layer === 'local' || muniLevel || app.site >= 0 || shortlist.items.length || s.inspect)) return;
    netLoading = true;
    Promise.all([fetch(`${import.meta.env.BASE_URL}geo/network.json`).then((r) => (r.ok ? r.json() : null)), import('./lib/travel')]).then(([n, { Router }]: [Network | null, typeof import('./lib/travel')]) => {
      if (n && lt && hubs) lt.setTravel(new Router(n), hubs.items);
    }).catch((e) => console.warn('network', e)).finally(() => (netLoading = false));
  });
  $effect(() => { if (msc && lt?.hubTimes) msc.portTimes = lt.hubTimes.port; });
  // 1 km grid (~360 KB): loaded and prepared when the grid view or a map-picked origin needs it
  $effect(() => {
    const l = lt;
    if (!l?.reach || l.grid || s.gridLoading || !(app.igrid || s.pickArmed || app.iso.startsWith('pt:'))) return;
    s.gridLoading = true;
    import('./lib/travel').then(({ loadGrid }) => loadGrid(`${import.meta.env.BASE_URL}geo/grid.bin.gz`)).then(async (g) => { await l.reach!.prepare(g); l.grid = g; })
      .catch((e) => console.warn('grid', e)).finally(() => (s.gridLoading = false));
  });
  /** grid cell centres in map units */
  const gridXY = $derived.by(() => {
    const g = lt?.grid;
    if (!g || !geo) return null;
    const xy = new Float32Array(2 * g.n);
    for (let i = 0; i < g.n; i++) { const [x, y] = geo.P(projectLL(g.lon[i], g.lat[i], geo.layout).p); xy[2 * i] = x; xy[2 * i + 1] = y; }
    return xy;
  });
  const raster = $derived.by(() => {
    const l = lt, g = l?.gridTimes, xy = gridXY;
    if (!localLevel || !l || !g || !xy || !app.igrid || !(app.lmet === 'iso' || app.lmet === 'shift')) return null;
    const trip = app.lmet === 'shift', cls = l.classes, colors = l.tripColors;
    const color = (i: number) => {
      const v = g[i];
      if (!isFinite(v)) return null;
      if (trip) return colors[tripClass(v) - 1];
      let k = 0;
      while (k < cls.breaks.length && v >= cls.breaks[k]) k++;
      return cls.colors[k];
    };
    return { xy, color, size: 1000 * geo!.unitsPerMetre, version: [g, app.lmet, app.dark] };
  });
  /** a map point (viewBox units) -> lon/lat, insets undone */
  function toLonLat([x, y]: [number, number]): [number, number] | null {
    if (!geo?.layout) return null;
    const inset = geo.insets.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    const P0 = geo.P([0, 0]), k = geo.P([1, 0])[0] - P0[0];
    const planar: [number, number] = [(x - P0[0]) / k, -(y - P0[1]) / k];
    return unproject(planar, geo.layout, inset ? (inset.key as 'okinawa' | 'ogasawara') : 'main');
  }
  function onpointAny(xy: [number, number]) {
    if (!s.inspectArmed) return onpoint(xy);
    const ll = toLonLat(xy);
    s.inspectArmed = false;
    if (!ll) return;
    s.inspectLoading = true;
    s.inspect = null;
    pointInfo(ll[0], ll[1]).then((i) => (s.inspect = i)).finally(() => (s.inspectLoading = false));
  }
  /** elevation and landform at the selected DPL site */
  let siteInfo = $state.raw<{ name: string; info: PointInfo } | null>(null);
  $effect(() => {
    const st = app.site >= 0 ? sites[app.site] : null;
    if (!st || siteInfo?.name === st.name) return;
    pointInfo(st.lon, st.lat).then((info) => (siteInfo = { name: st.name, info })).catch(() => {});
  });
  function pointRows(i: PointInfo): [string, string][] {
    const r = groundRisk(i);
    return [
      [tt('elevation'), i.elev !== null ? `${fmtNum(L, i.elev, 1)} m` : '–'],
      ...(i.natural ? [[tt('landformNatural'), i.natural[L]] as [string, string]] : []),
      ...(i.artificial ? [[tt('landformArtificial'), i.artificial[L]] as [string, string]] : []),
      ...(r ? [[tt('groundRisk'), tt(`risk_${r}` as Key)] as [string, string]] : []),
    ];
  }
  /** a click on the map while picking: the nearest populated 1 km cell becomes the origin */
  function onpoint([x, y]: [number, number]) {
    const g = lt?.grid, xy = gridXY;
    if (!g || !xy) return;
    let best = -1, bd = Infinity;
    for (let i = 0; i < g.n; i++) { const d = (xy[2 * i] - x) ** 2 + (xy[2 * i + 1] - y) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best < 0 || Math.sqrt(bd) > 10_000 * geo!.unitsPerMetre) return; // the sea, or ~10 km from anyone: keep picking
    s.pickArmed = false;
    app.iso = `pt:${g.lon[best].toFixed(3)},${g.lat[best].toFixed(3)},${g.comp[best]}`;
    if (app.lmet !== 'iso' && app.lmet !== 'shift') app.lmet = 'iso';
  }
  // census tables (~70 KB each) are loaded when the flow theme (or the score, which uses them) is opened
  $effect(() => { if ((app.layer === 'flows' || app.layer === 'score') && fl) fl.load(); });

  /** hazard criteria for the score (public/data/risk.json); the score works without them */
  async function loadRiskCriteria(): Promise<ExtraCriteria[]> {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}data/risk.json`);
      if (!r.ok) return [];
      const j = await r.json();
      s.risk = j;
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
  // ------------------------------------------------------------ news on the map
  /** topic filter shared by the side list and the map */
  let newsTopic = $state('');
  /** callouts pinned by a click on the map; the place under the pointer (list, card, carousel) */
  let newsPins = $state<string[]>([]);
  let newsFocus = $state<string | null>(null);
  let mapW = $state(1000);
  /** wide map: callout cards over the sea; narrow: a card strip under the map */
  const newsCards = $derived(mapW >= 640);
  /** group key of a news item: its first municipality, else prefecture, else national */
  const newsKeyOf = (it: NewsItem) => (it.munis.length ? `m${it.munis[0]}` : it.prefs.length ? `p${pad2(it.prefs[0])}` : 'jp');
  /** news of the last 90 days grouped by place (an item naming two places is shown at both) */
  const newsGroups = $derived.by((): NewsGroup[] => {
    if (!geo || !news || !app.showNews) return [];
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const fresh = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const groups = new Map<string, NewsItem[]>();
    for (const it of news.items) {
      if (it.date < since || (newsTopic && !it.topics.includes(newsTopic))) continue;
      const keys = it.munis.length ? it.munis.map((c) => `m${c}`) : it.prefs.length ? it.prefs.map((c) => `p${pad2(c)}`) : ['jp'];
      for (const k of keys) (groups.get(k) ?? groups.set(k, []).get(k)!).push(it);
    }
    const out: NewsGroup[] = [];
    for (const [k, items] of groups) {
      const code = k === 'jp' ? '' : k.slice(1);
      let xy: [number, number] | null = null;
      if (k.startsWith('m') && muni) { const c = (muni as unknown as { xy?: ([number, number] | null)[] }).xy?.[muni.codes.indexOf(code)]; if (c) xy = geo.P(c); }
      if (k.startsWith('p')) xy = geo.anchors[Number(code) - 1];
      if (k !== 'jp' && !xy) continue;
      out.push({ key: k, code, label: k === 'jp' ? tt('japan') : k.startsWith('m') ? muniLabel(code) : pname(Number(code)), xy, latest: items[0].date,
                 items: items.map((it) => ({ t: it.t, link: it.link, ex: it.ex ?? '', img: it.img ?? null, date: it.date, src: srcName(it.src), isNew: it.date >= fresh })) });
    }
    return out.sort((a, b) => b.latest.localeCompare(a.latest));
  });
  const newsPois = $derived.by((): Poi[] => newsGroups.filter((g) => g.xy).map((g) => ({
    key: g.key, kind: 'news', xy: g.xy!, r: 9, badge: String(g.items.length), label: '', major: false, fresh: g.items.some((x) => x.isNew),
    tip: { title: g.label, sub: `${g.items.length} ${tt('newsOnMap')}`, note: tt('newsClick'),
           rows: g.items.slice(0, 3).map((it) => [it.date.slice(5), it.t.length > 34 ? it.t.slice(0, 33) + '…' : it.t] as [string, string]) } })));
  const nationalNews = $derived(newsGroups.find((g) => g.key === 'jp') ?? null);
  // related news over the whole archive (not only the last 90 days on the map); cached per link
  const newsLite = $derived.by((): NewsLite[] => {
    if (!news) return [];
    const dev = new Set(news.sources.filter((s) => (s as { group?: string }).group === 'developer').map((s) => s.key));
    return news.items.map((it) => ({ t: it.t, link: it.link, date: it.date, src: it.src, srcName: srcName(it.src), developer: dev.has(it.src),
                                     topics: it.topics, prefs: it.prefs, munis: it.munis }));
  });
  const liteByLink = $derived(new Map(newsLite.map((x) => [x.link, x])));
  const relCache = $derived.by(() => { void newsLite; return new Map<string, Related[]>(); });
  const tlCache = $derived.by(() => { void newsLite; return new Map<string, NewsLite[]>(); });
  function relatedFor(link: string): Related[] {
    const it = liteByLink.get(link);
    if (!it) return [];
    if (!relCache.has(link)) relCache.set(link, relatedOf(it, newsLite, 5));
    return relCache.get(link)!;
  }
  function timelineFor(link: string): NewsLite[] {
    const it = liteByLink.get(link);
    if (!it) return [];
    if (!tlCache.has(link)) tlCache.set(link, timelineOf(it, newsLite));
    return tlCache.get(link)!;
  }
  function locateNews(link: string): [number, number] | null {
    const it = liteByLink.get(link);
    if (!it || !geo) return null;
    if (it.munis.length && muni) { const c = (muni as unknown as { xy?: ([number, number] | null)[] }).xy?.[muni.codes.indexOf(it.munis[0])]; if (c) return geo.P(c); }
    return it.prefs.length ? geo.anchors[it.prefs[0] - 1] : null;
  }
  /** narrow maps: the strip card with its related news open */
  let stripOpen = $state<string | null>(null);
  function onnews(key: string) {
    if (newsCards) newsPins = newsPins.includes(key) ? newsPins.filter((k) => k !== key) : [...newsPins, key].slice(-4);
    else newsFocus = key;
  }
  function onnewsplace(code: string) { onpick(code); }
  $effect(() => { if (!app.showNews) { newsPins = []; newsFocus = null; } });
  const pois = $derived.by(() => [...facPois, ...hubPois, ...livePois, ...newsPois, ...originPois, ...inspectPois]);
  const inspectPois = $derived.by((): Poi[] => {
    const i = s.inspect;
    if (!i || !geo?.layout) return [];
    return [{ key: 'inspect', kind: 'origin', xy: geo.P(projectLL(i.lon, i.lat, geo.layout).p), r: 6, label: tt('pointInfo'), major: true,
              tip: { title: tt('pointInfo'), rows: pointRows(i) } }];
  });
  const tileLayer = $derived(TILE_LAYERS.find((l) => l.key === app.base) ?? null);
  // ------------------------------------------------------------ industrial zoning (A29) of the focused prefecture
  let zoningIndex = $state.raw<{ source: { ja: string; en: string; url: string } } | null>(null);
  let zoningData = $state.raw<Map<number, Record<string, [number, number][][][]>>>(new Map());
  $effect(() => {
    const pc = app.pref;
    if (!app.showZone || !pc || zoningData.has(pc)) return;
    if (!zoningIndex) fetch(`${import.meta.env.BASE_URL}geo/zoning/index.json`).then((r) => r.json()).then((j) => (zoningIndex = j)).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}geo/zoning/${pad2(pc)}.json`).then((r) => (r.ok ? r.json() : {}))
      .then((d) => (zoningData = new Map(zoningData).set(pc, d))).catch(() => {});
  });
  const zoning = $derived.by(() => {
    const d = app.showZone && app.pref ? zoningData.get(app.pref) : null;
    if (!d || !geo) return null;
    const out: Record<string, string> = {};
    for (const [k, polys] of Object.entries(d)) {
      out[k] = polys.map((poly) => poly.map((ring) => ring.map((p, i) => { const [x, y] = geo!.P(p); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('') + 'Z').join('')).join('');
    }
    return out;
  });
  // ------------------------------------------------------------ other developers' facilities (from the news)
  const facilities = $derived(s.facilities);
  $effect(() => {
    if (!(app.showFac || s.inspect) || s.facilities) return;
    fetch(`${import.meta.env.BASE_URL}data/facilities.json`).then((r) => (r.ok ? r.json() : null)).then((d) => (s.facilities = d?.items ?? [])).catch(() => (s.facilities = []));
  });
  const facPois = $derived.by((): Poi[] => {
    if (!geo || !muni || !facilities || !app.showFac) return [];
    return facilities.filter((f) => f.muni || f.ll).flatMap((f, i) => {
      // the geocoded 所在地 when there is one, else the municipality's population centre
      const c = f.ll && geo!.layout ? projectLL(f.ll[0], f.ll[1], geo!.layout).p : (muni as unknown as { xy?: ([number, number] | null)[] }).xy?.[muni.codes.indexOf(f.muni)];
      if (!c) return [];
      const last = f.events.at(-1)!;
      const done = f.events.some((e) => ['done', 'viewing', 'open'].includes(e.stage));
      const rows: [string, string][] = f.events.map((e) => [e.date, tt(`stg_${e.stage}` as Key)]);
      if (f.floor) rows.unshift([tt('floor'), fmtSqm(L, f.floor)]);
      return [{ key: `f${i}`, kind: 'fac' as const, xy: geo!.P(c), r: 5, label: f.name, major: !!f.floor && f.floor > 50_000, filled: done,
                tip: { title: f.name, sub: `${srcName(f.src)} · ${done ? tt('facDone') : tt('facPipeline')}`, rows: f.addr ? [[tt('address'), f.addr], ...rows] : rows,
                       note: f.ll ? tt('facNoteAddr') : tt('facNote'),
                       link: { href: last.link, label: tt('readArticle') } } }];
    });
  });
  /** origin of the reach map */
  const originPois = $derived.by((): Poi[] => {
    if (!geo || !localLevel || !lt?.isoTimes || !muni) return [];
    const k = lt.originKey;
    const muniXY = (code: string) => { const c = (muni as unknown as { xy: ([number, number] | null)[] }).xy[muni.codes.indexOf(code)]; return c ? geo!.P(c) : null; };
    const siteXY = (name: string) => { const x = sites.find((y) => y.name === name); return x ? geo!.P(x.p) : null; };
    const mk = (key: string, xy: [number, number] | null, label: string, major = true): Poi[] =>
      xy ? [{ key, kind: 'origin', xy, r: major ? 7 : 5, label, major, tip: { title: label, sub: tt('isoOrigin') } }] : [];
    if (k.startsWith('muni:')) return mk('origin', muniXY(k.slice(5)), originName(k));
    if (k.startsWith('site:')) return mk('origin', siteXY(k.slice(5)), originName(k));
    if (k.startsWith('pt:')) { const [lon, lat] = k.slice(3).split(',').map(Number); return mk('origin', geo.P(projectLL(lon, lat, geo.layout).p), originName(k)); }
    if (k === 'net:sim') return lt.simPicks.flatMap((i, n) => mk(`sim${n}`, muniXY(muni.codes[i]), `${n + 1}. ${muniLabel(muni.codes[i])}`));
    // every DPL site is already on the map; the shortlist gets small origin marks
    if (k === 'net:short') return shortlist.items.flatMap((it, i) => it.kind === 'muni' ? mk(`o${i}`, muniXY(it.code), muniLabel(it.code), false)
      : it.kind === 'site' ? mk(`o${i}`, sites[Number(it.code)] ? geo!.P(sites[Number(it.code)].p) : null, sites[Number(it.code)]?.name ?? '', false) : []);
    return [];
  });
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

  const places = $derived.by((): Place[] => {
    if (!geo) return [];
    const prefs = geo.prefs.map((p) => ({ key: p.code, name: L === 'ja' ? p.name : pname(Number(p.code)), alt: L === 'ja' ? pname(Number(p.code)) : p.name, parent: '', kind: 'pref' as const }));
    const ms = geo.munis.map((m) => ({ key: m.code, name: L === 'ja' ? m.name : m.nameEn || m.name, alt: L === 'ja' ? m.nameEn : m.name,
                                      parent: pname(Number(m.code.slice(0, 2))), kind: 'muni' as const }));
    const ss = sites.map((s, i) => ({ key: String(i), name: s.name, alt: s.address, parent: pname(s.pref), kind: 'site' as const }));
    return [...prefs, ...ms, ...ss];
  });
  function onplace(p: Place) {
    if (p.kind === 'addr') {
      // an address: inspect the point and zoom to it
      const [lon, lat] = p.key.split(',').map(Number);
      s.inspectLoading = true; s.inspect = null;
      pointInfo(lon, lat).then((i) => (s.inspect = i)).finally(() => (s.inspectLoading = false));
      if (geo?.layout) mapView?.zoomToPoint(geo.P(projectLL(lon, lat, geo.layout).p), 14);
      return;
    }
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
          ...(lt ? lt.metrics.filter((m) => m.key.startsWith('hz_') || ['tPort', 'tAir', 'tRail'].includes(m.key))
            .map((m) => [m[L], isFinite(m.get(mi)) ? m.fmt(m.get(mi)) : '–'] as [string, string]) : []),
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

  function exportTable() {
    if (!view) return;
    const cols = view.table.columns;
    const areas = mt
      ? mt.codes.map((c, i) => ({ id: i, label: muniLabel(c), code: c })).filter((x) => !app.pref || Number(x.code.slice(0, 2)) === app.pref)
      : Array.from({ length: 47 }, (_, i) => ({ id: i + 1, label: pname(i + 1), code: pad2(i + 1) }));
    downloadCsv(`${app.layer}-${new Date().toISOString().slice(0, 10)}.csv`,
      [['code', tt('area'), ...cols.map((c) => c.label)], ...areas.map((a) => [a.code, a.label, ...cols.map((c) => { const v = c.get(a.id); return isFinite(v) ? v : ''; })])]);
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
  /** offline: the service worker serves the data seen last */
  let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  onMount(() => {
    const on = () => (online = true), off = () => (online = false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  });
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

{#if !online}
  <p class="offline" role="status">{tt('offline')}</p>
{/if}
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
            {#each ['people', 'demand', 'access', 'land', 'industry', 'labour', 'risk'] as g (g)}
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
      <label class="lab" for="basemap">{tt('baseMap')}</label>
      <div class="base-row">
        <select id="basemap" class="sel" value={app.base} onchange={(e) => {
          const was = TILE_LAYERS.find((l) => l.key === app.base), next = TILE_LAYERS.find((l) => l.key === e.currentTarget.value);
          // thematic maps are colourful: a lighter fill over them by default
          if (next?.thematic && !was?.thematic && app.fillOp === 0.5) app.fillOp = 0.25;
          else if (!next?.thematic && was?.thematic && app.fillOp === 0.25) app.fillOp = 0.5;
          app.base = e.currentTarget.value; }}>
          <option value="">{tt('baseNone')}</option>
          {#each [['base', L === 'ja' ? '地図・写真' : 'Maps & photos'], ['relief', L === 'ja' ? '地形' : 'Relief'], ['ground', L === 'ja' ? '地盤・土地の成り立ち' : 'Ground']] as [g, label] (g)}
            <optgroup {label}>{#each TILE_LAYERS.filter((l) => l.group === g) as l (l.key)}<option value={l.key}>{l[L]}</option>{/each}</optgroup>
          {/each}
        </select>
        <button type="button" class="btn chip" aria-pressed={s.inspectArmed} onclick={() => (s.inspectArmed = !s.inspectArmed)} title={tt('inspectHint')}>
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 13.5S1 8.6 1 5.4a5 5 0 0 1 10 0C11 8.6 6 13.5 6 13.5z" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="6" cy="5.4" r="1.7" fill="currentColor" /></svg>
          {tt('inspectPoint')}</button>
        {#if tileLayer}
          <label class="fo"><span class="sr-only">{tt('fillStrength')}</span>
            <span aria-hidden="true" class="small">{tt('fillStrength')}</span>
            <input type="range" min="0" max="1" step="0.1" value={app.fillOp} oninput={(e) => (app.fillOp = Number(e.currentTarget.value))} />
          </label>
        {/if}
      </div>
    </div>
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
        <button type="button" class="btn chip" aria-pressed={app.showZone} onclick={() => (app.showZone = !app.showZone)}>
          <svg width="12" height="12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" class="k-zone" /></svg>{tt('layerZone')}
        </button>
        <button type="button" class="btn chip" aria-pressed={app.showFac} onclick={() => (app.showFac = !app.showFac)}>
          <svg width="12" height="12" aria-hidden="true"><rect x="3" y="3" width="6" height="6" transform="rotate(45 6 6)" class="k-fac" /></svg>{tt('layerFac')}
        </button>
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
    <div class="mapcol" bind:clientWidth={mapW}>
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
        <div class="mapwrap">
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
          news={newsGroups} {newsCards} {newsPins} {newsFocus} newsAuto={mapW >= 900 ? 3 : 2}
          {onnews} onnewsclose={(k) => (newsPins = newsPins.filter((x) => x !== k))} {onnewsplace}
          onnewshover={(k) => (newsFocus = k)}
          onnewspin={(k) => { if (!newsPins.includes(k)) newsPins = [...newsPins, k].slice(-4); }}
          {relatedFor} {timelineFor} {locateNews} bind:newsOpen={app.newsOpen}
          {raster} pickPoint={(s.pickArmed && !!lt?.grid) || s.inspectArmed} onpoint={onpointAny} {zoning}
          tileLayer={tileLayer} fillOpacity={tileLayer ? app.fillOp : 1} dark={app.dark}
        />
        {#if nationalNews && newsCards}
          <button type="button" class="btn national" aria-pressed={newsPins.includes('jp')} onclick={() => onnews('jp')}>
            {tt('newsNational')} <strong class="tnum">{nationalNews.items.length}</strong>
          </button>
        {/if}
        </div>
        {#if !newsCards && newsGroups.length}
          <NewsStrip groups={newsGroups} lang={L} focus={newsFocus} onfocus={(k) => (newsFocus = k)} onplace={onnewsplace}
                     open={stripOpen} ontoggle={(k) => (stripOpen = stripOpen === k ? null : k)} {relatedFor} {timelineFor} />
        {/if}
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
                categories={view.categories ?? null} bind:highlight />
        {#if app.layer === 'flows' && view.flows.length}
          <p class="src">{!app.pref && !app.compare ? `${tt(app.near ? 'arcsNationalNear' : 'arcsNational')}${L === 'ja' ? '。' : '. '}` : ''}{tt('flowArcNote')}</p>
        {/if}
        {#if app.showZone}
          <p class="src zone-note">
            <span class="zk"><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" fill="url(#pz1)" stroke="var(--clay)" /></svg>{L === 'ja' ? '準工業' : 'Light industrial'}</span>
            <span class="zk"><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" fill="url(#pz2)" stroke="var(--clay)" /></svg>{L === 'ja' ? '工業' : 'Industrial'}</span>
            <span class="zk"><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" fill="var(--clay)" fill-opacity="0.55" stroke="var(--clay)" /></svg>{L === 'ja' ? '工業専用' : 'Exclusively industrial'}</span>
            {app.pref ? '' : tt('zonePickPref')} {tt('zoneNote')}
            {#if zoningIndex}<a href={zoningIndex.source.url}>{zoningIndex.source[L]}</a>{/if}
          </p>
        {/if}
        <p class="src">{tt('source')}：<a href={view.source.url}>{view.source.text}</a>
          {#if tileLayer} · <a href="https://maps.gsi.go.jp/development/ichiran.html">{tt('tilesSource')}（{tileLayer[L]}{tileLayer.thematic ? `・${TILE_LAYERS[0][L]}` : ''}）</a>{/if}</p>
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
        <PointPanel />
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
                <button type="button" class="btn" onclick={() => showReach(`muni:${app.muni}`)} disabled={app.iso === `muni:${app.muni}` && app.lmet === 'iso'}>{tt('isoFrom')}</button>
              {/if}
            </p>
          {:else}
          <p class="eyebrow">{p ? pname(p) : tt('japan')} · {view.periodLabel}</p>
          {#if mt}
            {#if p}
              <p class="kpi tnum">{view.fmt(view.value(p))}</p>
              <p class="kpi-sub">{tt(muniLevel ? 'medianOfMunis' : 'medianOfMunisValue')}</p>
            {:else}
              {@const bestCode = mt.ranks.keys().next().value}
              <p class="kpi tnum">{bestCode ? `${muniLabel(bestCode)} ${view.fmt(mt.values.get(bestCode) ?? NaN)}` : '–'}</p>
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
          {#if app.layer === 'warehouse'}<p class="help"><TermText text={tt(`mh_${app.metric}`)} lang={L} /></p>
          {:else if app.layer === 'flows'}<p class="help">{census.source.note[L]}</p>
          {:else if app.layer === 'score'}<p class="help">{tt(muniLevel ? 'muniScoreHint' : 'scoreHint')}</p>
          {:else if app.layer === 'now'}<p class="help">{app.nmet === 'warn' ? tt('warnL3Count') : tt('dieselHint')}</p>
          {:else if app.layer === 'local'}<p class="help"><TermText text={lt?.metric.hint[L] ?? ''} lang={L} /></p>
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

        <NowPanels />

        <LocalPanels />

        <ScorePanels />

        {#if tr}
        <section class="panel">
          <Trend series={tr.series} quarters={tr.periods} q={tr.q} lang={L} label={tr.label} format={tr.fmt}
                 tick={tr.tick} xticks={tr.xticks} dots={tr.dots} onselect={tr.setQ} />
          {#if app.layer === 'labour' && app.lmetric === 'jobs'}<p class="src note">{tt('breakNote')}</p>{/if}
        </section>
        {/if}

        <FlowsPanels />

        <LabourPanels />

        {#if app.site >= 0 && sites[app.site] && muni?.sites[sites[app.site].name]}
          <section class="panel">
            <SiteCard name={sites[app.site].name} c={muni.sites[sites[app.site].name]} median={muni.siteMedian} lang={L}
                      extra={[...hubRows(sites[app.site].name), ...(siteInfo?.name === sites[app.site].name ? pointRows(siteInfo.info) : [])]} />
            <p class="memo"><button type="button" class="btn" onclick={() => shortlist.toggle('site', String(app.site))}>{shortlist.has('site', String(app.site)) ? `★ ${tt('inShort')}` : `☆ ${tt('addShort')}`}</button>
              {#if lt}<button type="button" class="btn" onclick={() => showReach(`site:${sites[app.site].name}`)}>{tt('isoFrom')}</button>{/if}</p>
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
        <GlossaryPanel />
        <ShortlistPanel />
        {#if news}
          <section class="panel">
            <p class="eyebrow">{tt('news')}</p>
            <NewsFeed {news} lang={L} pref={p} {pname} onpref={(c) => onpick(String(c))} {srcName}
                      topic={newsTopic} ontopic={(k) => (newsTopic = k)}
                      onhover={(it) => (newsFocus = it && app.showNews ? newsKeyOf(it) : null)}
                      onmap={app.showNews ? (it) => { const k = newsKeyOf(it); if (k === 'jp' || newsGroups.some((g) => g.key === k)) onnews(k); } : undefined} />
          </section>
        {/if}
      {/if}
    </aside>
  </main>

  <SourcesFooter />
  {#if dossierOpen && dossier}
    {#await import('./components/Dossier.svelte') then { default: Dossier }}
      <Dossier title={dossier.title} subtitle={tt('dossierSub')} sections={dossier.sections} sources={dossier.sources} lang={L} onclose={() => (dossierOpen = false)} />
    {/await}
  {/if}
{/if}
