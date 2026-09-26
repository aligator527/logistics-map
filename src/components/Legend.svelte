<script lang="ts">
  import type { Classes } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';

  let { classes, lang, title, fmt: f, hint, showDpl, showRoads, compare, flows = null, hubs = [], highlight = $bindable(null) }: {
    classes: Classes;
    lang: Lang;
    title: string;
    /** break label */
    fmt: (v: number) => string;
    hint: string;
    showDpl: boolean;
    showRoads: boolean;
    compare: boolean;
    /** flow arcs on the map: out/in of a prefecture, or the largest flows */
    flows?: 'focus' | 'all' | null;
    /** kinds of freight hubs on the map */
    hubs?: ('air' | 'port' | 'rail')[];
    highlight?: number | null;
  } = $props();
  function range(i: number): string {
    const b = classes.breaks;
    if (i === 0) return `< ${f(b[0])}`;
    if (i === b.length) return `≥ ${f(b[b.length - 1])}`;
    return `${f(b[i - 1])} – ${f(b[i])}`;
  }
</script>

<div class="legend">
  <p class="title">{title}</p>
  {#if classes.breaks.length}
    <ol class="steps" aria-label={title} onpointerleave={() => (highlight = null)}>
      {#each classes.colors as c, i (i)}
        <li>
          <button
            type="button"
            class="sw"
            style:background={c}
            aria-label={range(i)}
            title={range(i)}
            aria-pressed={highlight === i}
            onpointerenter={() => (highlight = i)}
            onfocus={() => (highlight = i)}
            onblur={() => (highlight = null)}
            onclick={() => (highlight = highlight === i ? null : i)}
          ></button>
          {#if i < classes.breaks.length}
            <span class="tick tnum">{f(classes.breaks[i])}</span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
  <p class="hint">{hint}</p>
  <ul class="keys">
    {#if flows === 'focus'}
      <li><svg width="26" height="10" aria-hidden="true"><path d="M1 5h18" class="k-flow out" /><path d="M25 5l-7 -4v8z" class="k-head out" /></svg>{t(lang, 'flowOut')}</li>
      <li><svg width="26" height="10" aria-hidden="true"><path d="M1 5h18" class="k-flow in" /><path d="M25 5l-7 -4v8z" class="k-head in" /></svg>{t(lang, 'flowIn')}</li>
    {:else if flows === 'all'}
      <li><svg width="26" height="10" aria-hidden="true"><path d="M1 5h18" class="k-flow" /><path d="M25 5l-7 -4v8z" class="k-head" /></svg>{t(lang, 'flowAll')}</li>
    {/if}
    {#if showDpl}
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" class="k-built" /></svg>{t(lang, 'layerDpl')} · {t(lang, 'operating')}</li>
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" class="k-pipe-o" /><circle cx="7" cy="7" r="3" class="k-pipe-i" /></svg>{t(lang, 'pipeline')}</li>
    {/if}
    {#if showRoads}
      <li><svg width="22" height="10" aria-hidden="true"><path d="M1 5h20" class="k-road" /></svg>{t(lang, 'expressway')}</li>
      <li><svg width="22" height="10" aria-hidden="true"><path d="M1 5h20" class="k-road k-urban" /></svg>{t(lang, 'urban')}</li>
      <li><svg width="12" height="12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1" class="k-ic" /></svg>{t(lang, 'ic')}</li>
    {/if}
    {#if hubs.includes('air')}<li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" class="k-hub" /></svg>{t(lang, 'hubAir')}</li>{/if}
    {#if hubs.includes('port')}<li><svg width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="3" class="k-hub" /></svg>{t(lang, 'hubPort')}</li>{/if}
    {#if hubs.includes('rail')}<li><svg width="14" height="12" aria-hidden="true"><rect x="1.5" y="2.5" width="11" height="7" rx="1.5" class="k-hub" /></svg>{t(lang, 'hubRail')}</li>{/if}
    {#if hubs.length}<li class="muted">{t(lang, 'hubSizeNote')}</li>{/if}
    {#if compare}
      <li><span class="ab">A</span><span class="ab b">B</span>{t(lang, 'compare')}</li>
    {/if}
  </ul>
</div>

<style>
  .legend { display: grid; gap: 6px; font-size: 12px; color: var(--ink-2); }
  .title { margin: 0; font-weight: 600; color: var(--ink); font-size: 12.5px; }
  .steps {
    list-style: none; margin: 0; padding: 0 0 16px;
    display: grid; grid-auto-flow: column; grid-auto-columns: minmax(30px, 46px); gap: 2px;
  }
  li { position: relative; }
  .sw { display: block; width: 100%; height: 12px; border: 0; padding: 0; border-radius: 0; }
  .steps li:first-child .sw { border-radius: 3px 0 0 3px; }
  .steps li:last-child .sw { border-radius: 0 3px 3px 0; }
  .sw[aria-pressed='true'] { outline: 2px solid var(--ink); outline-offset: 1px; }
  .tick { position: absolute; top: 15px; right: 0; transform: translateX(50%); font-size: 11px; color: var(--muted); white-space: nowrap; }
  .hint { margin: 0; color: var(--muted); font-size: 11.5px; }
  .keys { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .keys li { display: inline-flex; align-items: center; gap: 6px; }
  .k-flow { stroke: var(--flow-all); stroke-width: 3; fill: none; }
  .k-head { fill: var(--flow-all); }
  .k-flow.out { stroke: var(--flow-out); } .k-head.out { fill: var(--flow-out); }
  .k-flow.in { stroke: var(--flow-in); } .k-head.in { fill: var(--flow-in); }
  .k-hub { fill: var(--surface); stroke: var(--hub); stroke-width: 1.6; }
  .muted { color: var(--muted); }
  .k-built { fill: var(--mark); stroke: var(--mark-ring); stroke-width: 1.5; }
  .k-pipe-o { fill: var(--surface); stroke: var(--mark-ring); stroke-width: 1.1; }
  .k-pipe-i { fill: none; stroke: var(--mark); stroke-width: 2; }
  .k-road { stroke: var(--road); stroke-width: 1.6; fill: none; }
  .k-urban { stroke-dasharray: 3 2; stroke-width: 1.2; }
  .k-ic { fill: var(--surface); stroke: var(--road); stroke-width: 1.4; }
  .ab + .ab { margin-left: -2px; }
</style>
