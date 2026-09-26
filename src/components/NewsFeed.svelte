<script lang="ts" module>
  import type { Label } from '../lib/data';
  export interface NewsItem { t: string; link: string; date: string; src: string; topics: string[]; prefs: number[] }
  export interface News {
    generated: string;
    sources: (Label & { key: string; url: string; terms: string })[];
    topics: (Label & { key: string })[];
    items: NewsItem[];
  }
</script>

<script lang="ts">
  import { fmtDate } from '../lib/data';
  import { t, type Lang } from '../lib/i18n';

  let { news, lang, pref, pname, onpref }: {
    news: News;
    lang: Lang;
    /** focused prefecture: its news first (0 = all of Japan) */
    pref: number;
    pname: (code: number) => string;
    onpref: (code: number) => void;
  } = $props();

  let topic = $state('');
  let open = $state(false);
  const srcName = (k: string) => news.sources.find((s) => s.key === k)?.[lang] ?? k;

  const list = $derived.by(() => {
    const byTopic = news.items.filter((it) => !topic || it.topics.includes(topic));
    if (!pref) return byTopic;
    // the prefecture's own news first, then the rest (policy news rarely names a prefecture)
    return [...byTopic.filter((it) => it.prefs.includes(pref)), ...byTopic.filter((it) => !it.prefs.includes(pref))];
  });
  const inPref = $derived(pref ? list.filter((it) => it.prefs.includes(pref)).length : 0);
  const shown = $derived(open ? list.slice(0, 40) : list.slice(0, 6));
</script>

<div class="news">
  <div class="chips" role="group" aria-label={t(lang, 'newsTopics')}>
    <button type="button" class="chip" aria-pressed={!topic} onclick={() => (topic = '')}>{t(lang, 'all')}</button>
    {#each news.topics as tp (tp.key)}
      <button type="button" class="chip" aria-pressed={topic === tp.key} onclick={() => (topic = topic === tp.key ? '' : tp.key)}>{tp[lang]}</button>
    {/each}
  </div>
  {#if pref}
    <p class="meta">{inPref ? `${pname(pref)}: ${inPref}${lang === 'ja' ? '件' : ` item${inPref > 1 ? 's' : ''}`}` : t(lang, 'newsNoPref')}</p>
  {/if}
  {#if !list.length}
    <p class="meta">{t(lang, 'newsEmpty')}</p>
  {:else}
    <ul>
      {#each shown as it (it.link)}
        <li class:local={pref && it.prefs.includes(pref)}>
          <a href={it.link} target="_blank" rel="noopener">{it.t}<span class="sr-only"> ({t(lang, 'newWindow')})</span></a>
          <span class="line">
            <time datetime={it.date}>{fmtDate(lang, it.date)}</time> · {srcName(it.src)}
            {#each it.prefs.slice(0, 3) as p (p)}
              <button type="button" class="pref" onclick={() => onpref(p)}>{pname(p)}</button>
            {/each}
          </span>
        </li>
      {/each}
    </ul>
    {#if list.length > 6}
      <button type="button" class="linkish" onclick={() => (open = !open)}>{open ? t(lang, 'showLess') : t(lang, 'showMore')}</button>
    {/if}
  {/if}
  <p class="src">
    {t(lang, 'newsNote')} {lang === 'ja' ? '更新' : 'Updated'} {fmtDate(lang, news.generated.slice(0, 10))}.
  </p>
</div>

<style>
  .news { display: grid; gap: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    min-height: 32px; padding: 0 10px; border-radius: 999px; font-size: 12.5px;
    border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2);
  }
  .chip[aria-pressed='true'] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .meta { margin: 0; font-size: 12px; color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  li { padding: 8px 0 8px 10px; border-bottom: 1px solid var(--line); border-left: 3px solid transparent; }
  li.local { border-left-color: var(--mark); }
  li a { font-size: 13.5px; line-height: 1.45; color: var(--ink); text-decoration: none; display: block; }
  li a:hover { text-decoration: underline; }
  .line { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; margin-top: 3px; font-size: 11.5px; color: var(--muted); }
  .pref {
    border: 1px solid var(--line-strong); background: none; border-radius: 4px; padding: 0 6px; font-size: 11px; color: var(--ink-2); min-height: 22px;
  }
  .pref:hover { border-color: var(--ink-2); }
  .src { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); }
</style>
