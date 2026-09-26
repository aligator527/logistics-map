<script lang="ts" module>
  export interface CompareRow {
    label: string;
    av: number;
    bv: number;
    fa: string;
    fb: string;
    /** small line under each value, e.g. year on year */
    sa?: string;
    sb?: string;
    /** "B − A" text; omit to hide the bars row */
    diff?: string;
  }
</script>

<script lang="ts">
  import { prefName, t, type Lang } from '../lib/i18n';

  let { names, lang, a, b, rows, onset, onswap }: {
    names: string[];          // Japanese prefecture names, index 0..46
    lang: Lang;
    a: number;
    b: number;
    rows: CompareRow[];
    onset: (slot: 'a' | 'b', code: number) => void;
    onswap: () => void;
  } = $props();

  const name = (c: number) => prefName(lang, c, names[c - 1]);
  const options = $derived(names.map((n, i) => ({ code: i + 1, label: prefName(lang, i + 1, n) })));
</script>

<div class="cmp">
  <div class="pick">
    <label>
      <span class="ab">A</span>
      <span class="sr-only">{t(lang, 'compareA')}</span>
      <select value={a} onchange={(e) => onset('a', Number(e.currentTarget.value))}>
        <option value={0}>{t(lang, 'choose')}</option>
        {#each options as o (o.code)}<option value={o.code} disabled={o.code === b}>{o.label}</option>{/each}
      </select>
    </label>
    <button type="button" class="btn ghost swap" onclick={onswap} disabled={!a || !b} aria-label={t(lang, 'swap')} title={t(lang, 'swap')}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3v10M4 13l-2.5-2.5M4 13l2.5-2.5M12 13V3M12 3L9.5 5.5M12 3l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>
    <label>
      <span class="ab b">B</span>
      <span class="sr-only">{t(lang, 'compareB')}</span>
      <select value={b} onchange={(e) => onset('b', Number(e.currentTarget.value))}>
        <option value={0}>{t(lang, 'choose')}</option>
        {#each options as o (o.code)}<option value={o.code} disabled={o.code === a}>{o.label}</option>{/each}
      </select>
    </label>
  </div>

  {#if !a || !b}
    <p class="hint">{t(lang, 'compareHint')}</p>
  {:else}
    <table>
      <caption class="sr-only">{name(a)} / {name(b)}</caption>
      <thead>
        <tr>
          <th scope="col"><span class="sr-only">{t(lang, 'metric')}</span></th>
          <th scope="col" class="num"><span class="ab">A</span> {name(a)}</th>
          <th scope="col" class="num"><span class="ab b">B</span> {name(b)}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.label)}
          {@const mx = Math.max(Math.abs(r.av) || 0, Math.abs(r.bv) || 0) || 1}
          <tr class:last={r.diff === undefined}>
            <th scope="row">{r.label}</th>
            <td class="num tnum">{r.fa}{#if r.sa}<small>{r.sa}</small>{/if}</td>
            <td class="num tnum">{r.fb}{#if r.sb}<small>{r.sb}</small>{/if}</td>
          </tr>
          {#if r.diff !== undefined}
            <tr class="bars" aria-hidden="true">
              <td colspan="3">
                <span class="bar a" style:width="{(Math.abs(r.av || 0) / mx) * 100}%"></span>
                <span class="bar b" style:width="{(Math.abs(r.bv || 0) / mx) * 100}%"></span>
                <span class="diff tnum">{t(lang, 'difference')}: {r.diff}</span>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .cmp { display: grid; gap: 12px; }
  .pick { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: center; }
  label { display: flex; align-items: center; gap: 6px; min-width: 0; }
  select {
    min-width: 0; width: 100%; min-height: 40px; padding: 0 8px;
    border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface);
  }
  .swap { padding: 0 8px; }
  .swap:disabled { opacity: 0.4; }
  .hint { margin: 0; color: var(--muted); font-size: 13px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 6px 4px; text-align: left; vertical-align: top; }
  thead th { font-size: 12px; font-weight: 600; color: var(--ink-2); border-bottom: 1px solid var(--line); }
  tbody th { font-weight: 500; color: var(--ink-2); white-space: nowrap; }
  tr.last th, tr.last td { border-bottom: 1px solid var(--line); }
  .num { text-align: right; }
  td.num { font-weight: 600; font-size: 14px; }
  td small { display: block; font-weight: 400; font-size: 11.5px; color: var(--muted); }
  .bars td { padding: 0 4px 10px; border-bottom: 1px solid var(--line); }
  .bar { display: block; height: 7px; border-radius: 0 3px 3px 0; margin-bottom: 3px; min-width: 2px; }
  .bar.a { background: var(--sel-a); }
  .bar.b { background: repeating-linear-gradient(90deg, var(--sel-b) 0 6px, transparent 6px 8px); }
  .diff { display: block; font-size: 11.5px; color: var(--ink-2); margin-top: 2px; }
</style>
