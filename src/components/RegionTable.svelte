<script lang="ts" module>
  export interface Column {
    key: string;
    label: string;
    /** value for prefecture code 1..47 (NaN = no data) */
    get: (code: number) => number;
    fmt: (v: number) => string;
  }
</script>

<script lang="ts">
  import { prefName, t, type Lang } from '../lib/i18n';

  let { names, columns, primary, lang, focus, a = 0, b = 0, compare = false, onpick, areas = null }: {
    names: string[];          // Japanese prefecture names, index 0..46
    /** rows other than the 47 prefectures (municipal score): id is passed to Column.get and onpick */
    areas?: { id: number; label: string }[] | null;
    columns: Column[];
    /** key of the column shown on the map (bold, default sort) */
    primary: string;
    lang: Lang;
    focus: number;
    a?: number;
    b?: number;
    compare?: boolean;
    onpick: (code: number) => void;
  } = $props();

  let sortKey = $state('');   // '' = the primary column
  let desc = $state(true);
  $effect(() => { void primary; sortKey = ''; desc = true; });
  const active = $derived(sortKey || primary);

  const rows = $derived.by(() => {
    const col = columns.find((c) => c.key === active);
    const codes = areas ? areas.map((x) => x.id) : Array.from({ length: 47 }, (_, i) => i + 1);
    if (active === 'name' || !col) return desc ? codes : codes.reverse();
    const v = new Map(codes.map((c) => [c, col.get(c)]));
    return codes.sort((x, y) => {
      const p = v.get(x)!, q = v.get(y)!;
      if (!isFinite(p)) return 1;
      if (!isFinite(q)) return -1;
      return desc ? q - p : p - q;
    });
  });
  function sort(k: string) {
    if (active === k) desc = !desc;
    else { sortKey = k; desc = k !== 'name'; }
  }
  const labelMap = $derived(areas ? new Map(areas.map((x) => [x.id, x.label])) : null);
  const labelOf = (code: number) => labelMap?.get(code) ?? prefName(lang, code, names[code - 1]);
  const aria = (k: string) => (active === k ? (desc ? 'descending' : 'ascending') : 'none');
</script>

<div class="wrap">
  <table>
    <caption class="sr-only">{t(lang, 'table')}</caption>
    <thead>
      <tr>
        <th scope="col" aria-sort={active === 'name' ? (desc ? 'ascending' : 'descending') : 'none'}>
          <button type="button" onclick={() => sort('name')}>{t(lang, 'area')}</button>
        </th>
        {#each columns as c (c.key)}
          <th scope="col" aria-sort={aria(c.key)} class="num">
            <button type="button" onclick={() => sort(c.key)}>
              {c.label}<span class="arr" aria-hidden="true">{active === c.key ? (desc ? '↓' : '↑') : ''}</span>
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as code (code)}
        <tr class:sel={!compare && code === focus}>
          <th scope="row">
            <button type="button" class="linkish" onclick={() => onpick(code)}>{labelOf(code)}</button>
            {#if compare && code === a}<span class="ab">A</span>{/if}
            {#if compare && code === b}<span class="ab b">B</span>{/if}
          </th>
          {#each columns as c (c.key)}
            <td class="num tnum" class:cur={c.key === primary}>{c.fmt(c.get(code))}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap { overflow: auto; max-height: max(440px, calc(100dvh - 250px)); border: 1px solid var(--line); border-radius: var(--radius); }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
  thead th { position: sticky; top: 0; background: var(--surface); z-index: 1; font-weight: 600; }
  thead button { border: 0; background: none; padding: 4px 0; font-weight: 600; font-size: 12px; color: var(--ink-2); min-height: 32px; }
  .num { text-align: right; }
  .arr { display: inline-block; width: 1em; }
  tbody th { font-weight: 500; display: flex; gap: 6px; align-items: center; }
  tbody th .linkish { font-size: 13px; color: var(--ink); text-decoration-color: var(--line-strong); min-height: 28px; }
  td.cur { font-weight: 600; }
  tr.sel { background: var(--accent-soft); }
  tbody tr:hover { background: var(--surface-2); }
</style>
