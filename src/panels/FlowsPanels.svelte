<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtPct } from '../lib/scale';
  import BarList from '../components/BarList.svelte';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const fl = $derived(s.fl!);
  const { pname, onpick } = s;
</script>

{#if app.layer === 'flows'}
  {#if p}
    {#each ['out', 'in'] as const as dir (dir)}
      {@const list = fl.partners(p, dir, 10)}
      <section class="panel">
        <p class="eyebrow">{tt(dir === 'out' ? 'topOut' : 'topIn')}</p>
        <BarList bars={list.map((x) => ({ key: String(x.code), label: pname(x.code), value: `${fl!.tons(x.v)} · ${fmtPct(L, x.share, 0)}`,
                                           pct: (x.v / (list[0]?.v || 1)) * 100, onclick: () => onpick(String(x.code)) }))} />
      </section>
    {/each}
  {:else}
    {@const pairs = fl.topPairs(10)}
    <section class="panel">
      <p class="eyebrow">{tt('topPairs')}</p>
      <BarList bars={pairs.map((x) => ({ key: `${x.o}-${x.d}`, label: `${pname(x.o)} → ${pname(x.d)}`, value: fl!.tons(x.v),
                                          pct: (x.v / (pairs[0]?.v || 1)) * 100, onclick: () => onpick(String(x.o)) }))} />
    </section>
  {/if}
{/if}
