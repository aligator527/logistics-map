<script lang="ts" module>
  export interface Tip {
    title: string;
    sub?: string;
    badge?: 'a' | 'b';
    big?: string;
    bigNote?: string;
    rows?: [string, string][];
    note?: string;
    source?: string;
    link?: { href: string; label: string };
    action?: { label: string; run: () => void };
  }
</script>

<script lang="ts">
  let { tip, x = 0, y = 0, bounds = null, pinned = false }: {
    tip: Tip;
    x?: number;
    y?: number;
    bounds?: HTMLElement | null;
    pinned?: boolean;
  } = $props();

  let w = $state(240), h = $state(120);

  // Flip to the other side of the pointer near the right/bottom edge.
  const pos = $derived.by(() => {
    const bw = bounds?.clientWidth ?? 1000, bh = bounds?.clientHeight ?? 800;
    const gap = 14;
    const left = x + gap + w > bw ? x - gap - w : x + gap;
    const top = y + gap + h > bh ? Math.max(0, y - gap - h) : y + gap;
    return { left: Math.max(0, left), top };
  });
</script>

<div
  class="tip"
  class:pinned
  bind:clientWidth={w}
  bind:clientHeight={h}
  style:left={pinned ? null : pos.left + 'px'}
  style:top={pinned ? null : pos.top + 'px'}
  role={pinned ? 'status' : 'tooltip'}
>
  <p class="name">
    {tip.title}
    {#if tip.badge}<span class="ab {tip.badge}" aria-label={tip.badge.toUpperCase()}>{tip.badge.toUpperCase()}</span>{/if}
  </p>
  {#if tip.sub}<p class="sub">{tip.sub}</p>{/if}
  {#if tip.big}
    <p class="big tnum">{tip.big}{#if tip.bigNote}<small>{tip.bigNote}</small>{/if}</p>
  {/if}
  {#if tip.rows?.length}
    <dl>
      {#each tip.rows as [k, v] (k)}
        <dt>{k}</dt><dd class="tnum">{v}</dd>
      {/each}
    </dl>
  {/if}
  {#if tip.note}<p class="note">{tip.note}</p>{/if}
  {#if tip.source}<p class="src">{tip.source}</p>{/if}
  {#if pinned && (tip.link || tip.action)}
    <p class="acts">
      {#if tip.action}<button type="button" class="btn" onclick={tip.action.run}>{tip.action.label}</button>{/if}
      {#if tip.link}<a class="btn" href={tip.link.href} target="_blank" rel="noopener">{tip.link.label} ↗</a>{/if}
    </p>
  {/if}
</div>

<style>
  .tip {
    position: absolute;
    z-index: 30;
    pointer-events: none;
    min-width: 200px;
    max-width: 300px;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    box-shadow: var(--shadow);
    font-size: 13px;
    line-height: 1.4;
  }
  .tip.pinned { position: static; box-shadow: none; border: 0; padding: 0; max-width: none; pointer-events: auto; }
  p { margin: 0; }
  .name { font-weight: 600; font-size: 14.5px; display: flex; align-items: center; gap: 8px; }
  .sub { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
  .big { font-size: 21px; font-weight: 600; letter-spacing: -0.01em; margin-top: 2px; }
  .big small { font-size: 12px; font-weight: 400; color: var(--muted); margin-left: 6px; letter-spacing: 0; }
  dl { display: grid; grid-template-columns: auto auto; gap: 2px 14px; margin: 6px 0 0; justify-content: start; }
  dt { color: var(--muted); }
  dd { margin: 0; text-align: right; }
  .note { color: var(--muted); font-size: 12px; margin-top: 6px; }
  .src { color: var(--muted); font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--line); }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .acts .btn { text-decoration: none; min-height: 40px; }
</style>
