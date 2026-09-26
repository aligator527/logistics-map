<script lang="ts">
  // 立地シミュレーション: where would N new sites reach the most people? (greedy maximum coverage in a worker)
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtCompact, fmtMinutes, fmtNum, fmtPct } from '../lib/scale';
  import { shortlist } from '../lib/shortlist.svelte';
  import type { SimRequest, SimResult } from '../lib/sim.worker';
  import Segmented from '../components/Segmented.svelte';
  import { costs, estimate } from '../lib/costs.svelte';
  import { VEHICLES } from '../lib/fares';
  import { userData, demandArray } from '../lib/userdata.svelte';

  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const lt = $derived(s.lt), muni = $derived(s.muni);

  let n = $state(3);
  let minutes = $state(120);
  let existing = $state<'none' | 'dpl' | 'short'>('none');
  let needZone = $state(true);
  let avoidFlood = $state(true);
  let inPref = $state(false);
  let onlyScreened = $state(false);
  let mode = $state<'coverage' | 'cost'>('coverage');
  let simOpen = $state(false);
  /** coverage of the user's own demand instead of residents */
  let coverUser = $state(false);
  /** land bought: its price counted each year at this rate (%) */
  let landRate = $state(5);
  let running = $state(false);
  let progress = $state(0);
  let result = $state.raw<SimResult | null>(null);

  function candidates() {
    const m = muni!.m;
    return muni!.codes.map((c, i) => i).filter((i) => {
      if (needZone && !((m.zone[i] ?? 0) >= 20)) return false;
      if (avoidFlood && (m.hz_flood?.[i] ?? 0) >= 50) return false;
      if (inPref && app.pref && Number(muni!.codes[i].slice(0, 2)) !== app.pref) return false;
      if (onlyScreened && s.screened && !s.screened.keep.has(muni!.codes[i])) return false;
      return (m.pop[i] ?? 0) > 0;
    });
  }
  function run() {
    if (!lt?.router || !muni) return;
    running = true; progress = 0; result = null;
    const fixed = existing === 'dpl' ? lt.originPlaces('net:dpl') : existing === 'short' ? lt.originPlaces('net:short') : [];
    const w = new Worker(new URL('../lib/sim.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ progress?: number; result?: SimResult }>) => {
      if (e.data.progress !== undefined) progress = e.data.progress;
      if (e.data.result) {
        result = e.data.result; running = false; w.terminate(); simOpen = true;
        const r = e.data.result, upto = r.best !== undefined && r.best >= 0 ? r.best + 1 : r.picks.length;
        lt.simPicks = r.picks.slice(0, upto).map((p) => p.i);
      }
    };
    w.onerror = () => { running = false; w.terminate(); };
    const cand = candidates(), ci = costs.inputs;
    const demand = demandArray(ci.demand);
    const req: SimRequest = { net: lt.router.net, pop: coverUser && userData.perMuni ? userData.perMuni : muni.m.pop.map((v) => v ?? 0), candidates: cand, fixed: JSON.parse(JSON.stringify(fixed)), minutes, n,
      // ferry fares are not in the table: across the sea, demand needs its own site in cost mode
      ferries: mode === 'cost' ? false : app.ferries, peak: app.peak, closed: [...lt.closedEdges], mode,
      cost: mode === 'cost' ? {
        demand, runs: ci.runs * ci.days, vehicle: ci.vehicle, prefOf: muni.codes.map((c) => Number(c.slice(0, 2))),
        fixedYen: cand.map((i) => { const e = estimate(i, ci); return e ? (isFinite(e.land) ? e.land * landRate / 100 : 0) + (isFinite(e.staff) ? e.staff : 0) : 0; }),
      } : undefined };
    w.postMessage(req);
  }
  const count = $derived(muni && lt ? candidates().length : 0);
</script>

{#if lt && muni}
  <section class="panel">
    <details class="sim" bind:open={simOpen}>
      <summary class="eyebrow">{tt('simTitle')}</summary>
      <p class="src">{tt(mode === 'cost' ? 'simIntroCost' : 'simIntro')}</p>
      <div class="reach-ctl">
        <Segmented label={tt('simMode')} value={mode}
                   options={[{ value: 'coverage', label: tt('simCoverage') }, { value: 'cost', label: tt('simCost') }] as { value: 'coverage' | 'cost'; label: string }[]}
                   onchange={(v) => { mode = v; result = null; }} />
        <label class="row"><span class="small">{tt(mode === 'cost' ? 'simMaxSites' : 'simSites')}</span>
          <select class="sel" bind:value={n}>{#each [1, 2, 3, 4, 5, 6, 8, 10] as k (k)}<option value={k}>{k}</option>{/each}</select></label>
        {#if mode === 'cost'}
          <p class="src">{tt('simCostIntro').replace('{v}', VEHICLES.find((v) => v.key === costs.inputs.vehicle)?.[L] ?? '')
            .replace('{r}', fmtCompact(L, costs.inputs.runs * costs.inputs.days)).replace('{p}', fmtCompact(L, costs.inputs.plot)).replace('{s}', String(costs.inputs.staff))}</p>
          <label class="row"><span class="small">{tt('simLandRate')}</span>
            <input class="num" type="number" min="0" max="20" step="0.5" bind:value={landRate} /><span class="small">%</span></label>
        {:else}
        <Segmented label={tt('simWithin')} value={minutes}
                   options={[60, 120, 180].map((m) => ({ value: m, label: fmtMinutes(L, m) })).concat([{ value: 270, label: tt('trip1') }])}
                   onchange={(v) => (minutes = v)} />
        {/if}
        <Segmented label={tt('simExisting')} value={existing}
                   options={[{ value: 'none', label: tt('simNone') }, { value: 'dpl', label: tt('originDpl') }, { value: 'short', label: tt('originShort') }] as { value: 'none' | 'dpl' | 'short'; label: string }[]}
                   onchange={(v) => (existing = v)} />
        <label class="chk"><input type="checkbox" bind:checked={needZone} /> {tt('simNeedZone')}</label>
        <label class="chk"><input type="checkbox" bind:checked={avoidFlood} /> {tt('simAvoidFlood')}</label>
        {#if mode === 'coverage' && userData.perMuni}<label class="chk"><input type="checkbox" bind:checked={coverUser} /> {tt('simCoverUser')}</label>{/if}
        {#if app.pref}<label class="chk"><input type="checkbox" bind:checked={inPref} /> {tt('simInPref')}</label>{/if}
        {#if s.screened}<label class="chk"><input type="checkbox" bind:checked={onlyScreened} /> {tt('screenOnly')}（{s.screened.keep.size}）</label>{/if}
        <p class="src">{tt('simCandidates')}: {count}</p>
        <button type="button" class="btn" onclick={run} disabled={running || !lt.router || !count}>
          {running ? `${tt('simRunning')} ${Math.round(progress * 100)}%` : !lt.router ? tt('loadingNetwork') : tt('simRun')}</button>
      </div>
      {#if result && mode === 'cost'}
        {@const oku = (y: number) => (L === 'ja' ? `${fmtNum(L, y / 1e8, 1)}億円` : `¥${fmtNum(L, y / 1e6, 0)}m`)}
        <table class="steps">
          <thead><tr><th>{tt('simSitesN')}</th><th>{tt('simAdded')}</th><th>{tt('simTotal')}</th><th>{tt('trYearly')}</th><th>{tt('simFixed')}</th></tr></thead>
          <tbody>
            {#each result.picks as p, k (p.i)}
              <tr class:best={k === result.best}>
                <td class="tnum">{k + 1}{k === result.best ? ' ★' : ''}</td>
                <td><button type="button" class="linkish" onclick={() => s.onpick(muni.codes[p.i])}>{s.muniLabel(muni.codes[p.i])}</button></td>
                <td class="tnum">{oku(p.total)}</td><td class="tnum">{oku(p.transport ?? NaN)}</td><td class="tnum">{oku(p.fixedYen ?? NaN)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="src">{tt('simCostNote')}{#if result.baseTransport && isFinite(result.baseTransport)} {tt('simCostBase')} {oku(result.baseTransport)}.{/if}</p>
        <p class="memo"><button type="button" class="btn" onclick={() => { app.iso = 'net:sim'; app.lmet = 'iso'; }}>{tt('simShow')}</button></p>
      {:else if result}
        <ol class="picks">
          {#each result.picks as p, k (p.i)}
            <li><strong>{s.muniLabel(muni.codes[p.i])}</strong>
              <span class="small">＋{fmtCompact(L, p.gain)}{L === 'ja' ? '人' : ''} · {tt('simCumulative')} {fmtPct(L, (p.total / result.all) * 100, 0)}</span>
              <button type="button" class="linkish" onclick={() => s.onpick(muni.codes[p.i])}>{tt('showPlace')}</button></li>
          {/each}
        </ol>
        <p class="src">{result.base ? `${tt('simBase')} ${fmtPct(L, (result.base / result.all) * 100, 0)} · ` : ''}{tt('simNote')}</p>
        <p class="memo"><button type="button" class="btn" onclick={() => { app.iso = 'net:sim'; app.lmet = minutes === 270 ? 'shift' : 'iso'; }}>{tt('simShow')}</button></p>
      {/if}
    </details>
  </section>
{/if}

<style>
  .sim summary { cursor: pointer; min-height: 32px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .picks { margin: 10px 0 6px; padding-left: 20px; display: grid; gap: 6px; font-size: 13px; }
  .picks li span { display: block; }
  .num { width: 70px; min-height: 30px; }
  .steps { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 10px 0 6px; }
  .steps th, .steps td { padding: 4px 3px; border-bottom: 1px solid var(--line); text-align: right; }
  .steps th:nth-child(2), .steps td:nth-child(2) { text-align: left; }
  .steps thead th { font-size: 11px; color: var(--muted); font-weight: 500; }
  .steps tr.best td { background: var(--accent-soft); font-weight: 600; }
</style>
