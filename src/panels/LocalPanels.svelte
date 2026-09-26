<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtCompact, fmtMinutes } from '../lib/scale';
  import BarList from '../components/BarList.svelte';
  import MuniProfile from '../components/MuniProfile.svelte';
  import ComparePanel from '../components/ComparePanel.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { shortlist } from '../lib/shortlist.svelte';
  import SimPanel from './SimPanel.svelte';
  import CostPanel from './CostPanel.svelte';
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const lt = $derived(s.lt), muni = $derived(s.muni), localLevel = $derived(s.localLevel), names = $derived(s.names), sites = $derived(s.sites);
  const { pname, muniLabel, onpick, originName } = s;
  /** which side-panel tab is showing */
  let { part }: { part: 'overview' | 'metrics' | 'calc' } = $props();
</script>

{#if localLevel && lt}
  {#if part === 'calc'}
  {#if app.lmet === 'iso' || app.lmet === 'shift' || app.iso}
    {@const kind = app.iso.startsWith('net:') ? app.iso : 'one'}
    <section class="panel">
      <div class="head-row">
        <p class="eyebrow">{tt('isoTitle')}{lt.originKey ? ` · ${originName(lt.originKey)}` : ''}</p>
        {#if app.iso}<button type="button" class="linkish" onclick={() => (app.iso = '')}>{tt('isoClear')}</button>{/if}
      </div>
      <div class="reach-ctl">
        <Segmented label={tt('originKind')} value={kind}
                   options={[{ value: 'one', label: tt('originOne') }, { value: 'net:dpl', label: tt('originDpl') },
                             { value: 'net:short', label: `${tt('originShort')}（${shortlist.items.filter((x) => x.kind !== 'pref').length}）` }]}
                   onchange={(v) => (app.iso = v === 'one' ? '' : v)} />
        <Segmented label={tt('isoShow')} value={app.lmet === 'shift' ? 'shift' : 'iso'}
                   options={[{ value: 'iso', label: tt('layerTime') }, { value: 'shift', label: tt('trip2024') }]}
                   onchange={(v) => (app.lmet = v)} />
        <div class="reach-btns">
          <button type="button" class="btn chip" aria-pressed={s.pickArmed} onclick={() => (s.pickArmed = !s.pickArmed)}>
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 13.5S1 8.6 1 5.4a5 5 0 0 1 10 0C11 8.6 6 13.5 6 13.5z" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="6" cy="5.4" r="1.7" fill="currentColor" /></svg>
            {tt('pickOnMap')}</button>
          <button type="button" class="btn chip" aria-pressed={app.igrid} onclick={() => (app.igrid = !app.igrid)}>{tt('gridView')}</button>
          <button type="button" class="btn chip" aria-pressed={app.ferries} onclick={() => (app.ferries = !app.ferries)} title={tt('ferriesHint')}>{tt('ferries')}</button>
        </div>
        {#if s.pickArmed}<p class="src" role="status">{s.gridLoading ? tt('gridLoading') : tt('pickOnMapHint')}</p>
        {:else if app.igrid && s.gridLoading}<p class="src" role="status">{tt('gridLoading')}</p>{/if}
      </div>
      {#if !lt.router}
        <p class="src" role="status">{tt('loadingNetwork')}</p>
      {:else if !lt.isoTimes}
        <p class="src">{tt('isoPick')}</p>
      {:else}
        {@const ip = lt.isoPop ?? []}
        {@const top = Math.max(...ip.map((x) => x.pop), 1)}
        <p class="sub-eyebrow">{tt('isoPop')}{lt.gridTimes ? '（1km）' : ''}</p>
        <BarList ranked={false} bars={ip.map((x) => ({ key: String(x.lim), label: `${fmtMinutes(L, x.lim)} ${tt('isoWithin')}`,
                                                     value: `${fmtCompact(L, x.pop)}${L === 'ja' ? '人' : ''}`, pct: (x.pop / top) * 100 }))} />
        {#if lt.tripPop}
          {@const tp = lt.tripPop}
          {@const tot = tp[0] + tp[1] + tp[2] || 1}
          <p class="sub-eyebrow">{tt('tripTitle')}</p>
          <ul class="trips">
            {#each tp as v, i (i)}
              <li><span class="sw" style:background={lt.tripColors[i]}></span>{tt(i === 0 ? 'trip1' : i === 1 ? 'trip2' : 'trip3')}
                <strong class="tnum">{fmtCompact(L, v)}{L === 'ja' ? '人' : ''}</strong> <span class="small">{Math.round((v / tot) * 100)}%</span></li>
            {/each}
          </ul>
        {/if}
        {#if lt.isNetwork}
          {#if lt.gaps.length}
            <p class="sub-eyebrow">{tt('gapsTitle')}</p>
            <BarList ranked={false} bars={lt.gaps.map((x) => ({ key: x.c, label: muniLabel(x.c), value: isFinite(x.t) ? fmtMinutes(L, x.t) : tt('noRoad'),
                                                              pct: (x.pop / (lt!.gaps[0]?.pop || 1)) * 100, onclick: () => onpick(x.c) }))} />
          {/if}
        {:else}
          {@const st = lt.router.toPlaces(lt.originPlaces(lt.originKey), sites.map((x) => lt!.router!.poi(`site:${x.name}`) ?? { ll: [0, 0] as [number, number], comp: -9, acc: [] }))}
          <p class="sub-eyebrow">{tt('isoDpl')}</p>
          <ul class="lvls">
            {#each [30, 60, 120] as lim (lim)}<li>{fmtMinutes(L, lim)} <strong class="tnum">{st.filter((x) => x <= lim).length}</strong></li>{/each}
          </ul>
          <p class="sub-eyebrow">{tt('isoHubs')}</p>
          <ul class="plain">
            {#each [['port', 'tPortHub'], ['air', 'tAirHub'], ['rail', 'tRailHub']] as const as [g, key] (g)}
              {@const hs = lt.hubsFrom(lt.originKey, g, 2)}
              <li><span class="small">{tt(key)}</span> {hs.length ? hs.map((h) => `${h.name} ${fmtMinutes(L, h.t)}`).join('、') : tt('noRoad')}</li>
            {/each}
          </ul>
        {/if}
      {/if}
      <p class="src note">{tt('isoNote')} {#if app.lmet === 'shift'}{tt('tripNote')} {/if}<a href={lt.router?.net.source.url ?? '#sources'}>{lt.router?.net.source[L] ?? ''}</a></p>
    </section>
  {/if}
  {#if !(app.lmet === 'iso' || app.lmet === 'shift' || app.iso)}
    <section class="panel">
      <p class="eyebrow">{tt('isoTitle')}</p>
      <p class="help">{tt('calcIntro')}</p>
      <p class="memo">
        <button type="button" class="btn" onclick={() => { app.lmet = 'iso'; if (app.muni) app.iso = `muni:${app.muni}`; }}>{tt(app.muni ? 'isoFrom' : 'showIso')}</button>
      </p>
    </section>
  {/if}
  <CostPanel />
  <SimPanel />
  {/if}
  {#if part === 'metrics' && app.muni && lt.indexOf(app.muni) >= 0}
    <section class="panel">
      <p class="eyebrow">{tt('profile')} · {muniLabel(app.muni)}</p>
      <MuniProfile rows={lt.profile(app.muni)} lang={L} current={app.lmet} onmetric={(k) => (app.lmet = k)} />
    </section>
  {/if}
  {#if part === 'metrics' && !(app.muni && lt.indexOf(app.muni) >= 0)}
    <section class="panel"><p class="help">{tt('pickMuniForMetrics')}</p></section>
  {/if}
  {#if part === 'overview' && (app.ma || app.mb)}
    <section class="panel">
      <p class="eyebrow">{tt('compareMunis')}</p>
      <ComparePanel {names} lang={L} a={1} b={2} rows={lt.compareRows}
                    labels={[app.ma ? muniLabel(app.ma) : '', app.mb ? muniLabel(app.mb) : '']}
                    onset={() => {}} onswap={() => ([app.ma, app.mb] = [app.mb, app.ma])}
                    onclear={(slot) => (slot === 'a' ? (app.ma = '') : (app.mb = ''))} />
    </section>
  {/if}
  {#if part === 'overview'}
  {@const met = lt.metric}
  {@const topM = lt.codes.map((c, i) => ({ c, v: lt!.raw[i] })).filter((x) => isFinite(x.v) && (!p || Number(x.c.slice(0, 2)) === p))
    .sort((a, b) => (met.better === -1 ? a.v - b.v : b.v - a.v) || (muni?.m.pop[lt!.indexOf(b.c)] ?? 0) - (muni?.m.pop[lt!.indexOf(a.c)] ?? 0)).slice(0, 10)}
  <section class="panel">
    <p class="eyebrow">{tt('topMunis')}{p ? ` · ${pname(p)}` : ''} · {met[L]}</p>
    <BarList bars={topM.map((x) => ({ key: x.c, label: muniLabel(x.c), value: met.fmt(x.v),
                                      pct: (Math.abs(x.v) / Math.max(...topM.map((y) => Math.abs(y.v)), 1e-9)) * 100, neg: x.v < 0, onclick: () => onpick(x.c) }))} />
  </section>
  {/if}
{/if}
