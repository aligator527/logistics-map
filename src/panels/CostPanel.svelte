<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtNum } from '../lib/scale';
  import { costs, estimate, transport, tco, lease, type DemandKey, type WageBasis } from '../lib/costs.svelte';
  import { VEHICLES, REGION_NAMES } from '../lib/fares';
  import { userData } from '../lib/userdata.svelte';

  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const i = $derived(s.lt && app.muni ? s.lt.indexOf(app.muni) : -1);
  const e = $derived(i >= 0 ? estimate(i, costs.inputs) : null);
  /** the same assumptions at the median municipality of Japan, for scale */
  const median = $derived.by(() => {
    const m = s.muni;
    if (!m || !e) return null;
    const all = m.codes.map((_, j) => estimate(j, costs.inputs)).filter((x): x is NonNullable<typeof x> => !!x);
    const med = (f: (x: typeof all[number]) => number) => { const v = all.map(f).filter(isFinite).sort((a, b) => a - b); return v[v.length >> 1]; };
    return { land: med((x) => x.land), staff: med((x) => x.staff), fuel: med((x) => x.fuel) };
  });
  // runs: recomputed when the inputs, the site or the routing options change
  const tr = $derived.by(() => { void app.peak; void app.ferries; void s.lt?.closedEdges; void costs.inputs.vehicle; void costs.inputs.runs; void costs.inputs.load; void costs.inputs.limit; void costs.inputs.demand; void userData.perMuni; void costs.inputs.days; return i >= 0 ? transport(i, costs.inputs) : null; });
  const DEMANDS = $derived<[DemandKey, Key][]>([['pop', 'dmPop'], ['hh', 'dmHh'], ['retail', 'dmRetail'], ['mailorder', 'dmMail'], ['mfgShip', 'dmMfg'], ['wsEmp', 'dmWs'], ...(userData.perMuni ? [['user', 'dmUser'] as [DemandKey, Key]] : [])]);
  const LIMITS = [60, 120, 180, 240, 360, 600];
  const WAGES: [WageBasis, Key][] = [['handling', 'wbHandling'], ['part', 'wbPart'], ['truckL', 'wbTruckL'], ['truck', 'wbTruck'], ['min', 'wbMin']];
  const tc = $derived.by(() => { void costs.inputs.years; void costs.inputs.discount; void costs.inputs.wageBasis; void costs.inputs.staff; void costs.inputs.hours; void costs.inputs.plot; void costs.inputs.premium; void costs.inputs.tenure; void costs.inputs.floor; void costs.inputs.buildCost; void costs.inputs.rent; void s.rent; return i >= 0 ? tco(i, costs.inputs, tr) : null; });
  const ls = $derived.by(() => { void costs.inputs.floor; void costs.inputs.rent; void s.rent; return i >= 0 ? lease(i, costs.inputs) : null; });
  const oku = (y: number) => (isFinite(y) ? (L === 'ja' ? `${fmtNum(L, y / 1e8, 1)}億円` : `¥${fmtNum(L, y / 1e6, 0)}m`) : '–');
  const FIELDS: [keyof typeof costs.inputs, Key, string][] = [
    ['plot', 'costPlot', '㎡'], ['staff', 'costStaff', ''], ['hours', 'costHours', 'h'], ['premium', 'costPremium', '%'],
    ['km', 'costKm', 'km'], ['kmPerL', 'costKmPerL', 'km/L'], ['days', 'costDays', ''],
  ];
</script>

{#if e}
  <section class="panel">
    <details class="cost">
      <summary class="eyebrow">{tt('costTitle')} · {s.muniLabel(app.muni)}</summary>
      <div class="grid">
        {#each FIELDS as [k, label, unit] (k)}
          <label><span class="small">{tt(label)}</span>
            <span class="in"><input type="number" min="0" step="any" bind:value={costs.inputs[k]} onchange={() => costs.save()} />{#if unit}<span class="u">{unit}</span>{/if}</span></label>
        {/each}
      </div>
      <label class="basis"><span class="small">{tt('wageBasis')}</span>
        <select bind:value={costs.inputs.wageBasis} onchange={() => costs.save()}>
          {#each WAGES as [k, lab] (k)}<option value={k}>{tt(lab)}</option>{/each}
        </select></label>
      <table class="res">
        <thead><tr><th></th><th>{s.muniLabel(app.muni)}</th><th>{tt('costMedian')}</th></tr></thead>
        <tbody>
          <tr><th>{tt('costLand')}</th><td class="tnum">{oku(e.land)}</td><td class="tnum">{oku(median?.land ?? NaN)}</td></tr>
          <tr><th>{tt('costStaffYear')}</th><td class="tnum">{oku(e.staff)}</td><td class="tnum">{oku(median?.staff ?? NaN)}</td></tr>
          <tr><th>{tt('costFuelYear')}</th><td class="tnum">{oku(e.fuel)}</td><td class="tnum">{oku(median?.fuel ?? NaN)}</td></tr>
        </tbody>
      </table>
      <p class="sub-eyebrow">{tt('trTitle')}</p>
      <div class="grid">
        <label><span class="small">{tt('trVehicle')}</span>
          <select bind:value={costs.inputs.vehicle} onchange={() => costs.save()}>{#each VEHICLES as v (v.key)}<option value={v.key}>{v[L]}</option>{/each}</select></label>
        <label><span class="small">{tt('trDemand')}</span>
          <select bind:value={costs.inputs.demand} onchange={() => costs.save()}>{#each DEMANDS as [k, lab] (k)}<option value={k}>{tt(lab)}</option>{/each}</select></label>
        <label><span class="small">{tt('trRuns')}</span>
          <span class="in"><input type="number" min="0" step="1" bind:value={costs.inputs.runs} onchange={() => costs.save()} /><span class="u">{L === 'ja' ? '運行/日' : 'runs/day'}</span></span></label>
        <label><span class="small">{tt('trLoad')}</span>
          <span class="in"><input type="number" min="10" max="100" step="5" bind:value={costs.inputs.load} onchange={() => costs.save()} /><span class="u">%</span></span></label>
        <label><span class="small">{tt('trLimit')}</span>
          <select bind:value={costs.inputs.limit} onchange={() => costs.save()}>{#each LIMITS as m (m)}<option value={m}>{fmtNum(L, m / 60, m % 60 ? 1 : 0)}{L === 'ja' ? '時間以内' : ' h'}</option>{/each}</select></label>
      </div>
      {#if tr}
        <table class="res">
          <tbody>
            <tr><th>{tt('trYearly')}</th><td class="tnum">{oku(tr.yearly)}</td></tr>
            <tr><th>{tt('trPerRun')}</th><td class="tnum">{fmtNum(L, tr.perRun, 0)}{L === 'ja' ? '円' : ' ¥'} · {fmtNum(L, tr.km, 0)} km</td></tr>
            <tr><th>{tt('trCo2')}</th><td class="tnum">{fmtNum(L, tr.co2 / 1000, 0)} t-CO₂</td></tr>
            <tr><th>{tt('trServed')}</th><td class="tnum">{fmtNum(L, tr.served * 100, 0)}%</td></tr>
          </tbody>
        </table>
        <p class="src">{tt('trNote').replace('{r}', REGION_NAMES[tr.region] ?? tr.region)}
          <a href="https://www.mlit.go.jp/jidosha/jidosha_tk4_000118.html">{tt('trSource')}</a> · <a href="https://www.greenpartnership.jp/co2">{tt('co2Source')}</a></p>
      {:else if s.lt && !s.lt.router}<p class="src" role="status">{tt('loadingNetwork')}</p>{/if}
      {#if tc}
        <p class="sub-eyebrow">{tt('tcoTitle').replace('{n}', String(tc.years))}</p>
        <div class="grid">
          <label><span class="small">{tt('tcoYears')}</span>
            <span class="in"><input type="number" min="1" max="30" step="1" bind:value={costs.inputs.years} onchange={() => costs.save()} /><span class="u">{L === 'ja' ? '年' : 'yrs'}</span></span></label>
          <label><span class="small">{tt('tcoDiscount')}</span>
            <span class="in"><input type="number" min="0" max="15" step="0.5" bind:value={costs.inputs.discount} onchange={() => costs.save()} /><span class="u">%</span></span></label>
          <label><span class="small">{tt('tenure')}</span>
            <select bind:value={costs.inputs.tenure} onchange={() => costs.save()} data-testid="tenure">
              <option value="buy">{tt('tenureBuy')}</option><option value="lease">{tt('tenureLease')}</option></select></label>
          <label><span class="small">{tt('costFloor')}</span>
            <span class="in"><input type="number" min="0" step="1000" bind:value={costs.inputs.floor} onchange={() => costs.save()} /><span class="u">㎡</span></span></label>
          {#if costs.inputs.tenure === 'lease'}
            <label><span class="small">{tt('costRent')}</span>
              <span class="in"><input type="number" min="0" step="100" bind:value={costs.inputs.rent} onchange={() => costs.save()} /><span class="u">{L === 'ja' ? '円/坪・月' : '¥/tsubo·mo'}</span></span></label>
          {:else}
            <label><span class="small">{tt('costBuild')}</span>
              <span class="in"><input type="number" min="0" step="5000" bind:value={costs.inputs.buildCost} onchange={() => costs.save()} /><span class="u">{L === 'ja' ? '円/㎡' : '¥/m²'}</span></span></label>
          {/if}
        </div>
        <table class="res">
          <tbody>
            {#if tc.tenure === 'buy'}
              <tr><th>{tt('costLand')}</th><td class="tnum">{oku(tc.land)}</td></tr>
              <tr><th>{tt('tcoResidual')}（{fmtNum(L, tc.landGrowth * 100, 1)}%/{L === 'ja' ? '年' : 'yr'}）</th><td class="tnum">−{oku(tc.residual)}</td></tr>
              <tr><th>{tt('tcoBuilding')}</th><td class="tnum">{oku(tc.building)}</td></tr>
              <tr><th>{tt('tcoBuildingResidual')}</th><td class="tnum">−{oku(tc.buildingResidual)}</td></tr>
            {:else}
              <tr data-testid="lease-rent"><th>{tt('tcoRent')}{#if ls && isFinite(ls.rent)}（{fmtNum(L, ls.rent, 0)}{L === 'ja' ? '円/坪' : ' ¥/tsubo'}{#if ls.regional && ls.region} · {ls.region[L]}{/if}, {tc.rentGrowth >= 0 ? '+' : ''}{fmtNum(L, tc.rentGrowth * 100, 1)}%/{L === 'ja' ? '年' : 'yr'}）{/if}</th><td class="tnum">{isFinite(tc.rent) ? oku(tc.rent) : '–'}</td></tr>
            {/if}
            <tr><th>{tt('costStaffYear').replace(/（年）|\(a year\)/, '')}（+{fmtNum(L, tc.wageGrowth * 100, 1)}%/{L === 'ja' ? '年' : 'yr'}）</th><td class="tnum">{oku(tc.staff)}</td></tr>
            <tr><th>{tt('trYearly').replace(/年間|a year/, '')}</th><td class="tnum">{isFinite(tc.transport) ? oku(tc.transport) : '–'}</td></tr>
            <tr class="sum"><th>{tt('tcoTotal')}</th><td class="tnum">{isFinite(tc.total) ? oku(tc.total) : '–'}</td></tr>
          </tbody>
        </table>
        {#if tc.tenure === 'lease' && ls && !isFinite(ls.rent)}<p class="src warn">{tt('leaseNoRent')}</p>
        {:else if !isFinite(tc.total)}<p class="src warn">{tt('tcoNoRuns')}</p>{/if}
        {#if tc.tenure === 'lease' && s.rent}<p class="src"><a href={s.rent.source.url}>{s.rent.source[L]}</a></p>{/if}
        <p class="src">{tt('tcoNote')}</p>
      {/if}
      <p class="src">{L === 'ja' ? `地価 ${fmtNum(L, e.landPrice, 0)}円/㎡ · 時給 ${fmtNum(L, e.wage, 0)}円（最低賃金 ${fmtNum(L, e.minWage, 0)}円） · 軽油 ${fmtNum(L, e.diesel, 1)}円/L` : `Land ¥${fmtNum(L, e.landPrice, 0)}/m² · hourly ¥${fmtNum(L, e.wage, 0)} (minimum ¥${fmtNum(L, e.minWage, 0)}) · diesel ¥${fmtNum(L, e.diesel, 1)}/L`}.
        {tt('costNote')} <button type="button" class="linkish" onclick={() => costs.reset()}>{tt('costReset')}</button></p>
    </details>
  </section>
{/if}

<style>
  .cost summary { cursor: pointer; min-height: 32px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; margin: 8px 0; }
  .grid label { display: grid; gap: 2px; }
  .in { display: flex; align-items: center; gap: 4px; }
  .in input { width: 100%; min-height: 32px; padding: 0 6px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); color: var(--ink); }
  .u { font-size: 11px; color: var(--muted); }
  .grid select { width: 100%; min-height: 32px; }
  .warn { color: var(--ink); font-weight: 600; }
  .res tr.sum th, .res tr.sum td { font-weight: 700; border-top: 2px solid var(--line-strong); }
  .basis { display: grid; gap: 2px; margin: 6px 0; }
  .basis select { min-height: 32px; width: 100%; }
  .res { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0; }
  .res th, .res td { padding: 4px 2px; border-bottom: 1px solid var(--line); text-align: right; }
  .res th:first-child { text-align: left; color: var(--ink-2); font-weight: 500; }
  .res thead th { font-size: 11.5px; color: var(--muted); font-weight: 500; }
</style>
