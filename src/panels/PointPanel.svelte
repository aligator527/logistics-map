<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtNum } from '../lib/scale';
  import { groundRisk } from '../lib/pointinfo';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const i = $derived(s.inspect);
  const risk = $derived(i ? groundRisk(i) : null);
</script>

{#if s.inspectArmed || s.inspectLoading || i}
  <section class="panel point" aria-live="polite">
    <div class="head-row">
      <p class="eyebrow">{tt('pointInfo')}</p>
      {#if i}<button type="button" class="linkish" onclick={() => (s.inspect = null)}>{tt('close')}</button>{/if}
    </div>
    {#if s.inspectArmed}<p class="src">{tt('inspectHint')}</p>
    {:else if s.inspectLoading}<p class="src" role="status">…</p>
    {:else if i}
      <dl class="pi">
        <dt>{tt('elevation')}</dt><dd class="tnum">{i.elev !== null ? `${fmtNum(L, i.elev, 1)} m` : tt('noData')}{#if i.elevSrc}<span class="small">（{i.elevSrc}）</span>{/if}</dd>
        <dt>{tt('landformNatural')}</dt><dd>{i.natural ? i.natural[L] : tt('noData')}</dd>
        {#if i.artificial}<dt>{tt('landformArtificial')}</dt><dd>{i.artificial[L]}</dd>{/if}
        {#if risk}<dt>{tt('groundRisk')}</dt><dd><span class="risk {risk}">{tt(`risk_${risk}` as Key)}</span></dd>{/if}
        <dt>{L === 'ja' ? '緯度・経度' : 'Lat / lon'}</dt><dd class="tnum">{i.lat.toFixed(5)}, {i.lon.toFixed(5)}</dd>
      </dl>
      <p class="src note"><a href={i.gsiUrl} target="_blank" rel="noopener">{tt('openGsi')} ↗</a> · {tt('landformNote')}</p>
    {/if}
  </section>
{/if}

<style>
  .pi { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 13px; }
  .pi dt { color: var(--muted); }
  .pi dd { margin: 0; font-weight: 600; }
  .pi .small { font-weight: 400; }
  .risk { display: inline-block; padding: 0 6px; border-radius: 4px; border: 1px solid var(--line-strong); }
  .risk.high { border-color: var(--clay); color: var(--clay); }
  .risk.low { color: var(--ink-2); }
</style>
