<script lang="ts">
  // Text with glossary terms marked: dotted underline, the definition on hover or keyboard focus.
  import { withTerms, type Term } from '../lib/glossary';
  import type { Lang } from '../lib/i18n';

  let { text, lang, focusable = true }: { text: string; lang: Lang; focusable?: boolean } = $props();
  const parts = $derived(withTerms(text, lang));
  const uid = Math.random().toString(36).slice(2, 8);
</script>

<!-- a term takes keyboard focus to show its definition, like a tooltip trigger (not inside buttons) -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
{#each parts as p, i (i)}{#if typeof p === 'string'}{p}{:else}{@const term = p as Term & { shown: string }}<span class="term" tabindex={focusable ? 0 : undefined} aria-describedby="g{uid}{i}">{term.shown}<span class="tip" role="tooltip" id="g{uid}{i}"><strong>{lang === 'ja' ? term.ja : `${term.en}（${term.ja}）`}</strong>{term.def[lang]}</span></span>{/if}{/each}

<style>
  .term { position: relative; text-decoration: underline dotted; text-underline-offset: 3px; text-decoration-color: var(--muted); cursor: help; }
  .term:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 2px; }
  .tip {
    display: none; position: absolute; left: 0; top: calc(100% + 6px); z-index: 60; width: max-content; max-width: min(300px, 80vw);
    background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); border-radius: 8px; box-shadow: var(--shadow);
    padding: 8px 10px; font-size: 12px; line-height: 1.5; font-weight: 400; white-space: normal; text-align: left;
  }
  .tip strong { display: block; font-size: 12px; margin-bottom: 2px; }
  .term:hover .tip, .term:focus .tip { display: block; }
</style>
