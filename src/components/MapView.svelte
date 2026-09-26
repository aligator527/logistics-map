<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { select } from 'd3-selection';
  import 'd3-transition';
  import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
  import type { GeoData, Shape } from '../lib/geo';
  import type { Roads } from '../lib/data';
  import { classOf, type Classes } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';
  import Tooltip, { type Tip } from './Tooltip.svelte';
  import NewsCallout from './NewsCallout.svelte';
  import { buildSat, placeCards, type Mask, type NewsGroup } from '../lib/newsmap';
  import { placeKey, type NewsLite, type Related } from '../lib/related';
  import { TILE_LAYERS, tileImage, tileUrl, visibleTiles, type TileLayer } from '../lib/tiles';
  import { loadDetail, type Detail } from '../lib/detail';
  import { project as projectLL, unproject } from '../lib/project';
  import { measure, TSUBO } from '../lib/measure.svelte';
  import { vtile, VT_Z, type Parcel } from '../lib/vtiles';
  import { shortlist, plotCode } from '../lib/shortlist.svelte';

  export interface Marker { i: number; xy: [number, number]; built: boolean; label: string }
  /** freight hub (airport / port / rail station): r = marker radius in screen px */
  export interface Poi {
    key: string; kind: 'air' | 'port' | 'rail' | 'quake' | 'typhoon' | 'news' | 'origin' | 'fac'; xy: [number, number]; r: number; label: string; major: boolean; tip: Tip;
    /** fill (earthquake intensity) and text inside the marker (intensity, news count) */
    color?: string; badge?: string; ink?: string;
    /** news: something from the last 7 days */
    fresh?: boolean;
    /** facility: completed (filled marker) */
    filled?: boolean;
    /** click: select this prefecture / municipality */
    code?: string;
  }
  /** flow arc between two anchors (viewBox units); w = stroke width in screen px */
  export interface Flow { key: string; o: [number, number]; d: [number, number]; w: number; kind: 'out' | 'in' | 'all'; tip: Tip }

  let { geo, values, classes, lang, focus, a = 0, b = 0, compare = false, highlight = null,
        markers = [], site = -1, roads = null, showRoads = true, flows = [], mutedMarkers = false, zoomFocus = true, level = 'pref', selMuni = null, rings = [], pois = [], muniA = null, muniB = null, tracks = [],
        news = [], newsCards = false, newsPins = [], newsFocus = null, newsAuto = 3, onnews, onnewsclose, onnewsplace, onnewshover,
        onnewspin, relatedFor, timelineFor, locateNews, newsOpen = $bindable(null), raster = null, pickPoint = false, onpoint, zoning = null, tileLayer = null, fillOpacity = 1, dark = false,
        zoomZ = $bindable(0), mv = '', onmv, showBld = true, showFude = true, plots = [],
        prefTip, muniTip, siteTip, onpick, onclear, onsite }: {
    geo: GeoData;
    /** shown value per prefecture code "01".."47" */
    values: Map<string, number>;
    classes: Classes;
    lang: Lang;
    focus: string | null;
    a?: number;
    b?: number;
    compare?: boolean;
    highlight?: number | null;          // legend class under the pointer
    markers?: Marker[];
    site?: number;
    roads?: { d: Record<1 | 2 | 3, string>; joints: (Roads['joints'][number] & { id: number; xy: [number, number] })[] } | null;
    showRoads?: boolean;
    flows?: Flow[];
    /** draw DPL markers faded (another layer is the subject) */
    mutedMarkers?: boolean;
    /** frame the focused prefecture (off for flows: the partners must stay in view) */
    zoomFocus?: boolean;
    /** 'muni': every municipality is filled from `values` (keys = 5-digit codes) */
    level?: 'pref' | 'muni';
    /** selected municipality (muni level) */
    selMuni?: string | null;
    /** polylines in map space (typhoon tracks): d in viewBox units */
    tracks?: { key: string; d: string; kind: 'past' | 'forecast' }[];
    /** municipal comparison outlines */
    muniA?: string | null;
    muniB?: string | null;
    /** freight hubs (airports, ports, rail freight stations) */
    pois?: Poi[];
    /** radius rings around a point (viewBox units), e.g. a DPL site's 10 / 30 / 60 km */
    rings?: { xy: [number, number]; r: number; label: string }[];
    /** news grouped by place; their points are pois of kind 'news' with the group key */
    news?: NewsGroup[];
    /** draw callout cards over the sea (wide maps); else only the focused point is linked to the page below */
    newsCards?: boolean;
    newsPins?: string[];
    /** group under the pointer in the side list / carousel */
    newsFocus?: string | null;
    /** how many of the latest places get a card without a click */
    newsAuto?: number;
    onnews?: (key: string) => void;
    onnewsclose?: (key: string) => void;
    onnewsplace?: (code: string) => void;
    onnewshover?: (key: string | null) => void;
    /** pin a callout (opening its related news pins it) */
    onnewspin?: (key: string) => void;
    /** the callout with its related news open (bindable: kept in the URL) */
    newsOpen?: string | null;
    relatedFor?: (link: string) => Related[];
    timelineFor?: (link: string) => NewsLite[];
    /** map position (viewBox) of a news item's place */
    locateNews?: (link: string) => [number, number] | null;
    /** 1 km cells drawn on a canvas: centres in viewBox units (x0, y0, x1, y1 …), a colour per cell
     *  (null = not drawn) and the cell size in viewBox units */
    raster?: { xy: Float32Array; w?: Float32Array; h?: number; color: (i: number) => string | null; size: number; version: unknown; tip?: (i: number) => Tip | null } | null;
    /** 地理院タイル under the map (thematic layers come with the pale map beneath them) */
    tileLayer?: TileLayer | null;
    /** opacity of the area fills (lowered when map tiles are shown) */
    fillOpacity?: number;
    dark?: boolean;
    /** industrial zoning paths (viewBox units) per class: 1 準工業, 2 工業, 3 工業専用 */
    zoning?: Record<string, string> | null;
    /** the next click on the map picks a point (viewBox units) instead of an area */
    pickPoint?: boolean;
    onpoint?: (xy: [number, number]) => void;
    /** current zoom as a 地理院タイル zoom level (bindable, read-only for the parent) */
    zoomZ?: number;
    /** map view for the URL: "z/lat/lon" ('' = whole of Japan / framed automatically) */
    mv?: string;
    onmv?: (mv: string) => void;
    /** buildings (国土地理院 vector tiles) from z15, land parcels (登記所備付地図) from z16 */
    showBld?: boolean;
    showFude?: boolean;
    /** plots saved in the shortlist: rings in lon/lat */
    plots?: { key: string; ring: [number, number][]; label: string }[];
    prefTip: (code: string) => Tip;
    muniTip: (s: Shape) => Tip;
    siteTip: (i: number) => Tip;
    onpick: (code: string) => void;
    onclear: () => void;
    onsite: (i: number) => void;
  } = $props();

  let svg: SVGSVGElement;
  let wrap: HTMLDivElement | undefined = $state();
  let transform = $state<ZoomTransform>(zoomIdentity);
  let boxW = $state(1000), boxH = $state(800);
  // Overlay markers keep a constant screen size: 1 screen px in viewBox units.
  const px = $derived(1 / Math.max(1e-6, Math.min(boxW / geo.width, boxH / geo.height)));
  let hover = $state<{ tip: Tip; x: number; y: number; code?: string; muni?: string } | null>(null);
  let pinned = $state<Tip | null>(null);
  let zb: ZoomBehavior<SVGSVGElement, unknown>;
  let ready = $state(false); // zoom behaviour attached (effects below wait for it)

  const prefByCode = $derived(new Map(geo.prefs.map((s) => [s.code, s])));
  const focusShape = $derived(focus ? prefByCode.get(focus) ?? null : null);
  const focusMunis = $derived(level === 'pref' && focus && !compare && zoomFocus ? geo.munis.filter((m) => m.code.startsWith(focus)) : []);
  const muniByCode = $derived(new Map(geo.munis.map((s) => [s.code, s])));
  const areaShapes = $derived(level === 'muni' ? geo.munis : geo.prefs);
  const shapeOf = (code: string) => (code.length === 5 ? muniByCode.get(code) : prefByCode.get(code)) ?? null;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  function fill(code: string): string {
    if (raster) return 'var(--land)';
    const v = values.get(code);
    if (v === undefined || !isFinite(v)) return 'url(#pat-nodata)';
    if (!classes.diverging && v <= 0) return 'var(--land)';
    return classes.colors[classOf(classes, v)];
  }
  function dimmed(code: string): boolean {
    if (highlight === null) return false;
    const v = values.get(code);
    return v === undefined || !isFinite(v) || classOf(classes, v) !== highlight;
  }

  // ------------------------------------------------------------ zoom
  onMount(() => {
    zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 40])
      .translateExtent([[-geo.width * 0.1, -geo.height * 0.1], [geo.width * 1.1, geo.height * 1.1]])
      // Keep the page scrollable: wheel zooms only with Ctrl/⌘ (trackpad pinch sends ctrlKey),
      // and one finger pans only once the map is zoomed in.
      .filter((e: Event) => {
        if (e.type === 'wheel') {
          const w = e as WheelEvent;
          if (w.ctrlKey || w.metaKey || wheelOn) return true;
          flashWheelHint();
          return false;
        }
        if (e.type === 'touchstart') return (e as TouchEvent).touches.length > 1 || transform.k > 1.01;
        if (e.type === 'dblclick') return false;
        return !(e as MouseEvent).button;
      })
      .on('zoom', (e) => { transform = e.transform; hover = null; })
      .on('end', () => emitMv());
    select(svg).call(zb).on('dblclick.zoom', null);
    ready = true;
    return () => { select(svg).on('.zoom', null); };
  });

  // ------------------------------------------------------------ zoom level, deep zoom
  const UPM_Z = 156543.03 * Math.cos((36 * Math.PI) / 180);
  /** 地理院タイル zoom level for a zoom factor k (screen px per metre at 36°N) */
  const zOf = (k: number) => Math.log2(k * fit.s * geo.unitsPerMetre * UPM_Z);
  const kOf = (z: number) => 2 ** z / (fit.s * geo.unitsPerMetre * UPM_Z);
  const Z_MAX = 17.5;
  $effect(() => { zoomZ = zOf(transform.k); });
  // down to single buildings (about z17.5); the zoom-out limit stays the whole map
  $effect(() => { if (ready && zb) zb.scaleExtent([1, Math.max(40, kOf(Z_MAX))]); });
  const zNow = $derived(zOf(transform.k));
  /** 1 = full colour; fades to outlines between z11.5 and z14.5 */
  const fade = $derived(Math.max(0, Math.min(1, (14.5 - zNow) / 3)));
  /** detailed boundaries and roads from this zoom */
  const Z_DETAIL = 10.5;
  const deep = $derived(zNow >= Z_DETAIL);

  let details = $state.raw(new Map<string, Detail>());
  const prefsInView = $derived.by(() => {
    if (!deep) return [] as string[];
    const { x0, y0, x1, y1 } = view;
    return geo.prefs.filter((p) => p.bbox[0][0] < x1 && p.bbox[1][0] > x0 && p.bbox[0][1] < y1 && p.bbox[1][1] > y0).map((p) => p.code);
  });
  $effect(() => {
    for (const pc of prefsInView) {
      if (details.has(pc)) continue;
      loadDetail(geo, pc).then((d) => { if (d && !details.has(pc)) details = new Map(details).set(pc, d); });
    }
  });
  const detailOn = $derived(deep ? prefsInView.map((pc) => details.get(pc)).filter((d): d is Detail => !!d) : []);
  /** the path to draw for a shape: street-level detail when zoomed in and loaded */
  function dOf(s: Shape): string {
    if (!deep) return s.d;
    const d = details.get(s.code.slice(0, 2));
    if (!d) return s.d;
    return s.code.length === 2 ? d.pref : d.munis.get(s.code) ?? s.d;
  }
  const detailRoads = $derived(detailOn.length ? {
    1: detailOn.map((d) => d.roads[1]).join(''), 2: detailOn.map((d) => d.roads[2]).join(''), 3: detailOn.map((d) => d.roads[3]).join(''),
  } : null);

  // ------------------------------------------------------------ view in the URL ("z/lat/lon")
  /** viewBox point -> lon/lat (insets undone) */
  function lonLatAt([vx, vy]: [number, number]): [number, number] | null {
    if (!geo.layout) return null;
    const inset = geo.insets.find((r) => vx >= r.x && vx <= r.x + r.w && vy >= r.y && vy <= r.y + r.h);
    return unproject(toPlanar(vx, vy), geo.layout, inset ? (inset.key as 'okinawa' | 'ogasawara') : 'main');
  }
  function viewBoxAt(lon: number, lat: number): [number, number] | null {
    if (!geo.layout) return null;
    const { p, space } = projectLL(lon, lat, geo.layout);
    return space === 'outside' ? null : geo.P(p);
  }
  let lastMv = '';
  function emitMv() {
    if (!onmv) return;
    let out = '';
    if (transform.k > 1.05) {
      const c = transform.invert([geo.width / 2, geo.height / 2]) as [number, number];
      const ll = lonLatAt(c);
      if (ll) out = `${zNow.toFixed(1)}/${ll[1].toFixed(5)}/${ll[0].toFixed(5)}`;
    }
    if (out !== lastMv) { lastMv = out; onmv(out); }
  }
  function applyMv(s: string, ms = 550) {
    const [z, lat, lon] = s.split('/').map(Number);
    const xy = [z, lat, lon].every(isFinite) ? viewBoxAt(lon, lat) : null;
    if (!xy) return false;
    lastMv = s;
    const k = Math.max(1, Math.min(kOf(Z_MAX), kOf(z)));
    go(zoomIdentity.translate(geo.width / 2 - k * xy[0], geo.height / 2 - k * xy[1]).scale(k), ms);
    return true;
  }
  // a view given in the URL at load wins over framing the selected prefecture
  let startMv = untrack(() => mv);
  $effect(() => {
    const m = mv;
    if (!ready || startMv) return;
    untrack(() => {
      if (m && m !== lastMv) applyMv(m);
      // the URL lost its view (another link, a guide step): back to the selection or the whole map
      else if (!m && lastMv) {
        lastMv = '';
        const bb = focus && zoomFocus && !compare ? geo.prefFrame.get(focus) : null;
        if (bb) frame(bb, 30, true); else go(zoomIdentity, 400);
      }
    });
  });

  // ------------------------------------------------------------ wheel, double click / tap
  /** the wheel zooms without Ctrl once the map has been clicked (until a click elsewhere or Escape) */
  let wheelOn = $state(false);
  let wheelHint = $state(false);
  let wheelTimer = 0;
  function flashWheelHint() {
    wheelHint = true;
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => (wheelHint = false), 1600);
  }
  onMount(() => {
    const off = (e: PointerEvent) => { if (wrap && !wrap.contains(e.target as Node)) wheelOn = false; };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  });
  function zoomAt(e: { clientX: number; clientY: number }, f: number) {
    if (!wrap) return;
    const { x, y } = local(e);
    const p: [number, number] = [(x - fit.ox) / fit.s, (y - fit.oy) / fit.s];
    select(svg).transition().duration(reduce() ? 0 : 300).call(zb.scaleBy as never, f, p);
  }
  function ondblclick(e: MouseEvent) {
    if (pickPoint || measure.armed) { if (measure.armed && measure.pts.length > 2) measure.closed = true; e.preventDefault(); return; }
    zoomAt(e, e.shiftKey ? 0.5 : 2);
  }
  let lastTap: { t: number; x: number; y: number } | null = null;
  function onpointerup(e: PointerEvent) {
    if (e.pointerType !== 'touch' || pickPoint || measure.armed) return;
    const now = performance.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      zoomAt(e, 2);
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
  }

  // ------------------------------------------------------------ scale bar
  const scaleBar = $derived.by(() => {
    const c = transform.invert([geo.width / 2, geo.height / 2]) as [number, number];
    const inset = geo.insets.find((r) => c[0] >= r.x && c[0] <= r.x + r.w && c[1] >= r.y && c[1] <= r.y + r.h);
    const ks = inset?.key === 'okinawa' ? geo.insetScale.okinawa : inset?.key === 'ogasawara' ? geo.insetScale.ogasawara : 1;
    const mpp = 1 / (transform.k * fit.s * geo.unitsPerMetre * ks);
    const max = mpp * 110;
    const pow = 10 ** Math.floor(Math.log10(max));
    const m = [5, 2, 1].map((f) => f * pow).find((v) => v <= max) ?? pow;
    return { w: m / mpp, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  });

  // ------------------------------------------------------------ measuring
  const measureXY = $derived(measure.pts.map(([lon, lat]) => viewBoxAt(lon, lat)).filter((p): p is [number, number] => !!p));
  const measurePath = $derived.by(() => {
    if (!measureXY.length) return '';
    const s = measureXY.map((p) => transform.apply(p));
    return s.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('') + (measure.closed ? 'Z' : '');
  });
  const plotPaths = $derived.by(() => plots.flatMap((pl) => {
    const s = pl.ring.map(([lon, lat]) => viewBoxAt(lon, lat)).filter((p): p is [number, number] => !!p).map((p) => transform.apply(p));
    const span = Math.max(...s.map((q) => q[0])) - Math.min(...s.map((q) => q[0]));
    // a plot only means something once it is more than a speck on screen
    if (s.length < 3 || span / px < 10) return [];
    const x = s.reduce((a, p) => a + p[0], 0) / s.length, y = s.reduce((a, p) => a + p[1], 0) / s.length;
    return [{ key: pl.key, label: pl.label, x, y, d: s.map(([px_, py], i) => `${i ? 'L' : 'M'}${px_.toFixed(2)},${py.toFixed(2)}`).join('') + 'Z' }];
  }));
  const fmtLen = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 1 : 2)} km` : `${Math.round(m)} m`);
  const fmtArea = (a: number) => (a >= 1e6 ? `${(a / 1e6).toFixed(2)} km²` : `${Math.round(a).toLocaleString()} m²`);

  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function go(target: ZoomTransform, ms = 550) {
    const sel = select(svg);
    if (reduce()) sel.call(zb.transform, target);
    else sel.transition().duration(ms).call(zb.transform as never, target);
  }
  function frame(bbox: Shape['bbox'], maxK = 30, force = false) {
    const [[x0, y0], [x1, y1]] = bbox;
    const k = Math.max(1, Math.min(maxK, 0.85 / Math.max((x1 - x0) / geo.width, (y1 - y0) / geo.height)));
    const v = view;
    if (!force && transform.k >= k && x0 < v.x1 && x1 > v.x0 && y0 < v.y1 && y1 > v.y0) return;
    go(zoomIdentity.translate(geo.width / 2 - k * (x0 + x1) / 2, geo.height / 2 - k * (y0 + y1) / 2).scale(k));
  }
  function frameAB() {
    const boxes = [a, b].filter(Boolean).map((c) => geo.prefFrame.get(pad2(c))!).filter(Boolean);
    if (!boxes.length) return go(zoomIdentity);
    frame([[Math.min(...boxes.map((x) => x[0][0])), Math.min(...boxes.map((x) => x[0][1]))],
           [Math.max(...boxes.map((x) => x[1][0])), Math.max(...boxes.map((x) => x[1][1]))]], 8);
  }

  let lastSel = '';
  // reframe when the selection changes (only then: the current zoom is read, not tracked)
  $effect(() => {
    if (!ready) return;
    const cmp = compare, f = focus, zf = zoomFocus, bb = f ? geo.prefFrame.get(f) : null;
    const sel = `${cmp}|${a}|${b}|${f}`;
    untrack(() => {
      // data arriving later (municipal frames, the layer's zoom rule) must not throw away a view the user is in
      const selChanged = sel !== lastSel;
      lastSel = sel;
      if (startMv) { const m = startMv; startMv = ''; if (applyMv(m, 0)) return; }
      if (!selChanged && lastMv) return;
      if (cmp) { if (zf) frameAB(); else go(zoomIdentity, 400); return; }
      if (f && zf) { if (bb) frame(bb); }
      else go(zoomIdentity, 400);
    });
  });

  /** centre the map on a point (viewBox units) at zoom k */
  export function zoomToPoint(xy: [number, number], k = 12) {
    go(zoomIdentity.translate(geo.width / 2 - k * xy[0], geo.height / 2 - k * xy[1]).scale(k));
  }
  export function zoomBy(f: number) { select(svg).transition().duration(reduce() ? 0 : 250).call(zb.scaleBy as never, f); }
  export function reset() { onclear(); go(zoomIdentity, 350); }

  // ------------------------------------------------------------ layers visible at the current zoom
  /** visible map rectangle (viewBox units), for culling interchange markers */
  const view = $derived.by(() => {
    const [x0, y0] = transform.invert([0, 0]);
    const [x1, y1] = transform.invert([geo.width, geo.height]);
    return { x0, y0, x1, y1 };
  });
  const joints = $derived.by(() => {
    if (!roads || !showRoads || transform.k < 3) return [];
    const { x0, y0, x1, y1 } = view;
    return roads.joints.filter((j) => (j.k !== 'sic' || transform.k >= 5)
      && j.xy[0] >= x0 && j.xy[0] <= x1 && j.xy[1] >= y0 && j.xy[1] <= y1);
  });
  const siteR = $derived(transform.k >= 6 ? 6.5 : transform.k >= 2.5 ? 5.5 : 4.2);

  // Flow arcs, in screen space so their width stays constant while zooming. Each arc bends to
  // the right of its direction, so A→B and B→A never overlap; the arrowhead sits on the target.
  const arcs = $derived(flows.map((f, i) => {
    const [x0, y0] = transform.apply(f.o).map((v) => v / px);
    const [x1, y1] = transform.apply(f.d).map((v) => v / px);
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(0.22 * len, 120);
    const cx = (x0 + x1) / 2 - (dy / len) * bend, cy = (y0 + y1) / 2 + (dx / len) * bend;
    // arrowhead along the tangent at the end, pulled back so it ends on the anchor
    const tx = x1 - cx, ty = y1 - cy, tl = Math.hypot(tx, ty) || 1;
    const ah = Math.min(13, Math.max(6, f.w * 1.6)), aw = Math.min(7, Math.max(3.5, f.w * 0.95));
    const ex = x1 - (tx / tl) * ah, ey = y1 - (ty / tl) * ah;
    const nx = -ty / tl, ny = tx / tl;
    return {
      i, f,
      d: `M${x0.toFixed(1)},${y0.toFixed(1)}Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
      head: `M${x1.toFixed(1)},${y1.toFixed(1)}L${(ex + nx * aw).toFixed(1)},${(ey + ny * aw).toFixed(1)}L${(ex - nx * aw).toFixed(1)},${(ey - ny * aw).toFixed(1)}Z`,
    };
  }));
  let hoverFlow = $state<number | null>(null);

  // Labels: placed greedily by priority (selected site, DPL sites, IC, JCT / smart IC) and
  // dropped when they would overlap one already placed. Sizes are in screen pixels.
  const labelled = $derived.by(() => {
    const out = new Set<string>();
    const k = transform.k;
    const boxes: [number, number, number, number][] = [];
    const place = (key: string, xy: [number, number], text: string, r: number) => {
      const [x, y] = transform.apply(xy).map((v) => v / px);
      const bx: [number, number, number, number] = [x + r + 4, y - 8, x + r + 6 + text.length * 11.5, y + 8];
      if (boxes.some((b) => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) return;
      boxes.push(bx, [x - r, y - r, x + r, y + r]);
      out.add(key);
    };
    const sel = markers.find((m) => m.i === site);
    if (sel) place(`s${sel.i}`, sel.xy, sel.label, siteR);
    const { x0, y0, x1, y1 } = view;
    const inView = (xy: [number, number]) => xy[0] >= x0 && xy[0] <= x1 && xy[1] >= y0 && xy[1] <= y1;
    if (k >= 5) for (const m of markers) if (m.i !== site && inView(m.xy)) place(`s${m.i}`, m.xy, m.label, siteR);
    if (k >= 8) for (const j of joints) if (j.k === 'ic') place(`j${j.id}`, j.xy, j.n, 3);
    if (k >= 12) for (const j of joints) if (j.k !== 'ic') place(`j${j.id}`, j.xy, j.n, 3);
    return out;
  });

  // ------------------------------------------------------------ pointer
  function local(e: { clientX: number; clientY: number }) {
    const r = wrap!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function target(e: Event) {
    const el = (e.target as Element).closest?.('[data-code],[data-muni],[data-site],[data-joint],[data-flow],[data-poi]');
    if (!el) return null;
    return {
      code: el.getAttribute('data-code'),
      muni: el.getAttribute('data-muni'),
      site: el.hasAttribute('data-site') ? Number(el.getAttribute('data-site')) : null,
      joint: el.hasAttribute('data-joint') ? Number(el.getAttribute('data-joint')) : null,
      flow: el.hasAttribute('data-flow') ? Number(el.getAttribute('data-flow')) : null,
      poi: el.hasAttribute('data-poi') ? Number(el.getAttribute('data-poi')) : null,
    };
  }
  function tipFor(tg: NonNullable<ReturnType<typeof target>>): { tip: Tip; code?: string; muni?: string } | null {
    if (tg.site !== null) return { tip: siteTip(tg.site) };
    if (tg.flow !== null) return flows[tg.flow] ? { tip: flows[tg.flow].tip } : null;
    if (tg.poi !== null) return pois[tg.poi] ? { tip: pois[tg.poi].tip } : null;
    if (tg.joint !== null) {
      const j = joints[tg.joint];
      return j ? { tip: { title: j.n, sub: t(lang, j.k) } } : null;
    }
    if (tg.muni) {
      const m = focusMunis.find((s) => s.code === tg.muni);
      return m ? { tip: muniTip(m), muni: m.code, code: focus ?? undefined } : null;
    }
    if (tg.code) return { tip: prefTip(tg.code), code: tg.code };
    return null;
  }
  // ------------------------------------------------------------ what is under the pointer at street level
  /** 1 km cells bucketed by position, for finding the one under the pointer */
  const cellIndex = $derived.by(() => {
    const r = raster;
    if (!r?.tip) return null;
    const m = new Map<string, number[]>();
    for (let i = 0, n = r.xy.length / 2; i < n; i++) {
      const key = `${Math.floor(r.xy[2 * i] / r.size)},${Math.floor(r.xy[2 * i + 1] / r.size)}`;
      const b = m.get(key); if (b) b.push(i); else m.set(key, [i]);
    }
    return m;
  });
  function cellAt(vx: number, vy: number): number {
    const r = raster, idx = cellIndex;
    if (!r || !idx) return -1;
    const bx = Math.floor(vx / r.size), by = Math.floor(vy / r.size);
    let best = -1, bd = (r.size * 0.75) ** 2;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of idx.get(`${bx + dx},${by + dy}`) ?? []) {
      const d = (r.xy[2 * i] - vx) ** 2 + (r.xy[2 * i + 1] - vy) ** 2;
      if (d < bd && r.color(i)) { bd = d; best = i; }
    }
    return best;
  }
  /** a land parcel (z16+) or a 1 km cell (zoomed in on a reach map) under a point in the map box */
  function detailTip({ x, y }: { x: number; y: number }): Tip | null {
    if (showFude && zNow >= Z_FUDE) {
      const p = parcelAt(x, y);
      if (p) return { title: `${t(lang, 'chiban')} ${p.chiban}`, sub: `${p.muni} ${p.place}`, rows: p.accuracy ? [[t(lang, 'fudeAccuracy'), p.accuracy]] : [], note: t(lang, 'fudeNote') };
    }
    if (raster?.tip && transform.k * fit.s * raster.size >= 6) {
      const [vx, vy] = transform.invert([(x - fit.ox) / fit.s, (y - fit.oy) / fit.s]);
      const i = cellAt(vx, vy);
      if (i >= 0) return raster.tip(i);
    }
    return null;
  }
  const areaOnly = (tg: ReturnType<typeof target>) => !tg || (tg.site === null && tg.poi === null && tg.joint === null && tg.flow === null);
  function onpointermove(e: PointerEvent) {
    if (e.pointerType === 'touch' || !wrap) return;
    const tg = target(e);
    let res = tg && tipFor(tg);
    if (areaOnly(tg)) { const d = detailTip(local(e)); if (d) res = { ...(res ?? {}), tip: d }; }
    hover = res ? { ...res, ...local(e) } : null;
    hoverFlow = tg?.flow ?? null;
  }
  let down: { x: number; y: number } | null = null;
  function onpointerdown(e: PointerEvent) { down = { x: e.clientX, y: e.clientY }; wheelOn = true; }
  function onclick(e: MouseEvent) {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // ended a drag
    const touch = (e as PointerEvent).pointerType === 'touch';
    if (measure.armed && wrap) {
      const { x, y } = local(e);
      const vb = transform.invert([(x - fit.ox) / fit.s, (y - fit.oy) / fit.s]) as [number, number];
      // a click on the first point closes the polygon
      if (measure.pts.length > 2 && measureXY[0]) {
        const [fx, fy] = transform.apply(measureXY[0]);
        if (Math.hypot(fx * fit.s + fit.ox - x, fy * fit.s + fit.oy - y) < 12) { measure.closed = true; return; }
      }
      const ll = lonLatAt(vb);
      if (ll) measure.add(ll);
      return;
    }
    if (pickPoint && onpoint && wrap) {
      const { x, y } = local(e);
      onpoint(transform.invert([(x - fit.ox) / fit.s, (y - fit.oy) / fit.s]) as [number, number]);
      return;
    }
    const tg = target(e);
    if (!tg) { pinned = null; if (!compare) onclear(); return; }
    if (tg.site !== null) { onsite(tg.site); pinned = touch ? siteTip(tg.site) : null; return; }
    if (tg.flow !== null) { pinned = touch && flows[tg.flow] ? flows[tg.flow].tip : null; return; }
    if (tg.poi !== null) {
      const h = pois[tg.poi];
      if (h?.kind === 'news') { onnews?.(h.key); pinned = null; return; }
      if (h?.code) onpick(h.code);
      pinned = touch && h ? h.tip : null;
      return;
    }
    if (tg.joint !== null) { const r = tipFor(tg); pinned = touch && r ? r.tip : null; return; }
    const dt = touch ? detailTip(local(e)) : null;
    if (tg.muni) { const r = tipFor(tg); pinned = touch ? dt ?? r?.tip ?? null : null; return; }
    if (tg.code) { onpick(tg.code); pinned = touch ? dt ?? prefTip(tg.code) : null; }
  }

  // Roving focus over prefectures (arrow keys), Enter selects, Escape goes back to Japan.
  let kbd = $state<string | null>(null);
  function onkeydown(e: KeyboardEvent) {
    if (measure.armed && (e.key === 'Escape' || e.key === 'Backspace')) {
      e.preventDefault();
      if (e.key === 'Escape') measure.stop(); else measure.undo();
      return;
    }
    if (e.key === 'Escape') wheelOn = false;
    // inside a focused prefecture the arrows walk its municipalities (when they are on the map)
    const munisHere = focus && !compare && geo.munis.length ? geo.munis.filter((m) => m.code.startsWith(focus)) : [];
    if (munisHere.length && ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
      const mc = munisHere.map((m) => m.code);
      let j = mc.indexOf(kbd && kbd.length === 5 ? kbd : selMuni ?? '');
      if (e.key === 'Enter' || e.key === ' ') { if (j >= 0) onpick(mc[j]); e.preventDefault(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(mc.length - 1, j + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, j < 0 ? 0 : j - 1);
      else if (e.key === 'Home') j = 0;
      else j = mc.length - 1;
      e.preventDefault();
      kbd = mc[j];
      const m = munisHere[j], [cx, cy] = transform.apply(m.centroid);
      const r = svg.getBoundingClientRect(), sc = r.width / geo.width;
      hover = { tip: level === 'muni' ? prefTip(m.code) : muniTip(m), muni: level === 'muni' ? undefined : m.code, code: level === 'muni' ? m.code : focus ?? undefined, x: cx * sc, y: cy * sc };
      return;
    }
    const codes = geo.prefs.map((s) => s.code);
    const cur = kbd ?? focus ?? codes[0];
    let i = codes.indexOf(cur);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = Math.min(codes.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = Math.max(0, i - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = codes.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') { onpick(cur); e.preventDefault(); return; }
    else if (e.key === 'Escape') { onclear(); kbd = null; hover = null; return; }
    else if (e.key === '+' || e.key === '=') { zoomBy(1.6); return; }
    else if (e.key === '-') { zoomBy(1 / 1.6); return; }
    else return;
    e.preventDefault();
    kbd = codes[i];
    const s = geo.prefs[i];
    const [cx, cy] = transform.apply(s.centroid);
    const r = svg.getBoundingClientRect(), sc = r.width / geo.width;
    hover = { tip: prefTip(s.code), code: s.code, x: cx * sc, y: cy * sc };
  }
  const kbdLabel = $derived(hover && kbd ? `${hover.tip.title} ${hover.tip.big ?? ''}` : '');

  const hoverShape = $derived.by(() => {
    if (!hover) return null;
    if (hover.muni) return focusMunis.find((m) => m.code === hover!.muni) ?? null;
    return hover.code ? shapeOf(hover.code) : null;
  });
  const selMuniShape = $derived(selMuni ? muniByCode.get(selMuni) ?? null : null);

  // ------------------------------------------------------------ 地理院タイル
  let baseCanvas: HTMLCanvasElement | undefined = $state();
  let themeCanvas: HTMLCanvasElement | undefined = $state();
  let tileTick = $state(0);
  let tileFrame = 0;
  /** zoomed out too far for a thematic layer (its tiles start at a larger scale) */
  let tilesTooFar = $state(false);
  const P0 = $derived(geo.P([0, 0])), Pk = $derived(geo.P([1, 0])[0] - geo.P([0, 0])[0]);
  const toPlanar = (vx: number, vy: number): [number, number] => [(vx - P0[0]) / Pk, -(vy - P0[1]) / Pk];
  function drawTiles(cv: HTMLCanvasElement | undefined, layer: TileLayer | null, W: number, H: number, tr: ZoomTransform, f: typeof fit) {
    if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx || !layer || !geo.layout) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the visible map rectangle in planar metres, and the insets on screen
    const [vx0, vy0] = tr.invert([(0 - f.ox) / f.s, (0 - f.oy) / f.s]), [vx1, vy1] = tr.invert([(W - f.ox) / f.s, (H - f.oy) / f.s]);
    const [x0, y1] = toPlanar(vx0, vy0), [x1, y0] = toPlanar(vx1, vy1);
    const inView = geo.insets.filter((r) => r.x < vx1 && r.x + r.w > vx0 && r.y < vy1 && r.y + r.h > vy0);
    const insetKeys = inView.map((r) => r.key).filter((k): k is 'okinawa' | 'ogasawara' => k === 'okinawa' || k === 'ogasawara');
    const k = tr.k * f.s, ox = f.ox + tr.x * f.s, oy = f.oy + tr.y * f.s;
    const scr = (p: [number, number]) => { const [vx, vy] = geo.P(p); return [ox + vx * k, oy + vy * k]; };
    const { tiles, tooFar } = visibleTiles(layer, geo.layout, { x0, y0, x1, y1 }, insetKeys, k * geo.unitsPerMetre * dpr);
    if (layer.thematic) tilesTooFar = tooFar;
    if (tooFar && layer.thematic) return;
    const insetRects = geo.insets.map((r) => ({ key: r.key, x: ox + r.x * k, y: oy + r.y * k, w: r.w * k, h: r.h * k }));
    for (const space of ['main', 'okinawa', 'ogasawara'] as const) {
      const list = tiles.filter((t) => t.space === space);
      if (!list.length) continue;
      ctx.save();
      ctx.beginPath();
      if (space === 'main') { ctx.rect(0, 0, W, H); for (const r of insetRects) ctx.rect(r.x, r.y, r.w, r.h); ctx.clip('evenodd'); }
      else { const r = insetRects.find((q) => q.key === space); if (r) { ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); } }
      for (const t of list) {
        const img = tileImage(tileUrl(layer, t.z, t.x, t.y), () => (tileTick++));
        if (!img) continue;
        const pts = t.grid.map(scr), n = t.n, cell = 256 / n;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const a = pts[j * (n + 1) + i], b = pts[j * (n + 1) + i + 1], c = pts[(j + 1) * (n + 1) + i];
          // a piece of the image → its three projected corners (a hair larger to hide seams)
          ctx.setTransform(dpr * (b[0] - a[0]) / cell, dpr * (b[1] - a[1]) / cell, dpr * (c[0] - a[0]) / cell, dpr * (c[1] - a[1]) / cell, dpr * a[0], dpr * a[1]);
          // drawn half a source pixel larger on every side, so neighbouring pieces overlap instead of leaving hairlines
          ctx.drawImage(img, i * cell, j * cell, cell, cell, -0.5, -0.5, cell + 1, cell + 1);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.restore();
    }
  }
  $effect(() => {
    const layer = tileLayer, tr = transform, f = fit, W = boxW, H = boxH;
    void tileTick;
    cancelAnimationFrame(tileFrame);
    tileFrame = requestAnimationFrame(() => {
      const base = layer?.thematic ? TILE_LAYERS[0] : layer;
      drawTiles(baseCanvas, base ?? null, W, H, tr, f);
      drawTiles(themeCanvas, layer?.thematic ? layer : null, W, H, tr, f);
    });
    return () => cancelAnimationFrame(tileFrame);
  });

  // ------------------------------------------------------------ 1 km raster (reach maps)
  let rasterCanvas: HTMLCanvasElement | undefined = $state();
  let rasterFrame = 0;
  $effect(() => {
    const r = raster, cv = rasterCanvas, tr = transform, f = fit, W = boxW, H = boxH;
    if (!r || !cv) return;
    void r.version;
    cancelAnimationFrame(rasterFrame);
    rasterFrame = requestAnimationFrame(() => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const k = tr.k * f.s, size = Math.max(1.1, r.size * k) + 0.4, half = size / 2;
      // true cell shape (45″ × 30″) once the cells are big enough to tell
      const exact = !!r.w && !!r.h && r.size * k > 4, hh = exact ? r.h! * k + 0.5 : size;
      const ox = f.ox + tr.x * f.s, oy = f.oy + tr.y * f.s;
      let last = '';
      for (let i = 0, n = r.xy.length / 2; i < n; i++) {
        const x = ox + r.xy[2 * i] * k, y = oy + r.xy[2 * i + 1] * k;
        if (x < -size || y < -size || x > W + size || y > H + size) continue;
        const c = r.color(i);
        if (!c) continue;
        if (c !== last) { ctx.fillStyle = c; last = c; }
        if (exact) { const ww = r.w![i] * k + 0.5; ctx.fillRect(x - ww / 2, y - hh / 2, ww, hh); }
        else ctx.fillRect(x - half, y - half, size, size);
      }
    });
    return () => cancelAnimationFrame(rasterFrame);
  });

  // ------------------------------------------------------------ buildings and parcels (vector tiles)
  const Z_BLD = 15, Z_FUDE = 16;
  let vecCanvas: HTMLCanvasElement | undefined = $state();
  let vecTick = $state(0);
  let vecFrame = 0;
  /** parcels drawn in the last frame, with their tile's clip (for hover) */
  let parcelsDrawn: { p: Parcel; clip: Path2D }[] = [];
  /** 'none' when every parcel tile on screen came back without data (not covered by the public data) */
  let fudeState = $state<'ok' | 'none' | 'loading'>('ok');
  const vecOn = $derived((showBld && zNow >= Z_BLD) || (showFude && zNow >= Z_FUDE));
  const VT_LAYER = { key: 'vt', path: '', ext: '', minZ: VT_Z, maxZ: VT_Z, ja: '', en: '' } as unknown as TileLayer;
  $effect(() => {
    const cv = vecCanvas, tr = transform, f = fit, W = boxW, H = boxH, bld = showBld && zNow >= Z_BLD, fu = showFude && zNow >= Z_FUDE, isDark = dark;
    void vecTick;
    if (!cv || !geo.layout) return;
    cancelAnimationFrame(vecFrame);
    vecFrame = requestAnimationFrame(() => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      parcelsDrawn = [];
      if (!bld && !fu) { fudeState = 'ok'; return; }
      const [vx0, vy0] = tr.invert([(0 - f.ox) / f.s, (0 - f.oy) / f.s]), [vx1, vy1] = tr.invert([(W - f.ox) / f.s, (H - f.oy) / f.s]);
      const [x0, y1] = toPlanar(vx0, vy0), [x1, y0] = toPlanar(vx1, vy1);
      const insetKeys = geo.insets.filter((r) => r.x < vx1 && r.x + r.w > vx0 && r.y < vy1 && r.y + r.h > vy0).map((r) => r.key as 'okinawa' | 'ogasawara');
      const { tiles } = visibleTiles(VT_LAYER, geo.layout!, { x0, y0, x1, y1 }, insetKeys, 1, 200);
      const k = tr.k * f.s, ox = f.ox + tr.x * f.s, oy = f.oy + tr.y * f.s;
      const redraw = () => vecTick++;
      const ink = isDark ? '230 230 225' : '40 44 48';
      let fudeAny = false, fudePending = false;
      for (const tl of tiles) {
        // the tile's own square: features are cut with a margin, which must not show as extra lines
        const clip = new Path2D();
        const c = [tl.grid[0], tl.grid[1], tl.grid[3], tl.grid[2]].map((q) => geo.P(q));
        c.forEach(([x, y], i) => (i ? clip.lineTo(x, y) : clip.moveTo(x, y)));
        clip.closePath();
        ctx.save();
        ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
        ctx.clip(clip);
        ctx.lineWidth = 1 / k;
        if (bld) {
          const b = vtile('bld', tl.x, tl.y, viewBoxAt, redraw);
          if (b) {
            ctx.fillStyle = `rgb(${ink} / ${tileLayer ? 0.16 : 0.22})`;
            ctx.fill(b.paths[0], 'evenodd');
            ctx.fillStyle = `rgb(${ink} / ${tileLayer ? 0.26 : 0.34})`;
            ctx.fill(b.paths[1], 'evenodd');
            ctx.strokeStyle = `rgb(${ink} / 0.55)`;
            ctx.stroke(b.paths[0]); ctx.stroke(b.paths[1]);
          }
        }
        if (fu) {
          const pt = vtile('fude', tl.x, tl.y, viewBoxAt, redraw);
          if (pt === undefined) fudePending = true;
          else if (pt && !pt.empty) {
            fudeAny = true;
            ctx.strokeStyle = isDark ? 'rgb(240 170 120 / 0.9)' : 'rgb(178 90 40 / 0.85)';
            ctx.lineWidth = 1.2 / k;
            ctx.stroke(pt.paths[0]);
            for (const p of pt.parcels) parcelsDrawn.push({ p, clip });
          }
        }
        ctx.restore();
      }
      fudeState = !fu || fudeAny ? 'ok' : fudePending ? 'loading' : 'none';
      // 地番 labels when there is room for them
      if (fu && zNow >= 17) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = isDark ? 'rgb(20 20 20 / 0.8)' : 'rgb(255 255 255 / 0.85)';
        ctx.fillStyle = isDark ? '#f2c9a8' : '#7a3a14';
        let n = 0;
        for (const { p } of parcelsDrawn) {
          const w = (p.box[2] - p.box[0]) * k;
          if (w < 36 || n > 400) continue;
          const sx = ox + p.c[0] * k, sy = oy + p.c[1] * k;
          if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
          ctx.strokeText(p.chiban, sx, sy); ctx.fillText(p.chiban, sx, sy); n++;
        }
      }
    });
    return () => cancelAnimationFrame(vecFrame);
  });
  /** the parcel under a screen point */
  function parcelAt(sx: number, sy: number): Parcel | null {
    if (!parcelsDrawn.length || !vecCanvas) return null;
    const [vx, vy] = transform.invert([(sx - fit.ox) / fit.s, (sy - fit.oy) / fit.s]);
    const ctx = vecCanvas.getContext('2d')!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    try {
      for (const { p, clip } of parcelsDrawn) {
        if (vx < p.box[0] || vx > p.box[2] || vy < p.box[1] || vy > p.box[3]) continue;
        if (ctx.isPointInPath(clip, vx, vy) && ctx.isPointInPath(p.path, vx, vy, 'evenodd')) return p;
      }
    } finally { ctx.restore(); }
    return null;
  }

  // ------------------------------------------------------------ news callouts
  /** viewBox -> pixels in the map box (the SVG is letterboxed when its height is capped) */
  const fit = $derived.by(() => {
    const s = Math.min(boxW / geo.width, boxH / geo.height);
    return { s, ox: (boxW - geo.width * s) / 2, oy: (boxH - geo.height * s) / 2 };
  });
  const toScreen = (xy: [number, number]): [number, number] => {
    const [x, y] = transform.apply(xy);
    return [fit.ox + x * fit.s, fit.oy + y * fit.s];
  };
  // Land (and the inset boxes) drawn at 1/4 size: the free sea around Japan is where cards go.
  // Rebuilt after zooming settles (one frame later), not on every pointer move.
  let mask = $state.raw<Mask | null>(null);
  let maskTimer = 0;
  $effect(() => {
    if (!newsCards || !news.length) { mask = null; return; }
    const tr = transform, f = fit, W = boxW, H = boxH;
    cancelAnimationFrame(maskTimer);
    maskTimer = requestAnimationFrame(() => {
      const q = 4, w = Math.ceil(W / q), h = Math.ceil(H / q);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const k = (f.s * tr.k) / q;
      ctx.setTransform(k, 0, 0, k, (f.ox + tr.x * f.s) / q, (f.oy + tr.y * f.s) / q);
      ctx.fillStyle = '#000';
      for (const s of geo.prefs) ctx.fill(new Path2D(s.d));
      for (const r of geo.insets) ctx.fillRect(r.x, r.y, r.w, r.h);
      const px = ctx.getImageData(0, 0, w, h).data;
      const occ = new Uint8Array(w * h);
      for (let i = 0; i < occ.length; i++) occ[i] = px[i * 4 + 3] > 40 ? 1 : 0;
      mask = { w, h, q, sat: buildSat(occ, w, h) };
    });
    return () => cancelAnimationFrame(maskTimer);
  });
  let dismissed = $state<string[]>([]);
  const CARD = { w: 310, h: 158 };
  /** item shown on each card (pager position) */
  let ks = $state<Record<string, number>>({});
  const current = (g: NewsGroup) => g.items[Math.min(ks[g.key] ?? 0, g.items.length - 1)];
  /** a card with its related news open: shown alone and larger */
  let hoverCard = $state<string | null>(null);
  let relHover = $state<string | null>(null);
  /** measured height of the open card's content (the first layout uses an estimate) */
  let openH = $state(0);
  $effect(() => { if (newsOpen && news.length && !news.some((g) => g.key === newsOpen)) newsOpen = null; });
  function toggleExpand(key: string) {
    newsOpen = newsOpen === key ? null : key;
    openH = 0;
    if (newsOpen) { onnewspin?.(key); hoverCard = null; }
  }
  $effect(() => {
    if (!newsOpen) return;
    const onkey = (e: KeyboardEvent) => { if (e.key === 'Escape') { newsOpen = null; openH = 0; } };
    addEventListener('keydown', onkey);
    return () => removeEventListener('keydown', onkey);
  });
  /** related news of the open card, or of the card under the pointer (their places are ringed) */
  const relatedNow = $derived.by(() => {
    const key = newsOpen ?? hoverCard;
    const g = key ? news.find((x) => x.key === key) : null;
    return g && relatedFor ? relatedFor(current(g).link) : [];
  });
  const relatedPlaces = $derived(new Set(relatedNow.map((r) => placeKey(r.it))));
  const callouts = $derived.by(() => {
    if (!newsCards || !mask || !news.length) return [];
    if (newsOpen) {
      const g = news.find((x) => x.key === newsOpen);
      if (!g) return [];
      const tl = timelineFor ? timelineFor(current(g).link).length : 0;
      const est = CARD.h + (g.items.length > 1 ? 26 : 0) + 44 + (tl ? 80 : 0) + Math.max(1, relatedNow.length) * 46;
      const h = Math.min(boxH - 16, openH ? openH + 2 : est);
      const p = g.xy ? toScreen(g.xy) : null;
      const placed = placeCards([{ key: g.key, p, h }], mask, boxW, boxH, { w: 380, h }, [[boxW - 56, boxH - 150, boxW, boxH]], p ? [p] : []);
      return placed.map((c) => ({ ...c, g, pin: true }));
    }
    const inView = (g: NewsGroup) => {
      if (!g.xy) return true;
      const [x, y] = toScreen(g.xy);
      return x > 4 && y > 4 && x < boxW - 4 && y < boxH - 4;
    };
    const byKey = new Map(news.map((g) => [g.key, g]));
    const order: NewsGroup[] = [];
    const add = (g: NewsGroup | undefined) => { if (g && !order.includes(g) && inView(g)) order.push(g); };
    for (const k of newsPins) add(byKey.get(k));
    // the latest places, skipping one whose newest article is already on a card (an article naming two wards).
    // Independent of the focus, so hovering a card never changes which cards are shown.
    const shown = new Set(order.map((g) => g.items[0].link));
    let n = 0;
    for (const g of news.filter((g) => g.xy && !dismissed.includes(g.key) && !newsPins.includes(g.key) && inView(g))
      .sort((a, b) => b.latest.localeCompare(a.latest))) {
      if (n >= newsAuto) break;
      if (shown.has(g.items[0].link)) continue;
      shown.add(g.items[0].link); add(g); n++;
    }
    // a place hovered in the side list gets a card too — last, so the cards already placed stay put
    if (newsFocus) add(byKey.get(newsFocus));
    const pts = news.filter((g) => g.xy).map((g) => toScreen(g.xy!));
    // keep the zoom buttons clear
    const clear: [number, number, number, number][] = [[boxW - 56, boxH - 150, boxW, boxH], [0, 0, 200, 44]];
    // a group with several items has a pager row
    const placed = placeCards(order.map((g) => ({ key: g.key, p: g.xy ? toScreen(g.xy) : null, h: g.items.length > 1 ? CARD.h + 26 : CARD.h })), mask, boxW, boxH, CARD, clear, pts);
    return placed.map((p) => ({ ...p, g: byKey.get(p.key)!, pin: newsPins.includes(p.key) }));
  });
  /** open card: thin lines from the card to the places of its related news */
  const relLines = $derived.by(() => {
    const c = newsOpen ? callouts[0] : null;
    if (!c || !locateNews) return [];
    const out: { link: string; d: string; x: number; y: number }[] = [];
    for (const r of relatedNow) {
      const xy = locateNews(r.it.link);
      if (!xy) continue;
      const [x, y] = toScreen(xy);
      if (x < 0 || y < 0 || x > boxW || y > boxH) continue;
      // from the nearest point of the card's outline
      const ax = Math.max(c.x, Math.min(x, c.x + c.w)), ay = Math.max(c.y, Math.min(y, c.y + c.h));
      out.push({ link: r.it.link, d: `M${ax.toFixed(1)},${ay.toFixed(1)}L${x.toFixed(1)},${y.toFixed(1)}`, x, y });
    }
    return out;
  });
  /** narrow maps: the focused point is linked to the card list below the map */
  const focusLink = $derived.by(() => {
    if (newsCards || !newsFocus) return null;
    const g = news.find((x) => x.key === newsFocus);
    if (!g?.xy) return null;
    const [x, y] = toScreen(g.xy);
    if (x < 0 || y < 0 || x > boxW || y > boxH) return null;
    return { x, y };
  });
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<div class="map" class:picking={pickPoint || measure.armed} class:tiled={!!tileLayer} bind:this={wrap}
     style:--fo={fillOpacity * (0.06 + 0.94 * fade)} style:--fade={fade}>
  {#if tileLayer}
    <canvas class="tiles" class:inv={dark && (tileLayer.thematic ? TILE_LAYERS[0] : tileLayer).invertDark} bind:this={baseCanvas}
            style:width="{boxW}px" style:height="{boxH}px" aria-hidden="true"></canvas>
    <canvas class="tiles" bind:this={themeCanvas} style:width="{boxW}px" style:height="{boxH}px" aria-hidden="true"></canvas>
    {#if tilesTooFar}<p class="tiles-hint">{t(lang, 'tilesZoomIn')}</p>{/if}
  {/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 {geo.width} {geo.height}"
    role="application"
    aria-roledescription={lang === 'ja' ? '地図' : 'map'}
    aria-label={t(lang, 'mapLabel')}
    tabindex="0"
    style:touch-action={transform.k > 1.01 ? 'none' : 'pan-y'}
    {onpointermove}
    onpointerleave={() => (hover = null)}
    {onpointerdown}
    {onpointerup}
    {onclick}
    {ondblclick}
    {onkeydown}
    onblur={() => { kbd = null; hover = null; }}
  >
    <defs>
      <pattern id="pat-nodata" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45) scale({1 / transform.k})">
        <rect width="6" height="6" fill="var(--land)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--hatch)" stroke-width="1.4" />
      </pattern>
      <!-- industrial zoning: sparse hatch / dense hatch / solid, all in clay -->
      <pattern id="pz1" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45) scale({1 / transform.k})">
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--clay)" stroke-width="1.2" />
      </pattern>
      <pattern id="pz2" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-45) scale({1 / transform.k})">
        <line x1="0" y1="0" x2="0" y2="3" stroke="var(--clay)" stroke-width="1.3" />
      </pattern>
    </defs>

    <g transform={transform.toString()}>
      {#each geo.insets as f (f.key)}
        <rect class="inset" x={f.x} y={f.y} width={f.w} height={f.h} rx="4" />
      {/each}

      <g class="areas" class:muni={level === 'muni'} class:deep={fade < 1}>
        {#each areaShapes as s (s.code)}
          {@const f = fill(s.code)}
          <path d={dOf(s)} data-code={s.code} fill={f} class:dim={dimmed(s.code)}
                style:stroke={fade < 1 ? (f.startsWith('url') ? 'var(--hatch)' : f) : null}
                class:faded={level === 'pref' && !!focus && !compare && s.code !== focus} />
        {/each}
      </g>
      {#if detailOn.length}
        <path class="pref-borders" class:strong={level === 'muni'} d={detailOn.map((d) => d.outline).join('')} />
      {:else}
        <path class="pref-borders" class:strong={level === 'muni'} d={geo.prefBorders} />
      {/if}

      {#if focusMunis.length}
        <g class="munis">
          {#each focusMunis as m (m.code)}
            <path d={dOf(m)} data-muni={m.code} />
          {/each}
        </g>
        <path class="muni-borders" d={deep && details.get(focus!) ? details.get(focus!)!.borders : geo.muniBorders(focus!)} />
      {/if}

      {#if zoning}
        <g class="zoning" aria-hidden="true">
          {#each ['1', '2', '3'] as k (k)}
            {#if zoning[k]}<path class="z{k}" d={zoning[k]} fill={k === '3' ? 'var(--clay)' : `url(#pz${k})`} />{/if}
          {/each}
        </g>
      {/if}
      {#if roads && showRoads}
        <g class="roads" class:far={transform.k < 2} aria-hidden="true">
          <path class="halo" d={(detailRoads ?? roads.d)[1] + (detailRoads ?? roads.d)[2] + (detailRoads ?? roads.d)[3]} />
          <path class="r3" d={(detailRoads ?? roads.d)[3]} />
          <path class="r2" d={(detailRoads ?? roads.d)[2]} />
          <path class="r1" d={(detailRoads ?? roads.d)[1]} />
        </g>
      {/if}

      {#each rings as g (g.label)}
        <circle class="ring" cx={g.xy[0]} cy={g.xy[1]} r={g.r} />
      {/each}
      {#each tracks as tr (tr.key)}
        <path class="track {tr.kind}" d={tr.d} />
      {/each}
      {#if hoverShape}
        <path class="hover" d={dOf(hoverShape)} />
      {/if}
      {#if focusShape && !compare}
        <path class="focus" class:thin={level === 'muni'} d={dOf(focusShape)} />
      {/if}
      {#if selMuniShape}
        <path class="focus sel-muni" d={dOf(selMuniShape)} />
      {/if}
      {#if muniB && muniByCode.get(muniB)}<path class="sel-b" d={dOf(muniByCode.get(muniB)!)} />{/if}
      {#if muniA && muniByCode.get(muniA)}<path class="sel-a" d={dOf(muniByCode.get(muniA)!)} />{/if}
      {#if compare}
        {#if b && prefByCode.get(pad2(b))}<path class="sel-b" d={dOf(prefByCode.get(pad2(b))!)} />{/if}
        {#if a && prefByCode.get(pad2(a))}<path class="sel-a" d={dOf(prefByCode.get(pad2(a))!)} />{/if}
      {/if}
      {#if kbd && shapeOf(kbd)}
        <path class="kbd" d={dOf(shapeOf(kbd)!)} />
      {/if}
    </g>
  </svg>

  {#if raster}
    <canvas class="raster" bind:this={rasterCanvas} style:width="{boxW}px" style:height="{boxH}px" style:opacity={0.35 + 0.65 * fade} aria-hidden="true"></canvas>
  {/if}

  {#if vecOn}
    <canvas class="raster vec" bind:this={vecCanvas} style:width="{boxW}px" style:height="{boxH}px" aria-hidden="true"></canvas>
  {/if}
  {#if showFude && zNow >= Z_FUDE && fudeState === 'none'}
    <p class="tiles-hint">{t(lang, 'fudeNone')}</p>
  {:else if (showBld || showFude) && zNow >= 14 && zNow < Z_FUDE && !measure.armed}
    <p class="tiles-hint">{t(lang, zNow < Z_BLD ? 'zoomForBld' : 'zoomForFude')}</p>
  {/if}

  <!-- Point layers live outside the zoom group so they keep their size on screen.
       Keyboard access to DPL sites is through the site list in the side panel. -->
  <svg class="overlay" viewBox="0 0 {geo.width} {geo.height}" aria-hidden="true"
       bind:clientWidth={boxW} bind:clientHeight={boxH}
       {onpointermove} onpointerleave={() => { hover = null; hoverFlow = null; }} {onpointerdown} {onpointerup} {onclick} {ondblclick}>
    {#if arcs.length}
      <g transform="scale({px})">
        {#each arcs as a (a.f.key)}
          <g class="flow {a.f.kind}" class:hot={hoverFlow === a.i} class:cold={hoverFlow !== null && hoverFlow !== a.i} data-flow={a.i}>
            <path class="halo" d={a.d} stroke-width={a.f.w + 3} />
            <path class="arc" d={a.d} stroke-width={a.f.w} />
            <path class="head" d={a.head} />
            <path class="hit" d={a.d} stroke-width={Math.max(12, a.f.w + 8)} />
          </g>
        {/each}
      </g>
    {/if}
    {#each joints as j, ji (j.id)}
      {@const [x, y] = transform.apply(j.xy)}
      <g class="joint {j.k}" transform="translate({x},{y}) scale({px})" data-joint={ji}>
        <circle class="hit" r="8" />
        {#if j.k === 'jct'}<rect class="jm" x="-3.2" y="-3.2" width="6.4" height="6.4" transform="rotate(45)" />
        {:else}<rect class="jm" x="-3" y="-3" width="6" height="6" rx="1" />{/if}
        {#if labelled.has(`j${j.id}`)}<text x="7" dy="0.35em">{j.n}</text>{/if}
      </g>
    {/each}
    {#each pois as h, hi (h.key)}
      {@const [x, y] = transform.apply(h.xy)}
      <g class="poi {h.kind}" transform="translate({x},{y}) scale({px})" data-poi={hi}>
        <circle class="hit" r={Math.max(9, h.r + 3)} cy={h.kind === 'news' ? -h.r - 5 : 0} />
        {#if h.kind === 'air'}
          <circle class="pm" r={h.r} />
          <path class="glyph" transform="scale({h.r / 6})" d="M0-4.2 0.9-1.2 4.2 0.6 4.2 1.5 0.9 0.6 0.6 3 1.8 3.9 1.8 4.5 0 3.9-1.8 4.5-1.8 3.9-0.6 3-0.9 0.6-4.2 1.5-4.2 0.6-0.9-1.2Z" />
        {:else if h.kind === 'port'}
          <rect class="pm" x={-h.r} y={-h.r} width={h.r * 2} height={h.r * 2} rx={h.r * 0.35} />
          <path class="glyph line" transform="scale({h.r / 6})" d="M0-3.6V3.6M-2.4-1.4H2.4M-3.4 1.4Q0 4.8 3.4 1.4" />
        {:else if h.kind === 'rail'}
          <rect class="pm" x={-h.r} y={-h.r * 0.7} width={h.r * 2} height={h.r * 1.4} rx="1.5" />
          <path class="glyph line" transform="scale({h.r / 6})" d="M-3.6 0H3.6" />
        {:else if h.kind === 'quake'}
          <circle class="qk" r={h.r} fill={h.color} />
          {#if h.badge}<text class="qk-t" text-anchor="middle" dy="0.35em" style:fill={h.ink}>{h.badge}</text>{/if}
        {:else if h.kind === 'typhoon'}
          <circle class="ty" r={h.r} />
          <path class="ty-g" transform="scale({h.r / 8})" d="M0-5A5 5 0 0 1 5 0 M0 5A5 5 0 0 1-5 0 M-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0" />
        {:else if h.kind === 'fac'}
          <!-- a facility named in the news: diamond, filled when completed -->
          <rect class="fac" class:done={h.filled} x={-h.r} y={-h.r} width={2 * h.r} height={2 * h.r} rx="1.5" transform="rotate(45)" />
        {:else if h.kind === 'origin'}
          <circle class="org" r={h.r} />
          <circle class="org-c" r={h.r * 0.38} />
        {:else}
          <!-- news: a speech bubble with the number of items; a ring when the place is in focus -->
          {#if newsFocus === h.key || newsPins.includes(h.key)}<circle class="nw-ring" r={h.r + 6} cy={-h.r - 5} />
          {:else if relatedPlaces.has(h.key)}<circle class="nw-ring rel" r={h.r + 6} cy={-h.r - 5} />{/if}
          <path class="nw" d="M{-h.r - 4},{-h.r}h{2 * h.r + 8}a4 4 0 0 1 4 4v{2 * h.r - 8}a4 4 0 0 1-4 4h{-(h.r + 1)}l-3 5l-3-5h{-(h.r - 2)}a4 4 0 0 1-4-4v{-(2 * h.r - 8)}a4 4 0 0 1 4-4z"
                transform="translate(0,{-h.r - 5})" />
          {#if h.fresh}<circle class="nw-new" cx={h.r + 5} cy={-2 * h.r - 4} r="3.5" />{/if}
          <text class="nw-t" text-anchor="middle" y={-h.r - 5} dy="0.35em">{h.badge}</text>
        {/if}
        {#if h.major && (transform.k >= 2.5 || h.kind === 'typhoon' || h.kind === 'quake' || h.kind === 'origin')}<text x={h.r + 4} dy="0.35em">{h.label}</text>{/if}
      </g>
    {/each}
    {#each rings as g (g.label)}
      {@const [x, y] = transform.apply([g.xy[0], g.xy[1] - g.r])}
      <g transform="translate({x},{y}) scale({px})"><text class="ring-label" y="-4" text-anchor="middle">{g.label}</text></g>
    {/each}
    {#each markers as m (m.i)}
      {@const [x, y] = transform.apply(m.xy)}
      <g class="site" class:built={m.built} class:sel={m.i === site} class:muted={mutedMarkers && m.i !== site}
         transform="translate({x},{y}) scale({px})" data-site={m.i}>
        <circle class="hit" r="11" />
        {#if m.built}
          <circle class="dot" r={siteR} />
        {:else}
          <circle class="ring-out" r={siteR} />
          <circle class="ring-in" r={Math.max(1.6, siteR - 2.4)} />
        {/if}
        {#if labelled.has(`s${m.i}`)}<text x={siteR + 5} dy="0.35em">{m.label}</text>{/if}
      </g>
    {/each}
    {#each plotPaths as pl (pl.key)}
      <path class="plot" d={pl.d} />
      <g transform="translate({pl.x},{pl.y}) scale({px})"><text class="plot-label" text-anchor="middle" dy="0.35em">{pl.label}</text></g>
    {/each}
    {#if measure.armed && measureXY.length}
      <g class="measure">
        {#if measure.closed}<path class="ms-fill" d={measurePath} />{/if}
        <path class="ms-halo" d={measurePath} />
        <path class="ms-line" d={measurePath} />
        {#each measureXY as p, i (i)}
          {@const [x, y] = transform.apply(p)}
          <circle class="ms-pt" class:first={i === 0} cx={x} cy={y} r={(i === 0 && measure.pts.length > 2 && !measure.closed ? 6 : 4) * px} style:stroke-width="{2}" />
        {/each}
      </g>
    {/if}
  </svg>

  {#if callouts.length || focusLink}
    <div class="callouts" style:width="{boxW}px" style:height="{boxH}px">
      <svg class="leaders" width={boxW} height={boxH} aria-hidden="true">
        {#each callouts as c (c.key)}
          {#if c.path}
            <path class="leader-halo" d={c.path} />
            <path class="leader" class:draw={!reduceMotion} class:hot={newsFocus === c.key} d={c.path} pathLength="1" />
            <circle class="leader-dot" cx={c.px} cy={c.py} r="3.5" />
          {/if}
        {/each}
        {#each relLines as l (l.link)}
          <path class="rel-line" class:hot={relHover === l.link} d={l.d} />
          <circle class="rel-dot" class:hot={relHover === l.link} cx={l.x} cy={l.y} r={relHover === l.link ? 6 : 4.5} />
        {/each}
        {#if focusLink}
          <path class="leader-halo" d="M{focusLink.x},{focusLink.y}V{boxH}" />
          <path class="leader hot" d="M{focusLink.x},{focusLink.y}V{boxH}" />
          <circle class="focus-ring" cx={focusLink.x} cy={focusLink.y} r="16" />
        {/if}
      </svg>
      {#each callouts as c (c.key)}
        <div class="callout" class:open={newsOpen === c.key} style:left="{c.x}px" style:top="{c.y}px" style:width="{c.w}px" style:height="{c.h}px">
          <NewsCallout group={c.g} {lang} active={newsFocus === c.key || c.pin} bind:k={() => ks[c.key] ?? 0, (v) => (ks[c.key] = v)}
                       dim={!!hoverCard && hoverCard !== c.key}
                       expanded={newsOpen === c.key} ontoggle={relatedFor ? () => toggleExpand(c.key) : undefined}
                       {relatedFor} {timelineFor} bind:relHover maxH={boxH - 16}
                       bind:natural={() => (newsOpen === c.key ? openH : 0), (v) => { if (newsOpen === c.key && v) openH = v; }}
                       onplace={onnewsplace} onhover={(on) => { hoverCard = on ? c.key : null; onnewshover?.(on ? c.key : null); }}
                       onclose={() => { if (newsOpen === c.key) { newsOpen = null; return; } if (c.pin) onnewsclose?.(c.key); else dismissed = [...dismissed, c.key]; }} />
        </div>
      {/each}
    </div>
  {/if}

  <div class="sr-only" aria-live="polite">{kbdLabel}</div>

  {#if hover && !pinned}
    <Tooltip tip={hover.tip} x={hover.x} y={hover.y} bounds={wrap} />
  {/if}

  {#if pinned}
    <div class="card">
      <Tooltip tip={pinned} pinned />
      <button type="button" class="close" aria-label={t(lang, 'close')} onclick={() => (pinned = null)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" /></svg>
      </button>
    </div>
  {/if}

  <div class="scalebar" aria-hidden="true"><span class="sb" style:width="{scaleBar.w}px"></span>{scaleBar.label}</div>

  {#if wheelHint}
    <p class="wheel-hint" role="status">{t(lang, 'wheelHint')}</p>
  {/if}

  {#if measure.armed}
    <div class="measure-box" role="group" aria-label={t(lang, 'measure')}>
      <p class="mb-h">{t(lang, 'measure')}</p>
      {#if measure.pts.length < 2}
        <p class="small">{t(lang, 'measureHint')}</p>
      {:else}
        <p class="mb-v tnum">{t(lang, measure.closed ? 'perimeter' : 'distance')} <strong>{fmtLen(measure.length)}</strong></p>
        {#if measure.closed}
          <p class="mb-v tnum">{t(lang, 'areaLabel')} <strong>{fmtArea(measure.area)}</strong></p>
          <p class="small tnum">{(measure.area / 1e4).toFixed(2)} ha · {Math.round(measure.area / TSUBO).toLocaleString()} 坪</p>
        {:else if measure.pts.length > 2}
          <p class="small">{t(lang, 'measureClose')}</p>
        {/if}
      {/if}
      <p class="mb-acts">
        {#if measure.pts.length > 2 && !measure.closed}<button type="button" class="btn" onclick={() => (measure.closed = true)}>{t(lang, 'measureArea')}</button>{/if}
        {#if measure.closed}
          {@const code = plotCode(measure.pts)}
          <button type="button" class="btn" disabled={shortlist.has('plot', code)} onclick={() => shortlist.toggle('plot', code)}>
            {shortlist.has('plot', code) ? `★ ${t(lang, 'inShort')}` : `☆ ${t(lang, 'addPlot')}`}</button>
        {/if}
        <button type="button" class="btn" disabled={!measure.pts.length} onclick={() => measure.undo()}>{t(lang, 'undo')}</button>
        <button type="button" class="btn" disabled={!measure.pts.length} onclick={() => measure.clear()}>{t(lang, 'clearAll')}</button>
        <button type="button" class="btn" onclick={() => measure.stop()}>{t(lang, 'finish')}</button>
      </p>
    </div>
  {/if}

  <div class="zoom" role="group" aria-label="Zoom">
    <button type="button" class="zbtn" aria-label={t(lang, 'zoomIn')} title={t(lang, 'zoomIn')} onclick={() => zoomBy(1.8)} disabled={zNow >= Z_MAX - 0.05}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" /></svg>
    </button>
    <button type="button" class="zbtn" aria-label={t(lang, 'zoomOut')} title={t(lang, 'zoomOut')} onclick={() => zoomBy(1 / 1.8)}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10" stroke="currentColor" stroke-width="1.6" /></svg>
    </button>
    <button type="button" class="zbtn" aria-label={t(lang, 'zoomReset')} title={t(lang, 'zoomReset')} onclick={reset}
            disabled={transform.k === 1 && transform.x === 0 && !focus}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>
  </div>
</div>

<style>
  .map { position: relative; }
  .tiles { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 0; }
  .tiles.inv { filter: invert(0.92) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
  .map.tiled > svg:first-of-type { position: relative; z-index: 1; }
  .areas path { fill-opacity: var(--fo); }
  .map .areas.deep path { stroke-width: 2; stroke-opacity: calc(1 - var(--fade) * 0.7); vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .map.tiled .overlay, .map.tiled .raster { z-index: 2; }
  .map.tiled .zoom { z-index: 3; }
  .map.tiled .inset { stroke: var(--ink-2); }
  .scalebar { position: absolute; left: 8px; bottom: 8px; z-index: 3; display: flex; align-items: flex-end; gap: 6px; font-size: 11.5px;
              color: var(--ink-2); pointer-events: none; padding: 2px 7px 3px; border-radius: 4px;
              background: color-mix(in oklab, var(--surface) 85%, transparent); }
  .scalebar .sb { display: block; height: 6px; border: 1.5px solid var(--ink-2); border-top: 0; box-shadow: 0 1px 0 var(--bg); }
  .wheel-hint { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; z-index: 7; pointer-events: none;
                background: rgb(0 0 0 / 0.35); color: #fff; font-size: 15px; font-weight: 600; text-align: center; padding: 16px; }
  .measure .ms-line { fill: none; stroke: var(--accent); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .measure .ms-halo { fill: none; stroke: var(--bg); stroke-width: 5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .measure .ms-fill { fill: var(--accent); fill-opacity: 0.15; stroke: none; }
  .measure .ms-pt { fill: var(--bg); stroke: var(--accent); vector-effect: non-scaling-stroke; }
  .measure .ms-pt.first { fill: var(--accent); }
  .plot { fill: var(--mark); fill-opacity: 0.18; stroke: var(--mark-ring); stroke-width: 2; stroke-dasharray: 5 3; vector-effect: non-scaling-stroke; pointer-events: none; }
  .plot-label { font-size: 11.5px; font-weight: 600; fill: var(--ink); paint-order: stroke; stroke: var(--bg); stroke-width: 3px; pointer-events: none; }
  .map.tiled .vec, .vec { z-index: 2; opacity: 1; }
  .measure-box { position: absolute; left: 8px; top: 8px; z-index: 6; max-width: min(280px, calc(100% - 70px)); padding: 10px 12px;
                 background: var(--surface); border: 1px solid var(--line-strong); border-left: 3px solid var(--accent); border-radius: 8px;
                 box-shadow: 0 4px 14px rgb(0 0 0 / 0.12); font-size: 13px; }
  .measure-box p { margin: 0; }
  .measure-box .mb-h { font-weight: 600; margin-bottom: 4px; }
  .measure-box .mb-v strong { font-size: 16px; margin-left: 4px; }
  .measure-box .mb-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .measure-box .btn { min-height: 30px; padding: 0 10px; font-size: 12.5px; }
  .tiles-hint { position: absolute; left: 50%; top: 8px; transform: translateX(-50%); z-index: 6; margin: 0; padding: 4px 10px; font-size: 12px;
                background: color-mix(in oklab, var(--surface) 92%, transparent); border: 1px solid var(--line-strong); border-radius: 999px; }
  svg {
    display: block;
    width: 100%;
    height: auto;
    max-height: max(440px, calc(100dvh - 250px));
    cursor: default;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 8px; }
  .inset { fill: none; stroke: var(--line-strong); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
  .areas path {
    stroke: none;
    transition: fill 0.25s ease, opacity 0.2s ease;
    cursor: pointer;
  }
  .areas path.dim { opacity: 0.18; }
  .areas.muni path { stroke: var(--bg); stroke-width: 0.3; stroke-opacity: 0.7; vector-effect: non-scaling-stroke; }
  .pref-borders.strong { stroke: var(--ink-2); stroke-opacity: 0.7; stroke-width: 0.9; }
  .focus.thin { stroke-width: 1.5; stroke-dasharray: 4 3; }
  .sel-muni { stroke: var(--accent); stroke-width: 2.5; }
  .areas path.faded { opacity: 0.55; }
  .pref-borders {
    fill: none; stroke: var(--bg); stroke-width: 1; stroke-linejoin: round;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .munis path { fill: transparent; cursor: default; }
  .muni-borders {
    fill: none; stroke: var(--bg); stroke-opacity: 0.8; stroke-width: 0.6;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .zoning path { fill-rule: evenodd; stroke: var(--clay); stroke-width: 0.8; vector-effect: non-scaling-stroke; pointer-events: none; }
  .zoning .z3 { fill-opacity: 0.55; }
  .roads path { fill: none; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; pointer-events: none; }
  .roads.far { opacity: 0.45; }
  .roads.far .r2, .roads.far .r3 { display: none; }
  .roads .halo { stroke: var(--road-halo); stroke-width: 3; stroke-opacity: 0.7; }
  .roads .r1 { stroke: var(--road); stroke-width: 1.4; }
  .roads .r2 { stroke: var(--road); stroke-width: 1; stroke-opacity: 0.85; }
  .roads .r3 { stroke: var(--road); stroke-width: 0.9; stroke-dasharray: 3 2; }
  .hover {
    fill: none; stroke: var(--ink); stroke-width: 1.5; stroke-linejoin: round;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .focus, .kbd {
    fill: none; stroke: var(--ink); stroke-width: 2.5; stroke-linejoin: round;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .kbd { stroke: var(--accent); stroke-width: 2; }
  /* A = solid amber, B = dashed ink: the two never differ by colour alone */
  .sel-a, .sel-b { fill: none; stroke-width: 3; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; }
  .sel-a { stroke: var(--sel-a); }
  .sel-b { stroke: var(--sel-b); stroke-dasharray: 6 3; }

  .overlay {
    position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
    max-height: max(440px, calc(100dvh - 250px));
  }
  .overlay g { pointer-events: auto; cursor: pointer; }
  .overlay .hit { fill: transparent; stroke: none; }
  .site .dot { fill: var(--mark); stroke: var(--mark-ring); stroke-width: 1.6; }
  .site .ring-out { fill: var(--surface); stroke: var(--mark-ring); stroke-width: 1.2; }
  .site .ring-in { fill: none; stroke: var(--mark); stroke-width: 2.2; }
  .site.muted { opacity: 0.35; }
  .site.sel .dot, .site.sel .ring-out { stroke: var(--accent); stroke-width: 3; }
  .site:hover .dot, .site:hover .ring-out { stroke-width: 2.4; }
  .poi .pm { fill: var(--surface); stroke: var(--hub); stroke-width: 1.6; }
  .poi .fac { fill: var(--surface); stroke: var(--clay); stroke-width: 1.8; }
  .poi .fac.done { fill: var(--clay); stroke: var(--surface); stroke-width: 1.2; }
  .poi.fac text { fill: var(--clay); }
  .poi .org { fill: var(--surface); stroke: var(--ink); stroke-width: 2.4; }
  .poi .org-c { fill: var(--ink); }
  .poi.origin text { fill: var(--ink); font-weight: 600; }
  .poi .glyph { fill: var(--hub); }
  .poi .glyph.line { fill: none; stroke: var(--hub); stroke-width: 1.3; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .poi:hover .pm { stroke-width: 2.6; }
  .poi text { font-weight: 500; font-size: 11px; fill: var(--hub); }
  .qk { stroke: var(--mark-ring); stroke-width: 1.2; fill-opacity: 0.9; }
  .qk-t { font-size: 10px; font-weight: 700; fill: #111; stroke: none; paint-order: normal; pointer-events: none; }
  .ty { fill: color-mix(in oklab, var(--clay) 30%, transparent); stroke: var(--clay); stroke-width: 1.6; }
  .ty-g { fill: none; stroke: var(--clay); stroke-width: 1.6; vector-effect: non-scaling-stroke; }
  .track { fill: none; stroke: var(--clay); stroke-width: 1.8; vector-effect: non-scaling-stroke; pointer-events: none; }
  .track.forecast { stroke-dasharray: 5 4; }
  .nw { fill: var(--ink); stroke: var(--surface); stroke-width: 1.5; }
  .poi.news:hover .nw { fill: var(--ink-2); }
  .nw-t { font-size: 12px; font-weight: 700; fill: var(--bg); stroke: none; pointer-events: none; }
  .nw-new { fill: var(--clay); stroke: var(--surface); stroke-width: 1.5; }
  .nw-ring { fill: none; stroke: var(--ink); stroke-width: 2; stroke-dasharray: 3 2; }
  .nw-ring.rel { stroke: var(--clay); stroke-dasharray: none; }
  .overlay .poi.news text.nw-t, .overlay .poi.quake text.qk-t { paint-order: normal; stroke: none; }
  .overlay .poi.news text.nw-t { fill: var(--bg); }
  .ring { fill: var(--mark); fill-opacity: 0.05; stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; pointer-events: none; }
  .ring-label { font-size: 11px; font-weight: 600; fill: var(--accent); paint-order: stroke; stroke: var(--surface); stroke-width: 3px; pointer-events: none; }
  .flow { cursor: pointer; }
  .flow path { fill: none; stroke-linecap: round; }
  .flow .halo { stroke: var(--road-halo); stroke-opacity: 0.75; }
  .flow .arc { stroke: var(--flow-all); stroke-opacity: 0.8; }
  .flow .head { fill: var(--flow-all); stroke: var(--road-halo); stroke-width: 1; }
  .flow.out .arc { stroke: var(--flow-out); }
  .flow.out .head { fill: var(--flow-out); }
  .flow.in .arc { stroke: var(--flow-in); }
  .flow.in .head { fill: var(--flow-in); }
  .flow .hit { stroke: transparent; }
  .flow.hot .arc { stroke-opacity: 1; }
  .flow.cold { opacity: 0.25; }
  .joint .jm { fill: var(--surface); stroke: var(--road); stroke-width: 1.4; }
  .joint.jct .jm { fill: var(--road); }
  .overlay text {
    font-size: 11.5px; font-weight: 600; fill: var(--ink);
    paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round;
  }
  .joint text { font-weight: 500; font-size: 10.5px; fill: var(--ink-2); }

  .callouts { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 5; }
  .raster { position: absolute; left: 0; top: 0; pointer-events: none; opacity: 0.92; }
  .map.picking svg { cursor: crosshair; }
  .leaders { position: absolute; inset: 0; overflow: visible; }
  .leader, .leader-halo { fill: none; stroke-linejoin: round; stroke-linecap: round; }
  .leader-halo { stroke: var(--surface); stroke-width: 4; stroke-opacity: 0.85; }
  .leader { stroke: var(--ink); stroke-width: 1.3; }
  .leader.hot { stroke-width: 2.2; }
  .leader.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 0.45s ease-out forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .leader-dot { fill: var(--ink); stroke: var(--surface); stroke-width: 1.5; }
  .focus-ring { fill: none; stroke: var(--ink); stroke-width: 2; }
  .rel-line { fill: none; stroke: var(--ink-2); stroke-width: 1.1; stroke-dasharray: 4 3; opacity: 0.75; }
  .rel-line.hot { stroke: var(--ink); stroke-width: 2; stroke-dasharray: none; opacity: 1; }
  .rel-dot { fill: var(--surface); stroke: var(--ink-2); stroke-width: 1.6; }
  .rel-dot.hot { stroke: var(--ink); stroke-width: 2.4; }
  .callout { position: absolute; pointer-events: auto; }
  .callout.open :global(.nc) { overflow-x: hidden; }
  .zoom { position: absolute; right: 8px; bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
  .zbtn {
    width: 40px; height: 40px; display: grid; place-items: center;
    border: 1px solid var(--line-strong); border-radius: 8px;
    background: color-mix(in oklab, var(--surface) 92%, transparent);
    backdrop-filter: blur(6px);
  }
  .zbtn:hover:not(:disabled) { border-color: var(--ink-2); }
  .zbtn:disabled { opacity: 0.4; cursor: default; }
  .card {
    position: absolute; left: 8px; right: 56px; bottom: 8px; z-index: 20;
    background: var(--surface); border: 1px solid var(--line-strong);
    border-radius: var(--radius); box-shadow: var(--shadow);
    padding: 12px 44px 12px 14px;
  }
  .close {
    position: absolute; top: 4px; right: 4px; width: 40px; height: 40px;
    border: 0; background: none; border-radius: 8px; display: grid; place-items: center; color: var(--ink-2);
  }
  @media (forced-colors: active) {
    .pref-borders { stroke: CanvasText; }
    .focus, .sel-a { stroke: Highlight; }
    .site .dot { fill: Highlight; }
  }
</style>
