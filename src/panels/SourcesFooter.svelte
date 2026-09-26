<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtDate } from '../lib/data';
  import type { ExtraCriteria } from '../themes/score.svelte';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const w = $derived(s.w!), census = $derived(s.census!), jobs = $derived(s.jobs!), ssw = $derived(s.ssw!), dpl = $derived(s.dpl!);
  const roads = $derived(s.roads), risk = $derived(s.risk), news = $derived(s.news), hubs = $derived(s.hubs);
</script>

<footer class="foot">
  <h2 class="eyebrow">{tt('sources')}</h2>
  <dl>
    <dt>{L === 'ja' ? '営業倉庫' : 'Warehouses'}</dt>
    <dd>
      <a href={w.source.url}>{w.source[L]}</a>. {w.source.scope[L]}
      {L === 'ja' ? '収録' : 'Coverage'}: {L === 'ja' ? w.quarters[0].ja : w.quarters[0].en} – {L === 'ja' ? w.quarters.at(-1)!.ja : w.quarters.at(-1)!.en}
      {L === 'ja' ? `（最新号 ${fmtDate(L, w.quarters.at(-1)!.published)}公表）。` : ` (latest issue published ${fmtDate(L, w.quarters.at(-1)!.published)}).`}
      {tt('lagNote')} {#if w.notes.length}{tt('totalReplaced')} ({w.notes.map((n) => n.quarter).join(', ')}){/if}
    </dd>
    <dt>{tt('layerFlows')}</dt>
    <dd><a href={census.source.url}>{census.source[L]}</a>: {census.years.map((y) => y.survey[L]).join(', ')}. {census.source.note[L]} {census.source.licence[L]}.</dd>
    <dt>{tt('lm_jobs')}</dt>
    <dd><a href={jobs.source.url}>{jobs.source[L]}</a> ({jobs.periods[0][L]}–{jobs.periods.at(-1)![L]}). {jobs.source.note[L]}</dd>
    <dt>{tt('lm_ssw')}</dt>
    <dd><a href={ssw.source.url}>{ssw.source[L]}</a> ({ssw.periods[0][L]}–{ssw.periods.at(-1)![L]}). {ssw.source.note[L]}</dd>
    <dt>{L === 'ja' ? '輸送力不足' : 'Capacity shortfall'}</dt>
    <dd><a href={jobs.shortfall2024.national.source.url}>{jobs.shortfall2024.national.source[L]}</a>; <a href={jobs.shortfall2024.source.url}>{jobs.shortfall2024.source[L]}</a></dd>
    <dt>DPL</dt>
    <dd><a href={dpl.source.url}>{dpl.source[L]}</a>{L === 'ja'
      ? `（${fmtDate(L, dpl.source.updated)}更新、${fmtDate(L, dpl.source.retrieved)}取得）。`
      : ` (updated ${fmtDate(L, dpl.source.updated)}, retrieved ${fmtDate(L, dpl.source.retrieved)}). `}{dpl.source.note[L]}</dd>
    {#if roads}
      <dt>{tt('layerRoads')}</dt>
      <dd><a href={roads.source.url}>{roads.source[L]}</a></dd>
    {/if}
    {#if risk}
      <dt>{tt('groupRisk')}</dt>
      <dd>{#each (risk as unknown as { criteria: ExtraCriteria[] }).criteria as c, i (c.key)}{i ? '; ' : ''}{c[L]}: {c.source[L]}{/each}.
        {L === 'ja' ? 'DPL地点のハザード：' : 'Hazards at DPL sites: '}<a href="https://www.j-shis.bosai.go.jp/">J-SHIS</a>,
        <a href="https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html">{L === 'ja' ? 'ハザードマップポータルサイト' : 'Hazard Map Portal'}</a>.</dd>
    {/if}
    {#if news}
      <dt>{tt('news')}</dt>
      <dd>{#each news.sources as s, i (s.key)}{i ? ', ' : ''}<a href={s.url}>{s[L]}</a>{/each}. {L === 'ja' ? '国土交通省の見出しは国土交通省ウェブサイトへのリンクです。' : 'MLIT headlines link to the MLIT website.'}</dd>
    {/if}
    {#if hubs}
      <dt>{tt('layerHubs')}</dt>
      <dd>{#each Object.values(hubs.sources) as s, i (s.url)}{i ? '; ' : ''}<a href={s.url}>{s[L]}</a>{/each}</dd>
    {/if}
    <dt>{tt('boundaries')}</dt>
    <dd>{tt('boundarySource')}</dd>
  </dl>
  {#if hubs?.noncommercial}<p class="next">{tt('noncommercialNote')}</p>{/if}
  <details id="method" class="method">
    <summary>{tt('method')}</summary>
    <p>{tt('methodBody')}</p>
  </details>
  <p class="next">{tt('phaseNext')}</p>
</footer>
