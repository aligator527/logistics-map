<script lang="ts" module>
  export interface DossierSection {
    title: string;
    rows?: [string, string][];
    list?: { label: string; value?: string; href?: string }[];
    note?: string;
  }
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t, type Lang } from '../lib/i18n';

  let { title, subtitle, sections, sources, lang, onclose }: {
    title: string;
    subtitle: string;
    sections: DossierSection[];
    sources: string[];
    lang: Lang;
    onclose: () => void;
  } = $props();

  let box: HTMLDivElement;
  let opener: Element | null = null;
  onMount(() => {
    opener = document.activeElement;
    tick().then(() => box?.querySelector<HTMLElement>('button')?.focus());
    return () => (opener as HTMLElement | null)?.focus?.();
  });
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { onclose(); return; }
    if (e.key !== 'Tab') return;
    // keep the focus inside the dialog
    const f = [...box.querySelectorAll<HTMLElement>('button, a[href]')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  const url = typeof location !== 'undefined' ? location.href : '';
  const today = new Date().toISOString().slice(0, 10);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="overlay dossier-root" role="dialog" aria-modal="true" aria-labelledby="dossier-title" tabindex="-1" bind:this={box} {onkeydown}>
  <div class="paper">
    <div class="bar no-print">
      <button type="button" class="btn" onclick={() => window.print()}>{t(lang, 'print')}</button>
      <button type="button" class="btn ghost" onclick={onclose}>{t(lang, 'close')}</button>
    </div>
    <header>
      <p class="kicker">{t(lang, 'title')} · {t(lang, 'dossier')}</p>
      <h2 id="dossier-title">{title}</h2>
      <p class="sub">{subtitle}</p>
      <p class="meta">{today} · <span class="url">{url}</span></p>
    </header>
    <div class="cols">
      {#each sections as s (s.title)}
        <section>
          <h3>{s.title}</h3>
          {#if s.rows?.length}
            <dl>
              {#each s.rows as [k, v] (k)}<dt>{k}</dt><dd class="tnum">{v}</dd>{/each}
            </dl>
          {/if}
          {#if s.list?.length}
            <ul>
              {#each s.list as it (it.label)}
                <li>{#if it.href}<a href={it.href} target="_blank" rel="noopener">{it.label}</a>{:else}{it.label}{/if}{#if it.value}<span class="tnum"> — {it.value}</span>{/if}</li>
              {/each}
            </ul>
          {/if}
          {#if s.note}<p class="note">{s.note}</p>{/if}
        </section>
      {/each}
    </div>
    <footer>
      <h3>{t(lang, 'sources')}</h3>
      <ul class="src">{#each sources as s (s)}<li>{s}</li>{/each}</ul>
      <p class="note">{t(lang, 'scoreCaveat')}</p>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 200; overflow: auto;
    background: color-mix(in oklab, var(--ink) 45%, transparent);
    padding: clamp(0px, 3vw, 32px);
  }
  .paper {
    max-width: 900px; margin: 0 auto; background: var(--surface); color: var(--ink);
    border-radius: var(--radius); box-shadow: var(--shadow); padding: clamp(16px, 4vw, 40px);
  }
  .bar { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 8px; }
  .kicker { margin: 0; font-size: 12px; color: var(--muted); letter-spacing: 0.04em; }
  h2 { margin: 4px 0 0; font-size: 24px; }
  .sub { margin: 4px 0 0; color: var(--ink-2); font-size: 14px; }
  .meta { margin: 6px 0 0; font-size: 11.5px; color: var(--muted); word-break: break-all; }
  .cols { columns: 2 320px; column-gap: 32px; margin-top: 20px; }
  section { break-inside: avoid; margin: 0 0 18px; }
  h3 { font-size: 13px; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 2px solid var(--ink); }
  dl { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; margin: 0; font-size: 12.5px; }
  dt { color: var(--ink-2); }
  dd { margin: 0; text-align: right; font-weight: 600; }
  ul { margin: 4px 0 0; padding-left: 18px; font-size: 12.5px; }
  li { margin: 2px 0; }
  .note { font-size: 11.5px; color: var(--muted); margin: 6px 0 0; }
  footer { border-top: 1px solid var(--line); margin-top: 8px; padding-top: 10px; }
  .src { font-size: 11px; color: var(--ink-2); }

  @media print {
    .overlay { position: static; background: none; padding: 0; overflow: visible; }
    .paper { box-shadow: none; max-width: none; padding: 0; background: #fff; color: #000; }
    .no-print { display: none; }
    h3 { border-color: #000; }
    a { color: #000; text-decoration: none; }
  }
</style>
