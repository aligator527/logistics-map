<script lang="ts">
  // 自社データ: load your own places (CSV / TSV) as demand for the delivery cost, the simulation and the screening.
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtCompact, fmtNum } from '../lib/scale';
  import { userData, TEMPLATE } from '../lib/userdata.svelte';
  import { costs } from '../lib/costs.svelte';

  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const d = $derived(userData.data);
  let input: HTMLInputElement | undefined = $state();
  let open = $state(!!userData.data);

  async function onfile(e: Event) {
    const el = e.currentTarget as HTMLInputElement, f = el.files?.[0];
    if (!f) return;
    el.value = '';
    await userData.load(f);
    if (userData.data?.points.length) { costs.inputs.demand = 'user'; costs.save(); }
  }
  function template() {
    const url = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'logistics-map-template.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  /** municipalities with the most volume */
  const top = $derived.by(() => {
    const per = userData.perMuni, m = s.muni;
    if (!per || !m) return [];
    return per.map((v, i) => ({ c: m.codes[i], v })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
  });
</script>

<section class="panel">
  <details class="ud" bind:open>
    <summary class="eyebrow">{tt('udTitle')}{d ? `（${d.points.length}）` : ''}</summary>
    <p class="help">{tt('udIntro')}</p>
    <p class="memo">
      <button type="button" class="btn" onclick={() => input?.click()} disabled={!!userData.busy || !s.geo?.munis.length}>{tt(d ? 'udReplace' : 'udLoad')}</button>
      <button type="button" class="linkish" onclick={template}>{tt('udTemplate')}</button>
      {#if d}<button type="button" class="linkish" onclick={() => userData.clear()}>{tt('udClear')}</button>{/if}
    </p>
    <input bind:this={input} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onchange={onfile} />
    {#if !s.geo?.munis.length}<p class="src" role="status">{tt('loading')}</p>{/if}
    {#if userData.busy}
      <p class="src" role="status">{tt('udGeocoding')} {userData.busy.done} / {userData.busy.total}</p>
    {/if}
    {#if userData.error}<p class="src warn" role="alert">{tt(userData.error === 'columns' ? 'udErrColumns' : 'udErrEmpty')}</p>{/if}
    {#if d}
      <p class="small">{d.file} · {d.loaded} · {tt('udPoints')} {fmtNum(L, d.points.length, 0)} · {tt('udTotal')} {fmtCompact(L, userData.total)}
        {#if d.failed.length} · <span class="warn">{tt('udFailed')} {d.failed.length}</span>{/if}</p>
      {#if d.failed.length}<p class="src">{tt('udFailedList')}: {d.failed.slice(0, 8).join(L === 'ja' ? '、' : ', ')}{d.failed.length > 8 ? '…' : ''}</p>{/if}
      {#if top.length}
        <p class="sub-eyebrow">{tt('udTop')}</p>
        <ul class="plain">{#each top as x (x.c)}<li><button type="button" class="linkish" onclick={() => s.onpick(x.c)}>{s.muniLabel(x.c)}</button> <span class="tnum">{fmtCompact(L, x.v)}</span></li>{/each}</ul>
      {/if}
      <p class="src">{tt('udUse')}</p>
    {/if}
    <p class="src">{tt('udPrivacy')}</p>
  </details>
</section>

<style>
  .ud summary { cursor: pointer; min-height: 32px; }
  .warn { color: var(--ink); font-weight: 600; }
</style>
