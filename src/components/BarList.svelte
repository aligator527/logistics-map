<script lang="ts" module>
  export interface Bar { key: string; label: string; value: string; pct: number; neg?: boolean; onclick?: () => void }
</script>

<script lang="ts">
  let { bars, ranked = true }: { bars: Bar[]; ranked?: boolean } = $props();
</script>

<ol class="bars">
  {#each bars as r, i (r.key)}
    <li>
      <svelte:element this={r.onclick ? 'button' : 'div'} type={r.onclick ? 'button' : undefined} class="row" class:ranked
                      onclick={r.onclick} role={r.onclick ? undefined : 'group'}>
        {#if ranked}<span class="rk tnum">{i + 1}</span>{/if}
        <span class="nm">{r.label}</span>
        <span class="track" aria-hidden="true"><span class="fill" class:neg={r.neg} style:width="{Math.max(0, Math.min(100, r.pct))}%"></span></span>
        <span class="v tnum">{r.value}</span>
      </svelte:element>
    </li>
  {/each}
</ol>

<style>
  .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .row {
    width: 100%; border: 0; background: none; padding: 5px 4px; border-radius: 6px; min-height: 36px;
    display: grid; grid-template-columns: minmax(64px, auto) 1fr auto; gap: 8px; align-items: center; text-align: left; font-size: 13px;
  }
  .row.ranked { grid-template-columns: 20px minmax(64px, auto) 1fr auto; }
  button.row:hover { background: var(--surface-2); }
  .rk { color: var(--muted); font-size: 12px; text-align: right; }
  .track { height: 8px; background: var(--surface-2); border-radius: 0 3px 3px 0; overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--blue); border-radius: 0 3px 3px 0; }
  .fill.neg { background: var(--clay); }
  .v { font-size: 12.5px; color: var(--ink-2); }
</style>
