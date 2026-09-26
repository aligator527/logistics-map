<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { termsFor } from '../lib/glossary';
  const terms = $derived(termsFor(app.layer));
</script>

{#if terms.length}
  <section class="panel">
    <details class="glossary">
      <summary class="eyebrow">{t(app.lang, 'glossary')}（{terms.length}）</summary>
      <dl>
        {#each terms as g (g.ja)}
          <dt>{app.lang === 'ja' ? g.ja : g.en}{#if app.lang !== 'ja'}<span class="ja"> {g.ja}</span>{/if}</dt>
          <dd>{g.def[app.lang]}</dd>
        {/each}
      </dl>
    </details>
  </section>
{/if}

<style>
  .glossary summary { cursor: pointer; min-height: 32px; list-style-position: inside; }
  dl { margin: 6px 0 0; display: grid; gap: 2px 0; font-size: 12.5px; }
  dt { font-weight: 600; margin-top: 6px; }
  dt .ja { font-weight: 400; color: var(--muted); }
  dd { margin: 0; color: var(--ink-2); line-height: 1.5; }
</style>
