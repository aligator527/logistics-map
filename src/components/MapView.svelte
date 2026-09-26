<script lang="ts">
  import { onMount } from 'svelte';
  import { select } from 'd3-selection';
  import 'd3-transition';
  import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
  import type { GeoData, Shape } from '../lib/geo';
  import type { Roads } from '../lib/data';
  import { classOf, type Classes } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';
  import Tooltip, { type Tip } from './Tooltip.svelte';

  export interface Marker { i: number; xy: [number, number]; built: boolean; label: string }
  /** freight hub (airport / port / rail station): r = marker radius in screen px */
  export interface Poi {
    key: string; kind: 'air' | 'port' | 'rail' | 'quake' | 'typhoon' | 'news' | 'origin'; xy: [number, number]; r: number; label: string; major: boolean; tip: Tip;
    /** fill (earthquake intensity) and text inside the marker (intensity, news count) */
    color?: string; badge?: string; ink?: string;
    /** click: select this prefecture / municipality */
    code?: string;
  }
  /** flow arc between two anchors (viewBox units); w = stroke width in screen px */
  export interface Flow { key: string; o: [number, number]; d: [number, number]; w: number; kind: 'out' | 'in' | 'all'; tip: Tip }

  let { geo, values, classes, lang, focus, a = 0, b = 0, compare = false, highlight = null,
        markers = [], site = -1, roads = null, showRoads = true, flows = [], mutedMarkers = false, zoomFocus = true, level = 'pref', selMuni = null, rings = [], pois = [], muniA = null, muniB = null, tracks = [],
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
        if (e.type === 'wheel') return (e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey;
        if (e.type === 'touchstart') return (e as TouchEvent).touches.length > 1 || transform.k > 1.01;
        if (e.type === 'dblclick') return false;
        return !(e as MouseEvent).button;
      })
      .on('zoom', (e) => { transform = e.transform; hover = null; });
    select(svg).call(zb).on('dblclick.zoom', null);
    ready = true;
    return () => { select(svg).on('.zoom', null); };
  });

  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function go(target: ZoomTransform, ms = 550) {
    const sel = select(svg);
    if (reduce()) sel.call(zb.transform, target);
    else sel.transition().duration(ms).call(zb.transform as never, target);
  }
  function frame(bbox: Shape['bbox'], maxK = 30) {
    const [[x0, y0], [x1, y1]] = bbox;
    const k = Math.max(1, Math.min(maxK, 0.85 / Math.max((x1 - x0) / geo.width, (y1 - y0) / geo.height)));
    go(zoomIdentity.translate(geo.width / 2 - k * (x0 + x1) / 2, geo.height / 2 - k * (y0 + y1) / 2).scale(k));
  }
  function frameAB() {
    const boxes = [a, b].filter(Boolean).map((c) => geo.prefFrame.get(pad2(c))!).filter(Boolean);
    if (!boxes.length) return go(zoomIdentity);
    frame([[Math.min(...boxes.map((x) => x[0][0])), Math.min(...boxes.map((x) => x[0][1]))],
           [Math.max(...boxes.map((x) => x[1][0])), Math.max(...boxes.map((x) => x[1][1]))]], 8);
  }

  $effect(() => {
    if (!ready) return;
    if (compare) { void a; void b; if (zoomFocus) frameAB(); else go(zoomIdentity, 400); return; }
    if (focus && zoomFocus) { const bb = geo.prefFrame.get(focus); if (bb) frame(bb); }
    else go(zoomIdentity, 400);
  });

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
  function onpointermove(e: PointerEvent) {
    if (e.pointerType === 'touch' || !wrap) return;
    const tg = target(e);
    const res = tg && tipFor(tg);
    hover = res ? { ...res, ...local(e) } : null;
    hoverFlow = tg?.flow ?? null;
  }
  let down: { x: number; y: number } | null = null;
  function onpointerdown(e: PointerEvent) { down = { x: e.clientX, y: e.clientY }; }
  function onclick(e: MouseEvent) {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // ended a drag
    const touch = (e as PointerEvent).pointerType === 'touch';
    const tg = target(e);
    if (!tg) { pinned = null; if (!compare) onclear(); return; }
    if (tg.site !== null) { onsite(tg.site); pinned = touch ? siteTip(tg.site) : null; return; }
    if (tg.flow !== null) { pinned = touch && flows[tg.flow] ? flows[tg.flow].tip : null; return; }
    if (tg.poi !== null) {
      const h = pois[tg.poi];
      if (h?.code) onpick(h.code);
      pinned = touch && h ? h.tip : null;
      return;
    }
    if (tg.joint !== null) { const r = tipFor(tg); pinned = touch && r ? r.tip : null; return; }
    if (tg.muni) { const r = tipFor(tg); pinned = touch && r ? r.tip : null; return; }
    if (tg.code) { onpick(tg.code); pinned = touch ? prefTip(tg.code) : null; }
  }

  // Roving focus over prefectures (arrow keys), Enter selects, Escape goes back to Japan.
  let kbd = $state<string | null>(null);
  function onkeydown(e: KeyboardEvent) {
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
</script>

<div class="map" bind:this={wrap}>
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
    {onclick}
    {onkeydown}
    onblur={() => { kbd = null; hover = null; }}
  >
    <defs>
      <pattern id="pat-nodata" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--land)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--hatch)" stroke-width="1.4" />
      </pattern>
    </defs>

    <g transform={transform.toString()}>
      {#each geo.insets as f (f.key)}
        <rect class="inset" x={f.x} y={f.y} width={f.w} height={f.h} rx="4" />
      {/each}

      <g class="areas" class:muni={level === 'muni'}>
        {#each areaShapes as s (s.code)}
          <path d={s.d} data-code={s.code} fill={fill(s.code)} class:dim={dimmed(s.code)}
                class:faded={level === 'pref' && !!focus && !compare && s.code !== focus} />
        {/each}
      </g>
      <path class="pref-borders" class:strong={level === 'muni'} d={geo.prefBorders} />

      {#if focusMunis.length}
        <g class="munis">
          {#each focusMunis as m (m.code)}
            <path d={m.d} data-muni={m.code} />
          {/each}
        </g>
        <path class="muni-borders" d={geo.muniBorders(focus!)} />
      {/if}

      {#if roads && showRoads}
        <g class="roads" class:far={transform.k < 2} aria-hidden="true">
          <path class="halo" d={roads.d[1] + roads.d[2] + roads.d[3]} />
          <path class="r3" d={roads.d[3]} />
          <path class="r2" d={roads.d[2]} />
          <path class="r1" d={roads.d[1]} />
        </g>
      {/if}

      {#each rings as g (g.label)}
        <circle class="ring" cx={g.xy[0]} cy={g.xy[1]} r={g.r} />
      {/each}
      {#each tracks as tr (tr.key)}
        <path class="track {tr.kind}" d={tr.d} />
      {/each}
      {#if hoverShape}
        <path class="hover" d={hoverShape.d} />
      {/if}
      {#if focusShape && !compare}
        <path class="focus" class:thin={level === 'muni'} d={focusShape.d} />
      {/if}
      {#if selMuniShape}
        <path class="focus sel-muni" d={selMuniShape.d} />
      {/if}
      {#if muniB && muniByCode.get(muniB)}<path class="sel-b" d={muniByCode.get(muniB)!.d} />{/if}
      {#if muniA && muniByCode.get(muniA)}<path class="sel-a" d={muniByCode.get(muniA)!.d} />{/if}
      {#if compare}
        {#if b && prefByCode.get(pad2(b))}<path class="sel-b" d={prefByCode.get(pad2(b))!.d} />{/if}
        {#if a && prefByCode.get(pad2(a))}<path class="sel-a" d={prefByCode.get(pad2(a))!.d} />{/if}
      {/if}
      {#if kbd && prefByCode.get(kbd)}
        <path class="kbd" d={prefByCode.get(kbd)!.d} />
      {/if}
    </g>
  </svg>

  <!-- Point layers live outside the zoom group so they keep their size on screen.
       Keyboard access to DPL sites is through the site list in the side panel. -->
  <svg class="overlay" viewBox="0 0 {geo.width} {geo.height}" aria-hidden="true"
       bind:clientWidth={boxW} bind:clientHeight={boxH}
       {onpointermove} onpointerleave={() => { hover = null; hoverFlow = null; }} {onpointerdown} {onclick}>
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
        <circle class="hit" r={Math.max(9, h.r + 3)} />
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
        {:else if h.kind === 'origin'}
          <circle class="org" r={h.r} />
          <circle class="org-c" r={h.r * 0.38} />
        {:else}
          <rect class="nw" x={-h.r - 3} y={-h.r} width={2 * h.r + 6} height={2 * h.r} rx={h.r} />
          <text class="nw-t" text-anchor="middle" dy="0.35em">{h.badge}</text>
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
  </svg>

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

  <div class="zoom" role="group" aria-label="Zoom">
    <button type="button" class="zbtn" aria-label={t(lang, 'zoomIn')} title={t(lang, 'zoomIn')} onclick={() => zoomBy(1.8)}>
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
  .nw-t { font-size: 10.5px; font-weight: 700; fill: var(--bg); stroke: none; pointer-events: none; }
  .overlay .poi.news text.nw-t, .overlay .poi.quake text.qk-t { paint-order: normal; stroke: none; }
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
