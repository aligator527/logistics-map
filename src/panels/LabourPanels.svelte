<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtPct } from '../lib/scale';
  import BarList from '../components/BarList.svelte';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const jobs = $derived(s.jobs!);
</script>

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
