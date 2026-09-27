<script lang="ts">
  // 経路と中継: the quickest path from the reach origin to the selected municipality, the trunk roads on it, and —
  // when the run does not fit in a shift — a relay point near half-way where two drivers could swap loads.
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtMinutes, fmtNum } from '../lib/scale';
  import { tripClass } from '../lib/trips';

  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const lt = $derived(s.lt);
  const rt = $derived(lt?.routeToMuni ?? null);
  /** common names first for the trunk routes whose N06 names are the legal ones */
  const COMMON: Record<string, { ja: string; en: string }> = {
    第一東海自動車道: { ja: '東名高速', en: 'Tomei' }, 第二東海自動車道: { ja: '新東名高速', en: 'Shin-Tomei' },
    中央自動車道西宮線: { ja: '中央道・名神', en: 'Chuo / Meishin' }, 中央自動車道富士吉田線: { ja: '中央道', en: 'Chuo' },
    東北縦貫自動車道弘前線: { ja: '東北道', en: 'Tohoku' }, 関越自動車道新潟線: { ja: '関越道', en: 'Kan-etsu' },
    山陽自動車道吹田山口線: { ja: '山陽道', en: 'Sanyo' }, 中国縦貫自動車道: { ja: '中国道', en: 'Chugoku' },
    九州縦貫自動車道鹿児島線: { ja: '九州道', en: 'Kyushu' }, 近畿自動車道名古屋大阪線: { ja: '東名阪・新名神', en: 'Higashi-Meihan / Shin-Meishin' },
    近畿自動車道名古屋神戸線: { ja: '伊勢湾岸道・新名神', en: 'Isewangan / Shin-Meishin' }, 北海道縦貫自動車道函館名寄線: { ja: '道央道', en: 'Do-o' },
    常磐自動車道: { ja: '常磐道', en: 'Joban' }, 北陸自動車道: { ja: '北陸道', en: 'Hokuriku' }, 東海北陸自動車道: { ja: '東海北陸道', en: 'Tokai-Hokuriku' },
  };
  const roadName = (n: string) => (n === 'ferry' ? tt('ferries') : !n ? tt('ordinaryRoad') : COMMON[n.replace(/・/g, '')] ? `${COMMON[n.replace(/・/g, '')][L]}（${n}）` : n);
</script>

{#if lt && app.muni && lt.originKey && !lt.isNetwork}
  <section class="panel">
    <p class="eyebrow">{tt('routeTitle')} · {s.originName(lt.originKey)} → {s.muniLabel(app.muni)}</p>
    {#if !rt}
      <p class="help">{lt.originKey === `muni:${app.muni}` ? tt('routeSame') : tt('noRoad')}</p>
    {:else}
      {@const cls = tripClass(rt.t)}
      <p class="kpi-sub"><strong class="tnum">{fmtMinutes(L, rt.t)}</strong> · <strong class="tnum">{fmtNum(L, rt.km, 0)} km</strong> · {tt(`trip${cls}` as Key)}</p>
      {#if rt.roads.length}
        <ol class="roads">
          {#each rt.roads as r, k (k)}<li>{roadName(r.name)} <span class="tnum small">{r.ferry ? '' : `${fmtNum(L, r.km, 0)} km`}</span></li>{/each}
        </ol>
      {:else if rt.direct}<p class="help">{tt('routeDirect')}</p>{/if}
      {#if rt.relays.length}
        {@const legs = [0, ...rt.relays.map((x) => x.t), rt.t]}
        {@const ok = legs.slice(1).every((x, k) => tripClass(x - legs[k]) === 1)}
        <div class="relay">
          <p><strong>{tt('relayTitle')}</strong>（{rt.relays.length}）</p>
          <ol>
            {#each rt.relays as x, k (x.node)}<li>{lt.router?.net.nodeName?.[x.node] ?? ''} <span class="tnum small">（{tt('relayFrom')} {fmtMinutes(L, x.t)} · {tt('relayLeg')} {fmtMinutes(L, x.t - legs[k])}）</span></li>{/each}
          </ol>
          <p class="small">{ok ? tt(rt.relays.length === 1 ? 'relayOk' : 'relayOkN') : tt('relayNotEnough')}</p>
        </div>
      {/if}
      <p class="src">{tt('routeNote')}</p>
    {/if}
  </section>
{/if}

<style>
  .roads { margin: 6px 0 8px; padding-left: 20px; font-size: 13px; display: grid; gap: 2px; }
  .relay { border-left: 3px solid var(--accent); padding: 6px 10px; background: var(--surface); border-radius: 0 6px 6px 0; font-size: 13px; margin: 6px 0; }
  .relay p { margin: 0; }
  .relay ol { margin: 4px 0; padding-left: 18px; }
</style>
