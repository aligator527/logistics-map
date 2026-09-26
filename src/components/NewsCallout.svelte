<script lang="ts">
  import type { NewsGroup } from '../lib/newsmap';
  import { fmtDate } from '../lib/data';
  import { t, type Lang } from '../lib/i18n';

  let { group, lang, onplace, onclose, onhover, active = false }: {
    group: NewsGroup;
    lang: Lang;
    /** select the place on the map (absent for national news) */
    onplace?: (code: string) => void;
    /** close the callout (map callouts only) */
    onclose?: () => void;
    onhover?: (on: boolean) => void;
    active?: boolean;
  } = $props();

  let k = $state(0);
  const n = $derived(group.items.length);
  const it = $derived(group.items[Math.min(k, n - 1)]);
  let broken = $state<Record<string, boolean>>({});
</script>

<article class="nc" class:active aria-label={`${group.label} · ${t(lang, 'news')}`}
         onpointerenter={() => onhover?.(true)} onpointerleave={() => onhover?.(false)}>
  <div class="media" aria-hidden="true">
    {#if it.img && !broken[it.img]}
      <img src={it.img} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
           onerror={() => (broken = { ...broken, [it.img!]: true })} />
    {:else}
      <span class="ph">{it.src.replace(/（.*$|\s*\(.*$/, '')}</span>
    {/if}
  </div>
  <div class="body">
    <p class="place">
      {#if onplace && group.code}
        <button type="button" class="place-btn" onclick={() => onplace!(group.code)} title={t(lang, 'showPlace')}>{group.label}</button>
      {:else}{group.label}{/if}
      {#if it.isNew}<span class="new">NEW</span>{/if}
    </p>
    <h3><a href={it.link} target="_blank" rel="noopener">{it.t}<span class="sr-only"> ({t(lang, 'newWindow')})</span></a></h3>
    {#if it.ex}<p class="ex">{it.ex}</p>{/if}
    <p class="meta"><time datetime={it.date}>{fmtDate(lang, it.date)}</time> · {it.src}</p>
    <p class="cta"><a class="go" href={it.link} target="_blank" rel="noopener" aria-hidden="true" tabindex="-1">{t(lang, 'readArticle')} ↗</a></p>
    {#if n > 1}
      <div class="pager">
        <button type="button" class="pg" aria-label={t(lang, 'prevItem')} disabled={k === 0} onclick={() => (k = Math.max(0, k - 1))}>‹</button>
        <span class="tnum" aria-live="polite">{k + 1} / {n}</span>
        <button type="button" class="pg" aria-label={t(lang, 'nextItem')} disabled={k >= n - 1} onclick={() => (k = Math.min(n - 1, k + 1))}>›</button>
      </div>
    {/if}
  </div>
  {#if onclose}
    <button type="button" class="x" aria-label={t(lang, 'close')} onclick={onclose}>
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" /></svg>
    </button>
  {/if}
</article>

<style>
  .nc {
    position: relative; display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 10px;
    padding: 10px 12px 10px 10px; height: 100%; box-sizing: border-box;
    background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px;
    box-shadow: var(--shadow); color: var(--ink); overflow: hidden;
  }
  .nc.active { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink), var(--shadow); }
  .media { width: 76px; height: 76px; border-radius: 6px; overflow: hidden; background: var(--surface-2); display: grid; place-items: center; }
  .media img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph { font-size: 10.5px; line-height: 1.3; color: var(--muted); text-align: center; padding: 4px; }
  .body { min-width: 0; display: grid; align-content: start; gap: 3px; }
  .place { margin: 0; font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; padding-right: 18px; }
  .place-btn { border: 0; background: none; padding: 0; font: inherit; color: var(--ink-2); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .new { font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--bg); background: var(--clay); border-radius: 3px; padding: 0 4px; }
  h3 { margin: 0; font-size: 13px; line-height: 1.35; font-weight: 600;
       display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  h3 a { color: inherit; text-decoration: none; }
  h3 a:hover, h3 a:focus-visible { text-decoration: underline; }
  .ex { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-2);
        display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { margin: 2px 0 0; font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cta { margin: 0; font-size: 11.5px; }
  .go { font-weight: 600; color: var(--ink); white-space: nowrap; }
  .pager { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); }
  .pg { min-width: 26px; min-height: 24px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--surface); color: var(--ink); line-height: 1; }
  .pg:disabled { opacity: 0.35; }
  .x { position: absolute; top: 4px; right: 4px; width: 28px; height: 28px; display: grid; place-items: center;
       border: 0; border-radius: 6px; background: none; color: var(--muted); }
  .x:hover { color: var(--ink); background: var(--surface-2); }
</style>
