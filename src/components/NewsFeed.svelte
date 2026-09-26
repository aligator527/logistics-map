<script lang="ts" module>
  import type { Label } from '../lib/data';
  export interface NewsItem { t: string; link: string; date: string; src: string; topics: string[]; prefs: number[]; munis: string[]; ex?: string; img?: string | null }
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

  let { news, lang, pref, pname, onpref, srcName, topic, ontopic, onhover, onmap }: {
    news: News;
    lang: Lang;
    /** focused prefecture: its news first (0 = all of Japan) */
    pref: number;
    pname: (code: number) => string;
    onpref: (code: number) => void;
    srcName: (key: string) => string;
    /** topic filter (shared with the map) */
    topic: string;
    ontopic: (key: string) => void;
    /** pointer over an item: its place is highlighted on the map */
    onhover?: (it: NewsItem | null) => void;
    /** open the item's card on the map (when the news layer is on) */
    onmap?: (it: NewsItem) => void;
  } = $props();

  let open = $state(false);
  const fresh = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  let broken = $state<Record<string, boolean>>({});

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
    <button type="button" class="chip" aria-pressed={!topic} onclick={() => ontopic('')}>{t(lang, 'all')}</button>
    {#each news.topics as tp (tp.key)}
      <button type="button" class="chip" aria-pressed={topic === tp.key} onclick={() => ontopic(topic === tp.key ? '' : tp.key)}>{tp[lang]}</button>
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
        <li class:local={pref && it.prefs.includes(pref)} class:has-img={it.img && !broken[it.img]}
            onpointerenter={() => onhover?.(it)} onpointerleave={() => onhover?.(null)}>
          {#if it.img && !broken[it.img]}
            <img class="thumb" src={it.img} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
                 onerror={() => (broken = { ...broken, [it.img!]: true })} />
          {/if}
          <div class="txt">
          <a href={it.link} target="_blank" rel="noopener">{#if it.date >= fresh}<span class="new">NEW</span>{/if}{it.t}<span class="sr-only"> ({t(lang, 'newWindow')})</span></a>
          {#if it.ex}<p class="ex">{it.ex}</p>{/if}
          <span class="line">
            <time datetime={it.date}>{fmtDate(lang, it.date)}</time> · {srcName(it.src)}
            {#if onmap && (it.prefs.length || it.munis.length)}
              <button type="button" class="pref map" onclick={() => onmap!(it)}>{t(lang, 'newsOnMapBtn')}</button>
            {/if}
            {#each it.prefs.slice(0, 3) as p (p)}
              <button type="button" class="pref" onclick={() => onpref(p)}>{pname(p)}</button>
            {/each}
          </span>
          </div>
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
  li.has-img { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 10px; }
  .thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; background: var(--surface-2); }
  .txt { min-width: 0; }
  li a { font-size: 13.5px; line-height: 1.45; color: var(--ink); text-decoration: none; display: block; }
  .ex { margin: 2px 0 0; font-size: 12px; line-height: 1.45; color: var(--ink-2);
        display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .new { font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--bg); background: var(--clay); border-radius: 3px; padding: 0 4px; margin-right: 6px; vertical-align: 1px; }
  .pref.map { font-weight: 600; color: var(--ink); }
  li a:hover { text-decoration: underline; }
  .line { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; margin-top: 3px; font-size: 11.5px; color: var(--muted); }
  .pref {
    border: 1px solid var(--line-strong); background: none; border-radius: 4px; padding: 0 6px; font-size: 11px; color: var(--ink-2); min-height: 22px;
  }
  .pref:hover { border-color: var(--ink-2); }
  .src { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); }
</style>
