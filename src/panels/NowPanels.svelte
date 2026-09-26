<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { live, WARN, INT_COLOR } from '../lib/live.svelte';
  import { WARN_COLORS } from '../lib/warncolors';
  import { project as projectLL } from '../lib/project';
  import { pad2 } from '../themes/types';
  import BarList from '../components/BarList.svelte';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const nt = $derived(s.nt), muni = $derived(s.muni), diesel = $derived(s.diesel), geo = $derived(s.geo);
  const { pname, muniLabel, onpick } = s;
</script>

{#if app.layer === 'now' && nt}
  {#if nt.isWarn}
    {@const lv = (muni?.codes ?? []).map((c) => ({ c, v: live.level(c, app.nlog) })).filter((x) => x.v > 0 && (!p || Number(x.c.slice(0, 2)) === p))}
    <section class="panel">
      <div class="head-row">
        <p class="eyebrow">{tt('warnCounts')}{p ? ` · ${pname(p)}` : ''}</p>
        <span class="small" role="status">{live.loading ? '…' : live.warnTime ? `${tt('liveUpdated')} ${new Date(live.warnTime).toLocaleTimeString(L === 'ja' ? 'ja-JP' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      </div>
      {#if live.error}<p class="src">{tt('liveError')}: {live.error}</p>{/if}
      <ul class="lvls">
        {#each [5, 4, 3, 2] as l (l)}
          <li><span class="lv-sw" style:background={nt.categories?.[l - 1]?.color}></span>{nt.levelName(l)} <strong class="tnum">{lv.filter((x) => x.v === l).length}</strong></li>
        {/each}
      </ul>
      <BarList ranked={false} bars={lv.filter((x) => x.v >= 3).sort((a, b) => b.v - a.v || a.c.localeCompare(b.c)).slice(0, 15).map((x) => ({
        key: x.c, label: muniLabel(x.c),
        value: nt!.kinds(x.c).filter((k) => (WARN[k]?.level ?? 2) >= 3).map((k) => WARN[k]?.[L] ?? k).join('・'),
        pct: (x.v / 5) * 100, onclick: () => onpick(x.c) }))} />
      <p class="src note">{tt('warnHint')}</p>
    </section>
  {:else if diesel}
    {@const k = diesel.dates.length - 1}
    {@const order = Array.from({ length: 47 }, (_, i) => i + 1).filter((c) => isFinite(nt!.price(c))).sort((a, b) => nt!.price(b) - nt!.price(a))}
    <section class="panel">
      <p class="eyebrow">{tt('diesel')} · {diesel.dates[k]}</p>
      <BarList bars={[...order.slice(0, 5), ...order.slice(-5)].map((c) => ({ key: String(c), label: pname(c), value: `${nt!.yen(nt!.price(c))} (${nt!.signedYen(nt!.change(c, 1))})`,
                                                                                 pct: ((nt!.price(c) - nt!.price(order.at(-1)!) + 1) / (nt!.price(order[0]) - nt!.price(order.at(-1)!) + 1)) * 100, onclick: () => onpick(pad2(c)) }))} />
      <p class="src note">{tt('dieselStale')}</p>
    </section>
  {/if}
  <section class="panel">
    <p class="eyebrow">{tt('riversTitle')}</p>
    {#if live.rivers.length}
      <ul class="plain">
        {#each live.rivers as r (r.river + r.name)}
          <li><span class="lv-chip" class:inv={r.level >= 3} style:background={WARN_COLORS[app.dark ? 'dark' : 'light'][r.level - 1]}>L{r.level}</span>
            <strong>{r.river}</strong> — {r.name} · {new Date(r.at).toLocaleString(L === 'ja' ? 'ja-JP' : 'en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {#if r.munis.length}<span class="small">（{r.munis.slice(0, 4).map((c) => muniLabel(c)).join('、')}{r.munis.length > 4 ? ` ほか${r.munis.length - 4}` : ''}）</span>{/if}</li>
        {/each}
      </ul>
    {:else}<p class="src">{tt('riversNone')}</p>{/if}
    <p class="src note">{tt('riversNote')}</p>
  </section>
  <section class="panel">
    <p class="eyebrow">{tt('typhoon')}</p>
    {#if live.typhoons.length}
      <ul class="plain">
        {#each live.typhoons as t (t.id)}
          <li><strong>{tt('typhoon')} {Number(t.number.slice(2)) || ''}{L === 'ja' ? '号' : ''} {t.name[L === 'ja' ? 'jp' : 'en']}</strong> — {t.location}, {t.pressure} hPa,
            {L === 'ja' ? '最大風速' : 'max wind'} {t.wind} m/s, {t.course}{t.speed ? ` ${t.speed} km/h` : ''}{t.galeKm ? ` · ${tt('galeArea')} ${t.galeKm} km` : ''}
            {#if t.pos && geo && projectLL(t.pos[1], t.pos[0], geo.layout).space === 'outside'}<span class="small">（{tt('offMap')}）</span>{/if}</li>
        {/each}
      </ul>
    {:else}<p class="src">{tt('noTyphoon')}</p>{/if}
  </section>
  <section class="panel">
    <p class="eyebrow">{tt('quakes')}</p>
    {#if live.quakes.length}
      <ul class="plain">
        {#each live.quakes.slice(0, 10) as q (q.eid)}
          <li><span class="int" style:background={INT_COLOR[q.maxi]?.[0]} style:color={INT_COLOR[q.maxi]?.[1]}>{q.maxi.replace('-', '弱').replace('+', '強')}</span>
            {q.name} · {new Date(q.at).toLocaleString(L === 'ja' ? 'ja-JP' : 'en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{q.mag !== null ? ` · M${q.mag}` : ''}</li>
        {/each}
      </ul>
    {:else}<p class="src">{tt('noQuakes')}</p>{/if}
    <p class="src note">{tt('jmaSource')}</p>
  </section>
{/if}
