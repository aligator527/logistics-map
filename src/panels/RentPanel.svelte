<script lang="ts">
  // 物流施設の賃貸市場: the region's vacancy and asking rent since 2008 (一五不動産情報サービス), for the selected place
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtNum } from '../lib/scale';
  import { regionOfPref } from '../lib/rent';
  import Trend from '../components/Trend.svelte';

  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const pref = $derived(app.muni ? Number(app.muni.slice(0, 2)) : app.pref ? Number(app.pref) : 0);
  const g = $derived(regionOfPref(s.rent, pref));
  const quarters = $derived((s.rent?.quarters ?? []).map((id) => {
    const [y, m] = id.split('-').map(Number);
    return { id, ja: `${y}年${m}月`, en: new Date(Date.UTC(y, m - 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) };
  }));
  let q = $state(-1);
  const at = $derived(q < 0 ? quarters.length - 1 : Math.min(q, quarters.length - 1));
  const xticks = $derived(quarters.map((x, i) => ({ i, y: Number(x.id.slice(0, 4)), jan: x.id.endsWith('-01') }))
    .filter((x) => x.jan && x.y % 4 === 0).map((x) => ({ i: x.i, label: String(x.y) })));
  const vals = (a: (number | null)[]) => a.map((v) => (v === null ? NaN : v));
</script>

{#if g && s.rent}
  <section class="panel" data-testid="rent-panel">
    <p class="eyebrow">{tt('rentTitle')} · {g[L]}</p>
    <Trend series={[{ key: 'v', label: tt('rentVacancy'), kind: 'main', values: vals(g.vacancy) }]} {quarters} q={at} lang={L}
           label={tt('rentVacancy')} format={(v) => (isFinite(v) ? `${fmtNum(L, v, 1)}%` : '–')} tick={(v) => `${v}%`} {xticks} onselect={(j) => (q = j)} />
    <Trend series={[{ key: 'r', label: tt('rentRent'), kind: 'main', values: vals(g.rent) }]} {quarters} q={at} lang={L}
           label={L === 'ja' ? `${tt('rentRent')}（円/坪・月）` : `${tt('rentRent')} (¥/tsubo a month)`} format={(v) => (isFinite(v) ? fmtNum(L, v, 0) : '–')}
           tick={(v) => fmtNum(L, v, 0)} {xticks} onselect={(j) => (q = j)} />
    <p class="src">{s.rent.source.note[L]} <a href={s.rent.source.url}>{s.rent.source[L]}</a></p>
  </section>
{/if}
