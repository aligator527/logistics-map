<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtNum } from '../lib/scale';
  import { costs, estimate } from '../lib/costs.svelte';

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
      <table class="res">
        <thead><tr><th></th><th>{s.muniLabel(app.muni)}</th><th>{tt('costMedian')}</th></tr></thead>
        <tbody>
          <tr><th>{tt('costLand')}</th><td class="tnum">{oku(e.land)}</td><td class="tnum">{oku(median?.land ?? NaN)}</td></tr>
          <tr><th>{tt('costStaffYear')}</th><td class="tnum">{oku(e.staff)}</td><td class="tnum">{oku(median?.staff ?? NaN)}</td></tr>
          <tr><th>{tt('costFuelYear')}</th><td class="tnum">{oku(e.fuel)}</td><td class="tnum">{oku(median?.fuel ?? NaN)}</td></tr>
        </tbody>
      </table>
      <p class="src">{L === 'ja' ? `地価 ${fmtNum(L, e.landPrice, 0)}円/㎡ · 最低賃金 ${fmtNum(L, e.wage, 0)}円 · 軽油 ${fmtNum(L, e.diesel, 1)}円/L` : `Land ¥${fmtNum(L, e.landPrice, 0)}/m² · minimum wage ¥${fmtNum(L, e.wage, 0)} · diesel ¥${fmtNum(L, e.diesel, 1)}/L`}.
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
  .res { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0; }
  .res th, .res td { padding: 4px 2px; border-bottom: 1px solid var(--line); text-align: right; }
  .res th:first-child { text-align: left; color: var(--ink-2); font-weight: 500; }
  .res thead th { font-size: 11.5px; color: var(--muted); font-weight: 500; }
</style>
