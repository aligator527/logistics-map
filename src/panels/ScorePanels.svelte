<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import BarList from '../components/BarList.svelte';
  import WeightPanel from '../components/WeightPanel.svelte';
  import ScoreBreakdown from '../components/ScoreBreakdown.svelte';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const sc = $derived(s.sc!), msc = $derived(s.msc), scv = $derived(s.scv), view = $derived(s.view!), muniLevel = $derived(s.muniLevel);
  const { pname, muniLabel, onpick } = s;
</script>

{#if app.layer === 'score'}
  <section class="panel">
    <div class="head-row">
      <p class="eyebrow">{tt('weights')}</p>
      {#if app.preset !== 'balanced'}<button type="button" class="linkish" onclick={() => { app.preset = 'balanced'; app.weights = {}; }}>{tt('resetWeights')}</button>{/if}
    </div>
    <WeightPanel criteria={scv!.criteria} weights={scv!.weights} lang={L} onweight={(k, v) => scv!.setWeight(k, v)} />
    <p class="src note">{tt('scoreCaveat')}{#if muniLevel} {tt('inheritedNote')}{/if} <a href="#method" onclick={() => { const d = document.getElementById('method') as HTMLDetailsElement | null; if (d) d.open = true; }}>{tt('method')}</a></p>
  </section>
  {#if muniLevel && msc && app.muni && msc.indexOf(app.muni) >= 0}
    <section class="panel">
      <p class="eyebrow">{tt('breakdown')} · {muniLabel(app.muni)}</p>
      <ScoreBreakdown criteria={msc.criteria} parts={msc.result.parts} weights={msc.weights} code={msc.indexOf(app.muni) + 1} lang={L} />
    </section>
  {:else if !muniLevel && p}
    <section class="panel">
      <p class="eyebrow">{tt('breakdown')} · {pname(p)}</p>
      <ScoreBreakdown criteria={sc.criteria} parts={sc.result.parts} weights={sc.weights} code={p} lang={L} />
    </section>
  {/if}
  {#if muniLevel && msc}
    {@const inPref = msc.codes.map((c, i) => ({ c, i, v: msc!.result.total[i] })).filter((x) => isFinite(x.v) && (!p || Number(x.c.slice(0, 2)) === p))
      .sort((a, b) => b.v - a.v).slice(0, 10)}
    <section class="panel">
      <p class="eyebrow">{tt('topMunis')}{p ? ` · ${pname(p)}` : ''}</p>
      <BarList bars={inPref.map((x) => ({ key: x.c, label: muniLabel(x.c), value: view.fmt(x.v), pct: x.v, onclick: () => onpick(x.c) }))} />
    </section>
  {/if}
{/if}
