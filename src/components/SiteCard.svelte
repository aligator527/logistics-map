<script lang="ts" module>
  export interface Catchment {
    pop10: number | null; pop30: number | null; pop60: number | null;
    ic: number | null; icName: string | null; icSmart?: boolean;
    land10: number | null; land10n: number;
    pool30: number | null; cluster20: number | null;
  }
</script>

<script lang="ts">
  import { fmtCompact, fmtNum } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';

  let { name, c, median, lang, extra = [] }: {
    name: string;
    c: Catchment;
    /** median over all listed DPL sites */
    median: Record<string, number | null>;
    lang: Lang;
    /** rows without a DPL median (e.g. nearest airport / port) */
    extra?: [string, string][];
  } = $props();

  const people = (v: number) => `${fmtCompact(lang, v)}${lang === 'ja' ? '人' : ''}`;
  const rows = $derived([
    { key: 'pop10', label: t(lang, 'pop10'), v: c.pop10, f: people, more: true },
    { key: 'pop30', label: t(lang, 'pop30'), v: c.pop30, f: people, more: true },
    { key: 'pop60', label: t(lang, 'pop60'), v: c.pop60, f: people, more: true },
    { key: 'ic', label: `${t(lang, 'nearestIc')}${c.icName ? `（${c.icName}${c.icSmart ? ' SIC' : ''}）` : ''}`, v: c.ic,
      f: (v: number) => `${fmtNum(lang, v, 1)} km`, more: false },
    { key: 'pool30', label: t(lang, 'pool30'), v: c.pool30, f: people, more: true },
    { key: 'cluster20', label: t(lang, 'cluster20'), v: c.cluster20, f: people, more: true },
    { key: 'land10', label: `${t(lang, 'land10')}${c.land10n ? ` (n=${c.land10n})` : ''}`, v: c.land10,
      f: (v: number) => `${fmtCompact(lang, v)}${lang === 'ja' ? '円/㎡' : ' ¥/m²'}`, more: false },
  ]);
  /** position vs the DPL median: ratio on a log scale, clamped to ±1 (= ×10) */
  const pos = (v: number | null, m: number | null) =>
    v && m ? Math.max(-1, Math.min(1, Math.log10(v / m))) : null;
</script>

<div class="card">
  <p class="eyebrow">{t(lang, 'siteConditions')} · {name}</p>
  <table>
    <caption class="sr-only">{t(lang, 'siteConditions')}</caption>
    <thead>
      <tr><th scope="col" class="sr-only">{t(lang, 'metric')}</th><th scope="col" class="num">{t(lang, 'thisSite')}</th><th scope="col" class="num">{t(lang, 'dplMedian')}</th></tr>
    </thead>
    <tbody>
      {#each rows as r (r.key)}
        {@const p = pos(r.v, median[r.key])}
        <tr>
          <th scope="row">{r.label}
            {#if p !== null}
              <span class="scale" aria-hidden="true"><span class="mid"></span><span class="dot" class:good={r.more ? p > 0.05 : p < -0.05} class:bad={r.more ? p < -0.05 : p > 0.05} style:left="{50 + p * 50}%"></span></span>
            {/if}
          </th>
          <td class="num tnum">{r.v === null ? '–' : r.f(r.v)}</td>
          <td class="num tnum muted">{median[r.key] == null ? '–' : r.f(median[r.key]!)}</td>
        </tr>
      {/each}
      {#each extra as [k, v] (k)}
        <tr><th scope="row">{k}</th><td class="num tnum" colspan="2">{v}</td></tr>
      {/each}
    </tbody>
  </table>
  <p class="note">{t(lang, 'siteConditionsNote')}</p>
</div>

<style>
  .card { display: grid; gap: 6px; }
  .eyebrow { margin: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 6px 0; border-bottom: 1px solid var(--line); text-align: left; font-weight: 400; vertical-align: top; }
  thead th { font-size: 11.5px; color: var(--muted); font-weight: 600; }
  .num { text-align: right; padding-left: 10px; white-space: nowrap; }
  td.num { font-weight: 600; }
  td.muted { color: var(--muted); font-weight: 400; }
  .scale { display: block; position: relative; height: 8px; margin-top: 4px; width: 100%; max-width: 160px; background: var(--surface-2); border-radius: 4px; }
  .mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--ink-2); opacity: 0.5; }
  .dot { position: absolute; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--ink-2); border: 1.5px solid var(--surface); }
  .dot.good { background: var(--blue); }
  .dot.bad { background: var(--clay); }
  .note { margin: 0; font-size: 11.5px; color: var(--muted); }
</style>
