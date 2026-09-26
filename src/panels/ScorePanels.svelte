<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import BarList from '../components/BarList.svelte';
  import WeightPanel from '../components/WeightPanel.svelte';
  import ScoreBreakdown from '../components/ScoreBreakdown.svelte';
  import type { Sensitivity } from '../lib/score';
  import { sensitivityAsync } from '../lib/offthread';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const sc = $derived(s.sc!), msc = $derived(s.msc), scv = $derived(s.scv), view = $derived(s.view!), muniLevel = $derived(s.muniLevel);
  /** rank stability of the active score, computed in a worker when the weights change */
  let sens = $state.raw<{ key: object; r: Sensitivity } | null>(null);
  let req = 0;
  $effect(() => {
    const th = scv;
    if (app.layer !== 'score' || !th) return;
    const parts = th.result.parts, weights = [...th.weights], id = ++req;
    sensitivityAsync(parts, weights).then((r) => { if (id === req) sens = { key: th, r }; });
  });
  const sensFor = (th: object | null) => (sens && sens.key === th ? sens.r : null);
  const { pname, muniLabel, onpick } = s;
</script>

{#snippet stability(sens: Sensitivity, i: number, n: number)}
  {#if i >= 0 && sens.lo[i]}
    <div class="stab">
      <p class="sub-eyebrow">{tt('stability')}</p>
      <div class="stab-bar" aria-hidden="true">
        <span class="range" style:left="{((sens.lo[i] - 1) / n) * 100}%" style:width="{Math.max(0.8, ((sens.hi[i] - sens.lo[i] + 1) / n) * 100)}%"></span>
      </div>
      <p class="stab-txt">
        {L === 'ja' ? `${sens.lo[i]}〜${sens.hi[i]}位（${n}中）` : `#${sens.lo[i]}–${sens.hi[i]} of ${n}`}
        · {tt('top10Share')} <strong class="tnum">{Math.round(sens.top10[i] * 100)}%</strong>
      </p>
      <p class="src">{tt('stabilityNote')}</p>
    </div>
  {/if}
{/snippet}

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
      {#if sensFor(msc)}{@render stability(sensFor(msc)!, msc.indexOf(app.muni), msc.codes.length)}{/if}
    </section>
  {:else if !muniLevel && p}
    <section class="panel">
      <p class="eyebrow">{tt('breakdown')} · {pname(p)}</p>
      <ScoreBreakdown criteria={sc.criteria} parts={sc.result.parts} weights={sc.weights} code={p} lang={L} />
      {#if sensFor(sc)}{@render stability(sensFor(sc)!, p - 1, 47)}{/if}
    </section>
  {/if}
  {#if muniLevel && msc}
    {@const inPref = msc.codes.map((c, i) => ({ c, i, v: msc!.result.total[i] })).filter((x) => isFinite(x.v) && (!p || Number(x.c.slice(0, 2)) === p))
      .sort((a, b) => b.v - a.v).slice(0, 10)}
    <section class="panel">
      <p class="eyebrow">{tt('topMunis')}{p ? ` · ${pname(p)}` : ''}</p>
      <BarList bars={inPref.map((x) => ({ key: x.c, label: `${muniLabel(x.c)}${!p && (sensFor(msc)?.top10[x.i] ?? 0) >= 0.8 ? ' ◆' : ''}`, value: view.fmt(x.v), pct: x.v, onclick: () => onpick(x.c) }))} />
      {#if !p}<p class="src note">◆ {tt('robustTop')}</p>{/if}
    </section>
  {/if}
{/if}
