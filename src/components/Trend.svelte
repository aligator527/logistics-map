<script lang="ts">
  import type { Period } from './TimeControl.svelte';
  import { fmtCompact } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';

  export interface Series { key: string; label: string; kind: 'main' | 'a' | 'b'; values: number[] }

  let { series, quarters, q, lang, label, format, tick = (v: number) => fmtCompact(lang, v), xticks, dots = false, onselect }: {
    series: Series[];
    quarters: Period[];
    /** x-axis labels; default: every 3rd (5th when narrow) year at its Q1 */
    xticks?: { i: number; label: string }[];
    /** draw a dot on every point (few periods) */
    dots?: boolean;
    q: number;
    lang: Lang;
    label: string;
    format: (v: number) => string;
    tick?: (v: number) => string;
    onselect: (q: number) => void;
  } = $props();

  let width = $state(360);
  const height = 150;
  const m = { top: 12, right: 12, bottom: 22, left: 44 };

  const all = $derived(series.flatMap((s) => s.values).filter((v) => isFinite(v)));
  const lo = $derived(Math.min(0, ...all));
  const hi = $derived(Math.max(0, ...all));
  function niceStep(span: number) {
    const raw = span / 3, p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    for (const s of [1, 2, 2.5, 5, 10]) if (s * p >= raw) return s * p;
    return 10 * p;
  }
  const step = $derived(niceStep(hi - lo || 1));
  const y0 = $derived(Math.floor(lo / step) * step);
  const y1 = $derived(Math.max(Math.ceil(hi / step) * step, y0 + step));
  const ticks = $derived(Array.from({ length: Math.round((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step));

  const n = $derived(quarters.length);
  const sx = (i: number) => m.left + (i / Math.max(1, n - 1)) * (width - m.left - m.right);
  const sy = (v: number) => m.top + (1 - (v - y0) / (y1 - y0)) * (height - m.top - m.bottom);

  function line(values: number[]) {
    let d = '', pen = false;
    values.forEach((v, i) => {
      if (!isFinite(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }
  const years = $derived(xticks ?? quarters.map((x, i) => ({ i, label: x.id.slice(0, 4), q1: x.id.endsWith('Q1') }))
    .filter((x) => x.q1 && Number(x.label) % (width < 420 ? 5 : 3) === 0));

  let hoverI = $state<number | null>(null);
  function nearest(clientX: number, el: SVGSVGElement) {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * width;
    return Math.max(0, Math.min(n - 1, Math.round(((px - m.left) / (width - m.left - m.right)) * (n - 1))));
  }
  function onkeydown(e: KeyboardEvent) {
    let j = q;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') j = Math.max(0, q - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') j = Math.min(n - 1, q + 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    else return;
    e.preventDefault();
    if (j !== q) onselect(j);
  }
  const at = $derived(hoverI ?? q);
  const qLabel = (i: number) => (lang === 'ja' ? quarters[i].ja : quarters[i].en);
</script>

<div class="trend" bind:clientWidth={width}>
  <div class="head">
    <p class="eyebrow">{label}</p>
    <p class="read tnum" aria-live="polite">
      <span>{qLabel(at)}</span>
      {#each series as s (s.key)}
        <span class="val {s.kind}">
          {#if s.kind !== 'main'}<span class="ab {s.kind === 'b' ? 'b' : ''}">{s.kind.toUpperCase()}</span>{/if}
          <strong>{format(s.values[at])}</strong>
        </span>
      {/each}
    </p>
  </div>
  <svg
    viewBox="0 0 {width} {height}"
    {width}
    {height}
    role="slider"
    tabindex="0"
    aria-label={`${label} — ${t(lang, 'period')}`}
    aria-valuemin={0}
    aria-valuemax={n - 1}
    aria-valuenow={q}
    aria-valuetext={qLabel(q)}
    onpointermove={(e) => (hoverI = nearest(e.clientX, e.currentTarget))}
    onpointerleave={() => (hoverI = null)}
    onclick={(e) => onselect(nearest(e.clientX, e.currentTarget))}
    {onkeydown}
  >
    {#each ticks as tv (tv)}
      <line class="grid" class:zero={tv === 0} x1={m.left} x2={width - m.right} y1={sy(tv)} y2={sy(tv)} />
      <text class="ytick tnum" x={m.left - 8} y={sy(tv)} dy="0.32em" text-anchor="end">{tick(tv)}</text>
    {/each}
    {#each years as yr (yr.i)}
      <text class="xtick tnum" x={sx(yr.i)} y={height - 5} text-anchor={yr.i === 0 ? 'start' : yr.i === n - 1 ? 'end' : 'middle'}>{yr.label}</text>
    {/each}
    <line class="cur" x1={sx(q)} x2={sx(q)} y1={m.top} y2={height - m.bottom} />
    {#if hoverI !== null}
      <line class="cross" x1={sx(hoverI)} x2={sx(hoverI)} y1={m.top} y2={height - m.bottom} />
    {/if}
    {#each series as s (s.key)}
      <path class="line {s.kind}" d={line(s.values)} />
      {#if dots}
        {#each s.values as v, i (i)}
          {#if isFinite(v)}<circle class="pt {s.kind}" cx={sx(i)} cy={sy(v)} r="2.5" />{/if}
        {/each}
      {/if}
      {#if isFinite(s.values[at])}
        <circle class="dot {s.kind}" cx={sx(at)} cy={sy(s.values[at])} r="4" />
      {/if}
    {/each}
  </svg>
</div>

<style>
  .trend { width: 100%; min-width: 0; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .head .eyebrow { margin: 0; }
  .read { margin: 0; display: flex; gap: 10px; align-items: baseline; font-size: 12.5px; color: var(--ink-2); flex-wrap: wrap; }
  .val { display: inline-flex; gap: 5px; align-items: center; }
  .read strong { font-size: 14px; color: var(--ink); font-weight: 600; }
  svg { display: block; overflow: visible; cursor: pointer; margin-top: 6px; touch-action: pan-y; }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 6px; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .grid.zero { stroke: var(--line-strong); }
  .ytick, .xtick { fill: var(--muted); font-size: 11px; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .line.main { stroke: var(--blue); }
  .line.a { stroke: var(--sel-a); }
  .line.b { stroke: var(--sel-b); stroke-dasharray: 5 3; }
  .dot { stroke: var(--surface); stroke-width: 2; }
  .dot.main { fill: var(--blue); }
  .dot.a { fill: var(--sel-a); }
  .dot.b { fill: var(--sel-b); }
  .pt { stroke: none; }
  .pt.main { fill: var(--blue); }
  .pt.a { fill: var(--sel-a); }
  .pt.b { fill: var(--sel-b); }
  .cur { stroke: var(--line-strong); stroke-width: 1; stroke-dasharray: 2 2; }
  .cross { stroke: var(--ink-2); stroke-width: 1; }
</style>
