<script lang="ts">
  import TermText from './TermText.svelte';
  import type { LocalMetric } from '../themes/local.svelte';
  import { t, type Lang } from '../lib/i18n';

  let { rows, lang, current, onmetric }: {
    rows: { m: LocalMetric; v: number; rank: number; n: number }[];
    lang: Lang;
    /** metric on the map */
    current: string;
    onmetric: (key: string) => void;
  } = $props();

  const groups = ['people', 'access', 'land', 'industry', 'labour', 'risk'] as const;
</script>

<div class="prof">
  {#each groups as g (g)}
    {@const items = rows.filter((r) => r.m.group === g)}
    {#if items.length}
      <p class="g">{t(lang, `lg_${g}`)}</p>
      <ul>
        {#each items as r (r.m.key)}
          {@const pos = r.rank && r.n ? 1 - (r.rank - 1) / Math.max(1, r.n - 1) : null}
          <li>
            <button type="button" class="row" aria-pressed={r.m.key === current} onclick={() => onmetric(r.m.key)}>
              <span class="nm"><TermText text={r.m[lang]} {lang} focusable={false} /></span>
              <span class="v tnum">{isFinite(r.v) ? r.m.fmt(r.v) : '–'}</span>
              {#if pos !== null && r.m.better}
                <span class="bar" aria-hidden="true"><span style:width="{pos * 100}%"></span></span>
                <span class="rk tnum">{r.rank}/{r.n}</span>
              {:else}
                <span class="bar none" aria-hidden="true"></span><span class="rk"></span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/each}
  <p class="note">{t(lang, 'rankHint')}</p>
</div>

<style>
  .prof { display: grid; gap: 4px; }
  .g { margin: 8px 0 2px; font-size: 12px; font-weight: 600; color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; }
  .row {
    width: 100%; border: 0; background: none; text-align: left; border-radius: 6px; padding: 5px 4px; min-height: 36px;
    display: grid; grid-template-columns: 1fr auto 70px 64px; gap: 8px; align-items: center; font-size: 12.5px;
  }
  .row:hover { background: var(--surface-2); }
  .row[aria-pressed='true'] { background: var(--accent-soft); }
  .v { font-weight: 600; text-align: right; }
  .bar { height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--blue); }
  .bar.none { background: none; }
  .rk { font-size: 11px; color: var(--muted); text-align: right; }
  .note { margin: 6px 0 0; font-size: 11.5px; color: var(--muted); }
</style>
