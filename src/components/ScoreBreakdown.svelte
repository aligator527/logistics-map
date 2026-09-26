<script lang="ts">
  import type { Criterion } from '../lib/score';
  import { fmtNum } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';

  let { criteria, parts, weights, code, lang }: {
    criteria: Criterion[];
    /** [criterion][pref] percentile 0..100 */
    parts: number[][];
    weights: number[];
    code: number;
    lang: Lang;
  } = $props();

  const rows = $derived(criteria.map((c, k) => ({ c, w: weights[k], p: parts[k][code - 1], raw: c.raw[code - 1] }))
    .sort((a, b) => (b.w > 0 ? 1 : 0) - (a.w > 0 ? 1 : 0) || b.p - a.p));
</script>

<table>
  <caption class="sr-only">{t(lang, 'breakdown')}</caption>
  <thead class="sr-only">
    <tr><th scope="col">{t(lang, 'metric')}</th><th scope="col">0–100</th><th scope="col">{t(lang, 'weights')}</th></tr>
  </thead>
  <tbody>
    {#each rows as r (r.c.key)}
      <tr class:off={r.w === 0}>
        <th scope="row">
          <span class="nm">{r.c[lang]}</span>
          <span class="raw tnum">{isFinite(r.raw) ? r.c.fmt(r.raw) : '–'} · {r.c.source[lang]}</span>
        </th>
        <td class="bar">
          <span class="track" aria-hidden="true"><span class="fill" style:width="{isFinite(r.p) ? r.p : 0}%"></span><span class="mid"></span></span>
          <span class="pts tnum">{isFinite(r.p) ? fmtNum(lang, r.p, 0) : '–'}</span>
        </td>
        <td class="w tnum">×{r.w}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 6px 0; border-bottom: 1px solid var(--line); vertical-align: middle; text-align: left; }
  th { font-weight: 500; }
  .nm { display: block; }
  .raw { display: block; font-size: 11.5px; color: var(--muted); font-weight: 400; }
  .bar { width: 44%; padding-left: 10px; }
  .track { position: relative; display: inline-block; width: calc(100% - 30px); height: 8px; background: var(--surface-2); border-radius: 0 3px 3px 0; vertical-align: middle; }
  .fill { position: absolute; inset: 0 auto 0 0; background: var(--blue); border-radius: 0 3px 3px 0; }
  /* the median prefecture scores 50 */
  .mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--ink-2); opacity: 0.5; }
  .pts { display: inline-block; width: 26px; text-align: right; font-size: 12px; color: var(--ink-2); }
  .w { width: 30px; text-align: right; font-size: 12px; color: var(--muted); }
  tr.off .nm, tr.off .pts { color: var(--muted); }
  tr.off .fill { background: var(--line-strong); }
</style>
