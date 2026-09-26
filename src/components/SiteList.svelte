<script lang="ts">
  import { fmtYm, isBuilt, type Site } from '../lib/data';
  import { fmtSqm } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';

  let { sites, lang, selected, onsite }: {
    /** [index into dpl.sites, site] */
    sites: [number, Site][];
    lang: Lang;
    selected: number;
    onsite: (i: number) => void;
  } = $props();

  let open = $state(false);
  const shown = $derived(open ? sites : sites.slice(0, 6));
</script>

{#if !sites.length}
  <p class="empty">{t(lang, 'noDpl')}</p>
{:else}
  <ul class="list">
    {#each shown as [i, s] (i)}
      {@const built = isBuilt(s)}
      <li>
        <button type="button" class="item" aria-pressed={i === selected} onclick={() => onsite(i)}>
          <svg width="14" height="14" aria-hidden="true" class="mk">
            {#if built}<circle cx="7" cy="7" r="5" class="k-built" />
            {:else}<circle cx="7" cy="7" r="5.5" class="k-pipe-o" /><circle cx="7" cy="7" r="3" class="k-pipe-i" />{/if}
          </svg>
          <span class="nm">{s.name}</span>
          <span class="meta">
            {t(lang, `st_${s.status}`)} · {s.land ? t(lang, 'opens') : t(lang, 'completed')} {fmtYm(lang, s.date)}
            {#if s.floor || s.plot} · {fmtSqm(lang, (s.floor ?? s.plot)!)}{#if s.land} ({t(lang, 'plot')}){/if}{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
  {#if sites.length > 6}
    <button type="button" class="linkish more" onclick={() => (open = !open)}>
      {open ? (lang === 'ja' ? '一部のみ表示' : 'Show fewer') : (lang === 'ja' ? `すべて表示（${sites.length}${t(lang, 'sites')}）` : `Show all ${sites.length}`)}
    </button>
  {/if}
{/if}

<style>
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .item {
    width: 100%; text-align: left; border: 1px solid transparent; background: none; border-radius: 8px;
    display: grid; grid-template-columns: 16px 1fr; gap: 0 8px; padding: 6px 8px; align-items: center; min-height: 44px;
  }
  .item:hover { background: var(--surface-2); }
  .item[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
  .mk { grid-row: span 2; }
  .nm { font-weight: 600; font-size: 13.5px; }
  .meta { grid-column: 2; font-size: 12px; color: var(--muted); }
  .more { margin-top: 6px; }
  .k-built { fill: var(--mark); stroke: var(--mark-ring); stroke-width: 1.5; }
  .k-pipe-o { fill: var(--surface); stroke: var(--mark-ring); stroke-width: 1.1; }
  .k-pipe-i { fill: none; stroke: var(--mark); stroke-width: 2; }
</style>
