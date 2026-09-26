<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { live, WARN } from '../lib/live.svelte';
  import { shortlist, type ShortItem } from '../lib/shortlist.svelte';
  import { downloadCsv } from '../lib/csv';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const lt = $derived(s.lt), msc = $derived(s.msc), sc = $derived(s.sc), nt = $derived(s.nt), muni = $derived(s.muni), hubs = $derived(s.hubs), sites = $derived(s.sites);
  const { pname, muniLabel } = s;
  // ------------------------------------------------------------ shortlist & CSV
  function shortLabel(it: ShortItem) {
    if (it.kind === 'pref') return pname(Number(it.code));
    if (it.kind === 'muni') return muniLabel(it.code);
    return sites[Number(it.code)]?.name ?? it.code;
  }
  const shortKind = (it: ShortItem) => tt(it.kind === 'pref' ? 'byPref' : it.kind === 'muni' ? 'byMuni' : 'dplIn');
  /** live warning level at a shortlisted place (prefecture: its highest municipal level) */
  function shortAlert(it: ShortItem): { level: number; text: string } {
    if (!muni || !live.warnTime) return { level: 0, text: '' };
    const codes = it.kind === 'muni' ? [it.code] : it.kind === 'site' ? [sites[Number(it.code)]?.muni ?? ''] : muni.codes.filter((c) => Number(c.slice(0, 2)) === Number(it.code));
    let level = 0, best = '';
    for (const c of codes) { const l = live.level(c, true); if (l > level) { level = l; best = c; } }
    const text = best ? (live.warnings.get(best) ?? []).filter((k) => (WARN[k]?.level ?? 0) >= 2).map((k) => WARN[k]?.[L] ?? k).join('・') : '';
    return { level, text: it.kind === 'pref' && best ? `${muniLabel(best)}: ${text}` : text };
  }
  function openShort(it: ShortItem) {
    app.stopCompare();
    if (it.kind === 'pref') { app.muni = ''; app.site = -1; app.pref = Number(it.code); }
    else if (it.kind === 'muni') { app.site = -1; app.pref = Number(it.code.slice(0, 2)); app.muni = it.code; }
    else { const i = Number(it.code); if (sites[i]) { app.site = i; app.pref = sites[i].pref; } }
  }
  function exportShortlist() {
    const lm = lt?.metrics ?? [];
    const head = ['kind', 'code', 'name', 'prefecture', ...(sc ? [tt('layerScore') + '（' + tt('byPref') + '）'] : []),
      ...(msc ? [tt('layerScore') + '（' + tt('byMuni') + '）'] : []), ...lm.map((m) => m[L]), tt('pop30'), tt('nearestIc'), tt('nearestAir')];
    const rows = shortlist.items.map((it) => {
      const pc = it.kind === 'pref' ? Number(it.code) : it.kind === 'muni' ? Number(it.code.slice(0, 2)) : sites[Number(it.code)]?.pref ?? 0;
      const mc = it.kind === 'muni' ? it.code : it.kind === 'site' ? sites[Number(it.code)]?.muni ?? '' : '';
      const mi = mc && lt ? lt.indexOf(mc) : -1;
      const ct = it.kind === 'site' ? muni?.sites[sites[Number(it.code)]?.name ?? ''] : undefined;
      const hb = it.kind === 'site' ? hubs?.sites[sites[Number(it.code)]?.name ?? '']?.air : undefined;
      return [it.kind, it.code, shortLabel(it), pname(pc), ...(sc ? [sc.result.total[pc - 1]?.toFixed(1)] : []),
        ...(msc ? [mi >= 0 && msc ? msc.result.total[msc.indexOf(mc)]?.toFixed(1) : ''] : []),
        ...lm.map((m) => (mi >= 0 ? m.get(mi) : '')), ct?.pop30 ?? '', ct ? `${ct.icName ?? ''} ${ct.ic ?? ''}` : '', hb ? `${hb.n} ${hb.km}` : ''];
    });
    downloadCsv(`shortlist-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows]);
  }
</script>

<section class="panel">
  <div class="head-row">
    <p class="eyebrow">{tt('shortlist')}{shortlist.items.length ? `（${shortlist.items.length}）` : ''}</p>
    {#if shortlist.items.length}
      <span class="acts">
        <button type="button" class="linkish" onclick={exportShortlist}>{tt('exportCsv')}</button>
        <button type="button" class="linkish" onclick={() => shortlist.clear()}>{tt('clearAll')}</button>
      </span>
    {/if}
  </div>
  {#if shortlist.items.length}
    {@const alerts = shortlist.items.map((it) => shortAlert(it)).filter((a) => a.level >= 2)}
    {#if live.warnTime}
      <p class="alert-line" class:hot={alerts.some((a) => a.level >= 3)} role="status">
        {alerts.length ? `${tt('shortAlert')}：${alerts.length}` : tt('shortAlertNone')}
        {#if alerts.length}<button type="button" class="linkish" onclick={() => { app.layer = 'now'; app.nmet = 'warn'; }}>{tt('layerNow')} →</button>{/if}
      </p>
    {/if}
    <ul class="short">
      {#each shortlist.items as it (it.kind + it.code)}
        {@const al = shortAlert(it)}
        <li>
          <button type="button" class="linkish" onclick={() => openShort(it)}>{shortLabel(it)}
            {#if al.level >= 2}<span class="lv-chip" style:background={nt?.categories?.[al.level - 1]?.color} class:inv={al.level >= 3}
                                    title={al.text}>{nt?.levelName(al.level) ?? ''}</span>{/if}</button>
          <span class="kind">{shortKind(it)}</span>
          <button type="button" class="btn ghost x" aria-label={tt('remove')} onclick={() => shortlist.toggle(it.kind, it.code)}>×</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="src">{tt('shortEmpty')}</p>
  {/if}
</section>
