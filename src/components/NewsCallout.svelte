<script lang="ts">
  import { sizedImage, type NewsGroup } from '../lib/newsmap';
  import { stageOf, type NewsLite, type Related } from '../lib/related';
  import { fmtDate } from '../lib/data';
  import { t, type Key, type Lang } from '../lib/i18n';

  let { group, lang, onplace, onclose, onhover, active = false, dim = false, k = $bindable(0),
        expanded = false, ontoggle, relatedFor, timelineFor, relHover = $bindable(null), natural = $bindable(0), maxH = 0 }: {
    group: NewsGroup;
    lang: Lang;
    /** select the place on the map (absent for national news) */
    onplace?: (code: string) => void;
    /** close the callout (map callouts only) */
    onclose?: () => void;
    onhover?: (on: boolean) => void;
    active?: boolean;
    /** another card is hovered: step back */
    dim?: boolean;
    /** item shown (pager) */
    k?: number;
    /** related news and the facility timeline are open */
    expanded?: boolean;
    ontoggle?: () => void;
    relatedFor?: (link: string) => Related[];
    timelineFor?: (link: string) => NewsLite[];
    /** related item under the pointer (its line is drawn bold on the map) */
    relHover?: string | null;
    /** open card: height of its content, measured (the map sizes the card box from it) */
    natural?: number;
    maxH?: number;
  } = $props();

  const n = $derived(group.items.length);
  const it = $derived(group.items[Math.min(k, n - 1)]);
  let broken = $state<Record<string, boolean>>({});
  const related = $derived(expanded && relatedFor ? relatedFor(it.link) : []);
  const timeline = $derived(expanded && timelineFor ? timelineFor(it.link) : []);
  const relCount = $derived(relatedFor ? relatedFor(it.link).length : 0);
  /** timeline dots spread by date */
  const tl = $derived.by(() => {
    if (timeline.length < 2) return [];
    const t0 = Date.parse(timeline[0].date), t1 = Date.parse(timeline.at(-1)!.date);
    return timeline.map((x) => ({ x, pos: t1 > t0 ? (Date.parse(x.date) - t0) / (t1 - t0) : 0.5, stage: stageOf(x.t) ?? 'other' }));
  });
  /** a click on the card itself (not on a link or button) opens / closes the related news */
  function onclick(e: MouseEvent) {
    if (!ontoggle || (e.target as Element).closest('a,button')) return;
    ontoggle();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article class="nc" class:active class:dim class:expanded class:clickable={!!ontoggle} aria-label={`${group.label} · ${t(lang, 'news')}`}
         bind:clientHeight={natural} style:max-height={expanded && maxH ? `${maxH}px` : null}
         onpointerenter={() => onhover?.(true)} onpointerleave={() => onhover?.(false)} {onclick}>
  <div class="media" aria-hidden="true">
    {#if it.img && !broken[it.img]}
      <img src={sizedImage(it.img, 76)} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
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
    <p class="cta">
      <a class="go" href={it.link} target="_blank" rel="noopener" aria-hidden="true" tabindex="-1">{t(lang, 'readArticle')} ↗</a>
      {#if ontoggle && relCount}
        <button type="button" class="rel-btn" aria-expanded={expanded} onclick={ontoggle}>
          {expanded ? t(lang, 'relatedHide') : `${t(lang, 'relatedNews')} ${relCount}`} <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
      {/if}
    </p>
    {#if n > 1}
      <div class="pager">
        <button type="button" class="pg" aria-label={t(lang, 'prevItem')} disabled={k === 0} onclick={() => (k = Math.max(0, k - 1))}>‹</button>
        <span class="tnum" aria-live="polite">{k + 1} / {n}</span>
        <button type="button" class="pg" aria-label={t(lang, 'nextItem')} disabled={k >= n - 1} onclick={() => (k = Math.min(n - 1, k + 1))}>›</button>
      </div>
    {/if}
  </div>
  {#if expanded}
    <div class="more">
      {#if tl.length}
        <p class="sub">{t(lang, 'facilityTimeline')}</p>
        <ol class="tl" aria-label={t(lang, 'facilityTimeline')}>
          {#each tl as d (d.x.link)}
            <li style:left="{d.pos * 100}%" class:cur={d.x.link === it.link}>
              <a href={d.x.link} target="_blank" rel="noopener" title={d.x.t}>
                <span class="dot" aria-hidden="true"></span>
                <span class="lab">{t(lang, `stg_${d.stage}` as Key)}</span>
                <span class="dt tnum">{d.x.date.slice(2).replaceAll('-', '/')}</span>
              </a>
            </li>
          {/each}
        </ol>
      {/if}
      <p class="sub">{t(lang, 'relatedNews')}</p>
      {#if related.length}
        <ul class="rel">
          {#each related as r (r.it.link)}
            <li class:hot={relHover === r.it.link} onpointerenter={() => (relHover = r.it.link)} onpointerleave={() => (relHover = null)}>
              <span class="why">{t(lang, `rs_${r.reason}` as Key)}</span>
              <a href={r.it.link} target="_blank" rel="noopener" onfocus={() => (relHover = r.it.link)} onblur={() => (relHover = null)}>{r.it.t}<span class="sr-only"> ({t(lang, 'newWindow')})</span></a>
              <span class="rd tnum">{fmtDate(lang, r.it.date)} · {r.it.srcName}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="none">{t(lang, 'relatedNone')}</p>
      {/if}
    </div>
  {/if}
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
  .nc { transition: opacity 0.15s ease; }
  .nc.dim { opacity: 0.45; }
  .nc.clickable { cursor: pointer; }
  .nc.expanded { cursor: default; overflow-y: auto; overflow-x: hidden; align-content: start; height: auto; }
  .rel-btn { margin-left: 10px; border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--ink-2);
             text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .more { grid-column: 1 / -1; border-top: 1px solid var(--line); padding-top: 6px; display: grid; gap: 4px; }
  .sub { margin: 4px 0 0; font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; color: var(--muted); }
  .tl { position: relative; list-style: none; margin: 4px 22px 4px; padding: 0; height: 44px; border-top: 2px solid var(--line-strong); top: 8px; }
  .tl li { position: absolute; top: -8px; transform: translateX(-50%); }
  .tl a { display: grid; justify-items: center; gap: 1px; color: var(--ink-2); text-decoration: none; font-size: 10px; line-height: 1.2; white-space: nowrap; }
  .tl .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface); border: 2px solid var(--ink-2); }
  .tl li.cur .dot { background: var(--ink); border-color: var(--ink); }
  .tl li.cur .lab { font-weight: 700; color: var(--ink); }
  .tl .dt { color: var(--muted); }
  .rel { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .rel li { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px; padding: 5px 6px; border-radius: 6px; }
  .rel li.hot { background: var(--surface-2); }
  .why { grid-row: span 2; align-self: start; font-size: 10px; font-weight: 600; color: var(--ink-2); border: 1px solid var(--line-strong);
         border-radius: 4px; padding: 0 4px; margin-top: 2px; white-space: nowrap; }
  .rel a { font-size: 12px; line-height: 1.35; color: var(--ink); text-decoration: none; overflow: hidden;
           display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .rel a:hover, .rel a:focus-visible { text-decoration: underline; }
  .rd { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .none { margin: 0; font-size: 11.5px; color: var(--muted); }
  .media { width: 76px; height: 76px; border-radius: 6px; overflow: hidden; background: var(--surface-2); display: grid; place-items: center; }
  .media img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph { font-size: 10.5px; line-height: 1.3; color: var(--muted); text-align: center; padding: 4px; }
  .body { min-width: 0; display: grid; align-content: start; gap: 3px; }
  .place { margin: 0; font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; padding-right: 18px; }
  .place-btn { border: 0; background: none; padding: 0; font: inherit; color: var(--ink-2); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .new { font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--ink); background: var(--surface); border: 1px solid var(--clay); border-radius: 3px; padding: 0 3px; }
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
