<script lang="ts">
  // 立地シミュレーション: where would N new sites reach the most people? (greedy maximum coverage in a worker)
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtCompact, fmtMinutes, fmtPct } from '../lib/scale';
  import { shortlist } from '../lib/shortlist.svelte';
  import type { SimRequest, SimResult } from '../lib/sim.worker';
  import Segmented from '../components/Segmented.svelte';

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
      if (e.data.result) { result = e.data.result; running = false; w.terminate(); lt.simPicks = e.data.result.picks.map((p) => p.i); }
    };
    w.onerror = () => { running = false; w.terminate(); };
    const req: SimRequest = { net: lt.router.net, pop: muni.m.pop.map((v) => v ?? 0), candidates: candidates(), fixed: JSON.parse(JSON.stringify(fixed)), minutes, n };
    w.postMessage(req);
  }
  const count = $derived(muni && lt ? candidates().length : 0);
</script>

{#if lt && muni}
  <section class="panel">
    <details class="sim" open={!!result}>
      <summary class="eyebrow">{tt('simTitle')}</summary>
      <p class="src">{tt('simIntro')}</p>
      <div class="reach-ctl">
        <label class="row"><span class="small">{tt('simSites')}</span>
          <select class="sel" bind:value={n}>{#each [1, 2, 3, 4, 5, 6, 8] as k (k)}<option value={k}>{k}</option>{/each}</select></label>
        <Segmented label={tt('simWithin')} value={minutes}
                   options={[60, 120, 180].map((m) => ({ value: m, label: fmtMinutes(L, m) })).concat([{ value: 270, label: tt('trip1') }])}
                   onchange={(v) => (minutes = v)} />
        <Segmented label={tt('simExisting')} value={existing}
                   options={[{ value: 'none', label: tt('simNone') }, { value: 'dpl', label: tt('originDpl') }, { value: 'short', label: tt('originShort') }] as { value: 'none' | 'dpl' | 'short'; label: string }[]}
                   onchange={(v) => (existing = v)} />
        <label class="chk"><input type="checkbox" bind:checked={needZone} /> {tt('simNeedZone')}</label>
        <label class="chk"><input type="checkbox" bind:checked={avoidFlood} /> {tt('simAvoidFlood')}</label>
        {#if app.pref}<label class="chk"><input type="checkbox" bind:checked={inPref} /> {tt('simInPref')}</label>{/if}
        {#if s.screened}<label class="chk"><input type="checkbox" bind:checked={onlyScreened} /> {tt('screenOnly')}（{s.screened.keep.size}）</label>{/if}
        <p class="src">{tt('simCandidates')}: {count}</p>
        <button type="button" class="btn" onclick={run} disabled={running || !lt.router || !count}>
          {running ? `${tt('simRunning')} ${Math.round(progress * 100)}%` : !lt.router ? tt('loadingNetwork') : tt('simRun')}</button>
      </div>
      {#if result}
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
</style>
