<script lang="ts">
  import TermText from './TermText.svelte';
  import type { LocalMetric } from '../themes/local.svelte';
  import { t, type Lang } from '../lib/i18n';
  import { pins } from '../lib/pins.svelte';

  let { rows, lang, current, onmetric }: {
    rows: { m: LocalMetric; v: number; rank: number; n: number }[];
    lang: Lang;
    /** metric on the map */
    current: string;
    onmetric: (key: string) => void;
  } = $props();

  const groups = ['people', 'demand', 'access', 'land', 'industry', 'labour', 'risk'] as const;
  /** shown without expanding a group: the ones a site search looks at first */
  const KEY = new Set(['pop2050', 'pop30', 'hh', 'income', 'ic', 'tPort', 'land', 'zone', 'truck', 'wh', 'pool30', 'work2050', 'quake', 'hz_flood']);
  // expanded groups ('*' = all), remembered in this browser
  const read = () => { try { return new Set<string>(JSON.parse(localStorage.getItem('profOpen') ?? '[]')); } catch { return new Set<string>(); } };
  let open = $state(read());
  function toggle(g: string) {
    const s = new Set(open);
    if (s.has(g)) s.delete(g); else s.add(g);
    open = s;
    try { localStorage.setItem('profOpen', JSON.stringify([...s])); } catch { /* private mode */ }
  }
  let q = $state('');
  const match = (r: (typeof rows)[number]) => { const s = q.trim().toLowerCase(); return !s || r.m.ja.toLowerCase().includes(s) || r.m.en.toLowerCase().includes(s); };
</script>

<div class="prof">
  <div class="tools">
    <input type="search" bind:value={q} placeholder={t(lang, 'filterMetrics')} aria-label={t(lang, 'filterMetrics')} />
    <button type="button" class="linkish" onclick={() => toggle('*')}>{t(lang, open.has('*') ? 'showFewer' : 'showAll')}</button>
  </div>
  {#each groups as g (g)}
    {@const all = rows.filter((r) => r.m.group === g && match(r))}
    {@const full = open.has('*') || open.has(g) || !!q.trim()}
    {@const items = full ? all : all.filter((r) => KEY.has(r.m.key) || r.m.key === current)}
    {#if all.length}
      <div class="gh">
        <p class="g">{t(lang, `lg_${g}`)}</p>
        {#if !q.trim() && !open.has('*') && all.length > items.length}
          <button type="button" class="linkish more" aria-expanded="false" onclick={() => toggle(g)}>+{all.length - items.length}</button>
        {:else if !q.trim() && open.has(g) && !open.has('*')}
          <button type="button" class="linkish more" aria-expanded="true" onclick={() => toggle(g)}>−</button>
        {/if}
      </div>
      <ul>
        {#each items as r (r.m.key)}
          {@const pos = r.rank && r.n ? 1 - (r.rank - 1) / Math.max(1, r.n - 1) : null}
          <li class="li">
            <button type="button" class="row" aria-pressed={r.m.key === current} onclick={() => onmetric(r.m.key)}>
              <span class="nm"><TermText text={r.m[lang]} {lang} focusable={false} /></span>
              <span class="v tnum">{isFinite(r.v) ? r.m.fmt(r.v) : '–'}</span>
              {#if pos !== null && r.m.better}
                <span class="bar" aria-hidden="true"><span style:width="{pos * 100}%"></span></span>
                <span class="rk tnum">{r.rank}/{r.n}</span>
              {:else}
                <span class="bar none" aria-hidden="true"></span><span class="rk"></span>
              {/if}
            </button>
            <button type="button" class="pin" aria-pressed={pins.has(r.m.key)} title={t(lang, 'pinMetric')}
                    aria-label={`${t(lang, 'pinMetric')}: ${r.m[lang]}`} onclick={() => pins.toggle(r.m.key)}>📌</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/each}
  <p class="note">{t(lang, 'rankHint')}</p>
</div>

<style>
  .prof { display: grid; gap: 2px; }
  .tools { display: flex; gap: 10px; align-items: center; margin-bottom: 2px; }
  .tools input { flex: 1; min-width: 0; min-height: 32px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; }
  .gh { display: flex; align-items: baseline; justify-content: space-between; margin: 6px 0 0; }
  .g { margin: 0; font-size: 12px; font-weight: 600; color: var(--muted); }
  .more { font-size: 12px; min-height: 24px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .row {
    width: 100%; border: 0; background: none; text-align: left; border-radius: 6px; padding: 3px 4px; min-height: 30px;
    display: grid; grid-template-columns: 1fr auto 70px 64px; gap: 8px; align-items: center; font-size: 12.5px;
  }
  .row:hover { background: var(--surface-2); }
  .li { display: flex; align-items: center; }
  .pin { border: 0; background: none; cursor: pointer; font-size: 11px; min-width: 22px; min-height: 26px; opacity: 0.18; filter: grayscale(1); }
  .li:hover .pin, .pin:focus-visible { opacity: 0.6; }
  .pin[aria-pressed='true'] { opacity: 1; filter: none; }
  .row[aria-pressed='true'] { background: var(--accent-soft); }
  .v { font-weight: 600; text-align: right; }
  .bar { height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--blue); }
  .bar.none { background: none; }
  .rk { font-size: 11px; color: var(--muted); text-align: right; }
  .note { margin: 6px 0 0; font-size: 11.5px; color: var(--muted); }
</style>
