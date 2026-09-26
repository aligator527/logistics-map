<script lang="ts">
  // Narrow maps: news cards in a swipeable strip under the map. The card in the middle is the
  // focused place (its point is ringed and linked to this strip); tapping a point scrolls to its card.
  import type { NewsGroup } from '../lib/newsmap';
  import { t, type Lang } from '../lib/i18n';
  import NewsCallout from './NewsCallout.svelte';
  import type { NewsLite, Related } from '../lib/related';

  let { groups, lang, focus, onfocus, onplace, open = null, ontoggle, relatedFor, timelineFor }: {
    groups: NewsGroup[];
    lang: Lang;
    focus: string | null;
    onfocus: (key: string) => void;
    onplace: (code: string) => void;
    /** card with its related news open (it grows downwards) */
    open?: string | null;
    ontoggle?: (key: string) => void;
    relatedFor?: (link: string) => Related[];
    timelineFor?: (link: string) => NewsLite[];
  } = $props();

  let strip: HTMLDivElement | undefined = $state();
  let fromScroll = false;
  // a tap on the map focuses a place: bring its card to the middle
  $effect(() => {
    const k = focus;
    if (!strip || !k || fromScroll) { fromScroll = false; return; }
    const el = strip.querySelector<HTMLElement>(`[data-key="${k}"]`);
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.clientWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
  });
  let timer = 0;
  function onscroll() {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!strip) return;
      const mid = strip.scrollLeft + strip.clientWidth / 2;
      let best: HTMLElement | null = null, bd = Infinity;
      for (const el of strip.querySelectorAll<HTMLElement>('[data-key]')) {
        const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - mid);
        if (d < bd) { bd = d; best = el; }
      }
      const k = best?.dataset.key;
      if (k && k !== focus) { fromScroll = true; onfocus(k); }
    }, 120);
  }
</script>

<section class="strip-wrap" aria-label={t(lang, 'news')}>
  <div class="strip" bind:this={strip} {onscroll} role="list">
    {#each groups as g (g.key)}
      <div class="slot" class:open={open === g.key} data-key={g.key} role="listitem">
        <NewsCallout group={g} {lang} active={focus === g.key} onplace={g.code ? onplace : undefined}
                     expanded={open === g.key} ontoggle={ontoggle ? () => { onfocus(g.key); ontoggle!(g.key); } : undefined} {relatedFor} {timelineFor} />
      </div>
    {/each}
  </div>
  <p class="hint">{t(lang, 'newsSwipe')}</p>
</section>

<style>
  .strip-wrap { display: grid; gap: 4px; }
  .strip {
    display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
    padding: 4px 2px 8px; scrollbar-width: thin;
  }
  .strip { align-items: flex-start; }
  .slot { flex: 0 0 min(86%, 340px); scroll-snap-align: center; height: 158px; }
  .slot.open { height: auto; max-height: 520px; }
  .hint { margin: 0; font-size: 11.5px; color: var(--muted); }
</style>
