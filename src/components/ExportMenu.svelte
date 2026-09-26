<script lang="ts">
  // 保存・書き出し: saved views, PNG of the map, GeoJSON / KML of the reach map, the facility registry and the shortlist.
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { views } from '../lib/views.svelte';
  import { shortlist } from '../lib/shortlist.svelte';
  import { saveGeo, savePng, type ExportPoint } from '../lib/exporters';

  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  let open = $state(false);
  let name = $state('');
  let busy = $state(false);
  const today = () => new Date().toISOString().slice(0, 10);

  function saveView() {
    const n = name.trim() || `${tt('viewDefault')} ${new Date().toLocaleString(L === 'ja' ? 'ja-JP' : 'en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    views.add(n, location.hash.slice(1));
    name = '';
  }
  async function png() {
    const el = document.querySelector<HTMLElement>('.mapcol .map');
    if (!el) return;
    busy = true;
    try { await savePng(el, `logistics-map-${today()}`); } finally { busy = false; }
  }
  const reachPoints = $derived.by((): ExportPoint[] => {
    const lt = s.lt, m = s.muni;
    if (!lt?.isoTimes || !m) return [];
    return m.codes.flatMap((c, i) => {
      const ll = s.muniLonLat(c), v = lt.isoTimes![i];
      return ll && isFinite(v) ? [{ name: s.muniLabel(c), lon: ll[0], lat: ll[1], props: { code: c, minutes: Math.round(v), population: m.m.pop[i] ?? null } }] : [];
    });
  });
  const facPoints = $derived((s.facilities ?? []).filter((f) => f.ll).map((f) => ({ name: f.name, lon: f.ll![0], lat: f.ll![1],
    props: { developer: s.srcName(f.src), address: f.addr ?? '', floor_m2: f.floor, stages: f.events.map((e) => `${e.date} ${e.stage}`).join('; '), source: f.events.at(-1)?.link ?? '' } })));
  const shortPoints = $derived.by((): ExportPoint[] => shortlist.items.flatMap((it): ExportPoint[] => {
    if (it.kind === 'point') { const [lon, lat] = it.code.split(',').map(Number); return [{ name: `${tt('pointKind')} ${lat.toFixed(4)},${lon.toFixed(4)}`, lon, lat, props: { kind: 'point' } }]; }
    if (it.kind === 'site') { const st = s.sites[Number(it.code)]; return st ? [{ name: st.name, lon: st.lon, lat: st.lat, props: { kind: 'DPL', address: st.address } }] : []; }
    if (it.kind === 'muni') { const ll = s.muniLonLat(it.code); return ll ? [{ name: s.muniLabel(it.code), lon: ll[0], lat: ll[1], props: { kind: 'municipality', code: it.code } }] : []; }
    return [];
  }));
</script>

<div class="exp">
  <button type="button" class="btn" aria-expanded={open} onclick={() => (open = !open)}>{tt('saveExport')} ▾</button>
  {#if open}
    <div class="menu" role="group" aria-label={tt('saveExport')}>
      <p class="sub-eyebrow">{tt('savedViews')}</p>
      <form class="row" onsubmit={(e) => { e.preventDefault(); saveView(); }}>
        <input type="text" bind:value={name} placeholder={tt('viewName')} aria-label={tt('viewName')} maxlength="60" />
        <button type="submit" class="btn">{tt('saveView')}</button>
      </form>
      {#if views.items.length}
        <ul class="views">
          {#each views.items as v (v.name)}
            <li><a href={`#${v.hash}`} onclick={() => (open = false)}>{v.name}</a> <span class="small">{v.at}</span>
              <button type="button" class="linkish" aria-label={`${tt('remove')} ${v.name}`} onclick={() => views.remove(v.name)}>×</button></li>
          {/each}
        </ul>
      {/if}
      <p class="sub-eyebrow">{tt('exportTitle')}</p>
      <ul class="acts">
        <li><button type="button" class="linkish" onclick={png} disabled={busy}>{busy ? '…' : tt('exportPng')}</button></li>
        {#if reachPoints.length}
          <li>{tt('exportReach')}: <button type="button" class="linkish" onclick={() => saveGeo(`reach-${today()}`, tt('isoTitle'), reachPoints, 'geojson')}>GeoJSON</button>
            · <button type="button" class="linkish" onclick={() => saveGeo(`reach-${today()}`, tt('isoTitle'), reachPoints, 'kml')}>KML</button></li>
        {/if}
        {#if shortPoints.length}
          <li>{tt('shortlist')}: <button type="button" class="linkish" onclick={() => saveGeo(`shortlist-${today()}`, tt('shortlist'), shortPoints, 'geojson')}>GeoJSON</button>
            · <button type="button" class="linkish" onclick={() => saveGeo(`shortlist-${today()}`, tt('shortlist'), shortPoints, 'kml')}>KML</button></li>
        {/if}
        {#if facPoints.length}
          <li>{tt('layerFac')}: <button type="button" class="linkish" onclick={() => saveGeo(`facilities-${today()}`, tt('layerFac'), facPoints, 'geojson')}>GeoJSON</button>
            · <button type="button" class="linkish" onclick={() => saveGeo(`facilities-${today()}`, tt('layerFac'), facPoints, 'kml')}>KML</button></li>
        {/if}
      </ul>
    </div>
  {/if}
</div>

<style>
  .exp { position: relative; }
  .menu { position: absolute; z-index: 50; top: calc(100% + 6px); left: 0; width: min(340px, 86vw); padding: 10px 12px;
          background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow); }
  .row { display: flex; gap: 6px; }
  .row input { flex: 1; min-width: 0; min-height: 34px; padding: 0 8px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface-2); color: var(--ink); }
  .views, .acts { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; font-size: 13px; }
  .views li { display: flex; align-items: baseline; gap: 6px; }
  .views a { color: var(--ink); }
</style>
