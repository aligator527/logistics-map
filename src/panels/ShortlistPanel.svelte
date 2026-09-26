<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { live, WARN } from '../lib/live.svelte';
  import { shortlist, shared, shareLink, resolveShared, ptOf, plotRing, STATUSES, type ShortItem, type Status } from '../lib/shortlist.svelte';
  import { area as ringArea } from '../lib/measure.svelte';
  import { downloadCsv } from '../lib/csv';
  import { fmtNum, fmtCompact } from '../lib/scale';
  import { WARN_COLORS } from '../lib/warncolors';
  import type { DossierTable, DossierSection } from '../components/Dossier.svelte';
  import { pointInfo, groundRisk, addressAt, type PointInfo } from '../lib/pointinfo';
  import { estimate, costs, transport } from '../lib/costs.svelte';
  import { commuteFrom } from '../lib/labour';
  const statusName = (st: Status | undefined) => tt(`st_${st ?? 'cand'}` as Key);
  let noteOpen = $state<string | null>(null);
  let hideDropped = $state(false);
  const shown = $derived(shortlist.items.filter((it) => !(hideDropped && it.status === 'drop')));
  const plotArea = (it: ShortItem) => (it.kind === 'plot' ? ringArea(plotRing(it.code)) : NaN);
  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const p = $derived(app.pref);
  const lt = $derived(s.lt), msc = $derived(s.msc), sc = $derived(s.sc), nt = $derived(s.nt), muni = $derived(s.muni), hubs = $derived(s.hubs), sites = $derived(s.sites);
  const { pname, muniLabel } = s;
  // ------------------------------------------------------------ shortlist & CSV
  /** a point picked on the map: its municipality once known (reverse geocoded), else its coordinates */
  let pointMuni = $state.raw(new Map<string, string>());
  $effect(() => {
    for (const it of shortlist.items) {
      const pt = ptOf(it);
      if (!pt || pointMuni.has(pt)) continue;
      const [lon, lat] = pt.split(',').map(Number);
      addressAt(lon, lat).then((a) => (pointMuni = new Map(pointMuni).set(pt, a?.muni ?? ''))).catch(() => {});
    }
  });
  function shortLabel(it: ShortItem) {
    if (it.kind === 'plot') { const m = pointMuni.get(ptOf(it)!); return `${tt('plotKind')} ${fmtNum(L, plotArea(it) / 1e4, 2)} ha${m ? ` ${muniLabel(m)}` : ''}`; }
    if (it.kind === 'point') { const m = pointMuni.get(it.code); const [lon, lat] = it.code.split(','); return `${tt('pointKind')} ${m ? muniLabel(m) : ''} (${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)})`; }
    if (it.kind === 'pref') return pname(Number(it.code));
    if (it.kind === 'muni') return muniLabel(it.code);
    return sites[Number(it.code)]?.name ?? it.code;
  }
  const shortKind = (it: ShortItem) => tt(it.kind === 'pref' ? 'byPref' : it.kind === 'muni' ? 'byMuni' : it.kind === 'point' ? 'pointKind' : it.kind === 'plot' ? 'plotKind' : 'dplIn');
  /** live warning level at a shortlisted place (prefecture: its highest municipal level) */
  function shortAlert(it: ShortItem): { level: number; text: string } {
    if (!muni || !live.warnTime) return { level: 0, text: '' };
    const codes = it.kind === 'muni' ? [it.code] : it.kind === 'site' ? [sites[Number(it.code)]?.muni ?? ''] : ptOf(it) ? [pointMuni.get(ptOf(it)!) ?? '']
      : muni.codes.filter((c) => Number(c.slice(0, 2)) === Number(it.code));
    let level = 0, best = '';
    for (const c of codes) { const l = live.level(c, true); if (l > level) { level = l; best = c; } }
    const text = best ? (live.warnings.get(best) ?? []).filter((k) => (WARN[k]?.level ?? 0) >= 2).map((k) => WARN[k]?.[L] ?? k).join('・') : '';
    return { level, text: it.kind === 'pref' && best ? `${muniLabel(best)}: ${text}` : text };
  }
  function openShort(it: ShortItem) {
    app.stopCompare();
    if (it.kind === 'pref') { app.muni = ''; app.site = -1; app.pref = Number(it.code); }
    else if (it.kind === 'muni') { app.site = -1; app.pref = Number(it.code.slice(0, 2)); app.muni = it.code; }
    else if (it.kind === 'point' || it.kind === 'plot') {
      const [lon, lat] = ptOf(it)!.split(',').map(Number);
      if (it.kind === 'plot') {
        // frame the plot: a zoom level where it is a few hundred pixels across
        const r = plotRing(it.code), ext = Math.max(...r.map((q) => q[0])) - Math.min(...r.map((q) => q[0]));
        const metres = Math.max(30, ext * 111_000 * Math.cos((lat * Math.PI) / 180));
        app.mv = `${Math.max(12, Math.min(17.5, 17 - Math.log2(metres / 150))).toFixed(1)}/${lat.toFixed(5)}/${lon.toFixed(5)}`;
      }
      s.inspectLoading = true;
      pointInfo(lon, lat).then((x) => (s.inspect = x)).finally(() => (s.inspectLoading = false));
      const m = pointMuni.get(ptOf(it)!); if (m) { app.site = -1; app.pref = Number(m.slice(0, 2)); }
    }
    else { const i = Number(it.code); if (sites[i]) { app.site = i; app.pref = sites[i].pref; } }
  }
  function exportShortlist() {
    const lm = lt?.metrics ?? [];
    const head = ['kind', 'code', 'name', 'status', 'note', 'prefecture', ...(sc ? [tt('layerScore') + '（' + tt('byPref') + '）'] : []),
      ...(msc ? [tt('layerScore') + '（' + tt('byMuni') + '）'] : []), ...lm.map((m) => m[L]), tt('pop30'), tt('nearestIc'), tt('nearestAir')];
    const rows = shortlist.items.map((it) => {
      const pc = it.kind === 'pref' ? Number(it.code) : it.kind === 'muni' ? Number(it.code.slice(0, 2)) : sites[Number(it.code)]?.pref ?? 0;
      const mc = it.kind === 'muni' ? it.code : it.kind === 'site' ? sites[Number(it.code)]?.muni ?? '' : ptOf(it) ? pointMuni.get(ptOf(it)!) ?? '' : '';
      const mi = mc && lt ? lt.indexOf(mc) : -1;
      const ct = it.kind === 'site' ? muni?.sites[sites[Number(it.code)]?.name ?? ''] : undefined;
      const hb = it.kind === 'site' ? hubs?.sites[sites[Number(it.code)]?.name ?? '']?.air : undefined;
      return [it.kind, it.code, shortLabel(it), statusName(it.status), it.note ?? '', pname(pc), ...(sc ? [sc.result.total[pc - 1]?.toFixed(1)] : []),
        ...(msc ? [mi >= 0 && msc ? msc.result.total[msc.indexOf(mc)]?.toFixed(1) : ''] : []),
        ...lm.map((m) => (mi >= 0 ? m.get(mi) : '')), ct?.pop30 ?? '', ct ? `${ct.icName ?? ''} ${ct.ic ?? ''}` : '', hb ? `${hb.n} ${hb.km}` : ''];
    });
    downloadCsv(`shortlist-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows]);
  }

  // ------------------------------------------------------------ notifications (while the page is open)
  const canNotify = typeof Notification !== 'undefined';
  let notify = $state(canNotify && Notification.permission === 'granted' && (() => { try { return localStorage.getItem('notify') === '1'; } catch { return false; } })());
  async function toggleNotify() {
    if (!canNotify) return;
    if (notify) { notify = false; try { localStorage.setItem('notify', '0'); } catch { /* ignore */ } return; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    notify = p === 'granted';
    try { localStorage.setItem('notify', notify ? '1' : '0'); } catch { /* ignore */ }
  }
  /** last level seen per place: notify when it rises to a warning (L3) or above */
  const seen = new Map<string, number>();
  $effect(() => {
    if (!live.warnTime) return;
    for (const it of shortlist.items) {
      const a = shortAlert(it), key = it.kind + it.code, before = seen.get(key);
      seen.set(key, a.level);
      if (!notify || before === undefined || a.level <= before || a.level < 3) continue;
      const title = `${shortLabel(it)}：${nt?.levelName(a.level) ?? `L${a.level}`}`;
      const opts = { body: a.text, icon: './icon-192.png', tag: `lm-${key}` };
      const plain = () => { new Notification(title, opts); };
      // through the service worker when there is one (required on Android), else directly
      navigator.serviceWorker?.getRegistration().then((r) => { if (r) r.showNotification(title, opts); else plain(); }).catch(plain);
    }
  });

  // ------------------------------------------------------------ sharing
  let copied = $state(false);
  async function copyLink() {
    const url = shareLink(shortlist.items, (i) => sites[i]?.name);
    try { await navigator.clipboard.writeText(url); copied = true; setTimeout(() => (copied = false), 2500); }
    catch { prompt(tt('shareCopyPrompt'), url); }
  }
  const incoming = $derived(sites.length ? resolveShared(shared.tokens, (n) => sites.findIndex((x) => x.name === n)) : []);
  function takeShared(replace: boolean) { shortlist.addAll(incoming, replace); shared.tokens = []; }

  // ------------------------------------------------------------ side-by-side comparison (printable)
  let compareOpen = $state(false);
  // 意思決定レポート: the comparison plus the premises, the candidates' status and a picture of the map
  let report = $state<{ image: string } | null>(null);
  async function openReport() {
    let image = '';
    try {
      const el = document.querySelector<HTMLElement>('.mapcol .map');
      if (el) image = (await (await import('../lib/exporters')).renderMap(el)).toDataURL('image/jpeg', 0.85);
    } catch { /* the report works without the picture */ }
    report = { image };
    compareOpen = true;
  }
  const reportLead = $derived.by((): DossierSection[] => {
    if (!report) return [];
    const out: DossierSection[] = [];
    const scr = s.screened;
    const ci = costs.inputs;
    out.push({ title: tt('rpPremises'), rows: [
      [tt('rpView'), `${s.view?.legend.title ?? ''}`],
      ...(scr ? [[tt('screenTitle'), `${scr.steps.map((st) => `${st.label} ${st.rule.op === 'ge' ? '≥' : '≤'} ${lt?.metrics.find((m) => m.key === st.rule.key)?.fmt(st.rule.v) ?? st.rule.v}`).join(L === 'ja' ? '、' : ', ')} → ${fmtNum(L, scr.keep.size, 0)} / ${fmtNum(L, scr.total, 0)}`] as [string, string]] : []),
      [tt('rpRouting'), [app.peak ? tt('peakSpeed') : tt('rpDaytime'), app.ferries ? tt('ferries') : '', app.closures.length ? `${tt('closedCount')} ${app.closures.length}` : ''].filter(Boolean).join('・')],
      [tt('rpCost'), `${tt('costPlot')} ${fmtCompact(L, ci.plot)}㎡・${tt('costStaff')} ${ci.staff}・${tt('trRuns')} ${ci.runs}×${ci.days}${L === 'ja' ? '日' : ' days'}・${tt('trLoad')} ${ci.load}%`],
    ], note: tt('rpNote') });
    out.push({ title: tt('rpCandidates'), list: shortlist.items.map((it) => ({ label: `${shortLabel(it)}（${statusName(it.status)}）`, value: it.note ? it.note.replace(/\s+/g, ' ').slice(0, 80) : undefined })) });
    return out;
  });
  /** elevation and landform at the shortlisted DPL sites (fetched when the comparison opens) */
  let siteInfos = $state.raw(new Map<string, PointInfo>());
  $effect(() => {
    if (!compareOpen) return;
    for (const it of shortlist.items) {
      if (ptOf(it)) {
        const k = `pt:${ptOf(it)}`, [lon, lat] = ptOf(it)!.split(',').map(Number);
        if (!siteInfos.has(k)) pointInfo(lon, lat).then((i) => (siteInfos = new Map(siteInfos).set(k, i))).catch(() => {});
        continue;
      }
      const st = it.kind === 'site' ? sites[Number(it.code)] : null;
      if (!st || siteInfos.has(st.name)) continue;
      pointInfo(st.lon, st.lat).then((i) => (siteInfos = new Map(siteInfos).set(st.name, i))).catch(() => {});
    }
  });
  const median = (a: number[]) => { const v = a.filter(isFinite).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : NaN; };
  /** best column(s) of a row: highest (dir 1) or lowest (dir −1) finite value */
  const bestOf = (vals: number[], dir: 1 | -1 | undefined) => {
    if (!dir) return [];
    const f = vals.map((v, i) => ({ v, i })).filter((x) => isFinite(x.v));
    if (f.length < 2) return [];
    const b = dir === 1 ? Math.max(...f.map((x) => x.v)) : Math.min(...f.map((x) => x.v));
    return f.filter((x) => x.v === b).map((x) => x.i);
  };
  const compareTable = $derived.by((): DossierTable | null => {
    if (!compareOpen || !lt) return null;
    const items = shortlist.items;
    const muniOf = (it: ShortItem) => (it.kind === 'muni' ? it.code : it.kind === 'site' ? sites[Number(it.code)]?.muni ?? '' : ptOf(it) ? pointMuni.get(ptOf(it)!) ?? '' : '');
    const prefOf = (it: ShortItem) => (it.kind === 'pref' ? Number(it.code) : it.kind === 'site' ? sites[Number(it.code)]?.pref ?? 0 : Number((muniOf(it) || '0').slice(0, 2)));
    /** a local metric for an item: its municipality, or the median over a prefecture's municipalities */
    const metricOf = (it: ShortItem, get: (i: number) => number) => {
      if (it.kind === 'pref') return median(lt!.codes.map((c, i) => (Number(c.slice(0, 2)) === Number(it.code) ? get(i) : NaN)));
      const i = lt!.indexOf(muniOf(it));
      return i >= 0 ? get(i) : NaN;
    };
    const row = (label: string, vals: number[], fmt: (v: number) => string, dir?: 1 | -1) =>
      ({ label, cells: vals.map((v) => (isFinite(v) ? fmt(v) : '–')), best: bestOf(vals, dir) });
    const groups: DossierTable['groups'] = [];
    groups.push({ title: tt('cmpBasics'), rows: [
      { label: tt('cmpKind'), cells: items.map((it) => shortKind(it)) },
      { label: tt('status'), cells: items.map((it) => statusName(it.status)) },
      ...(items.some((it) => it.note) ? [{ label: tt('note'), cells: items.map((it) => it.note ?? '–') }] : []),
      { label: L === 'ja' ? '都道府県' : 'Prefecture', cells: items.map((it) => pname(prefOf(it))) },
      { label: L === 'ja' ? '市区町村' : 'Municipality', cells: items.map((it) => (muniOf(it) ? muniLabel(muniOf(it)) : '–')) },
      ...(sc ? [row(`${tt('layerScore')}（${tt('byPref')}）`, items.map((it) => sc!.result.total[prefOf(it) - 1] ?? NaN), (v) => fmtNum(L, v, 0), 1)] : []),
      ...(msc ? [row(`${tt('layerScore')}（${tt('byMuni')}）`, items.map((it) => metricOf(it, (i) => msc!.result.total[i])), (v) => fmtNum(L, v, 0), 1)] : []),
    ] });
    for (const g of ['people', 'demand', 'access', 'land', 'industry', 'labour', 'risk'] as const) {
      const ms = lt.metrics.filter((m) => m.group === g && m.key !== 'iso' && m.key !== 'shift');
      groups.push({ title: tt(`lg_${g}` as Key), rows: ms.map((m) => row(m[L], items.map((it) => metricOf(it, m.get)), m.fmt, m.better)) });
    }
    if (items.some((it) => it.kind === 'site' || !!ptOf(it))) {
      const ct = (it: ShortItem) => (it.kind === 'site' ? muni?.sites[sites[Number(it.code)]?.name ?? ''] : undefined);
      const hubsOf = (it: ShortItem) => (it.kind === 'site' ? Object.fromEntries(s.hubRows(sites[Number(it.code)]?.name ?? '')) : {});
      const hk = [...new Set(items.flatMap((it) => Object.keys(hubsOf(it))))];
      groups.push({ title: tt('cmpSite'), rows: [
        ...(items.some((it) => it.kind === 'plot') ? [row(tt('plotArea'), items.map(plotArea), (v) => `${fmtNum(L, v, 0)} m²（${fmtNum(L, v / (400 / 121), 0)}坪）`)] : []),
        row(tt('pop30'), items.map((it) => ct(it)?.pop30 ?? NaN), (v) => `${fmtCompact(L, v)}${L === 'ja' ? '人' : ''}`, 1),
        row(tt('nearestIc'), items.map((it) => ct(it)?.ic ?? NaN), (v) => `${fmtNum(L, v, 1)} km`, -1),
        ...hk.map((k) => ({ label: k, cells: items.map((it) => hubsOf(it)[k] ?? '–') })),
        ...(() => {
          const info = (it: ShortItem) => (it.kind === 'site' ? siteInfos.get(sites[Number(it.code)]?.name ?? '') : ptOf(it) ? siteInfos.get(`pt:${ptOf(it)}`) : undefined);
          const rank = { low: 1, mid: 2, high: 3 } as const;
          return [
            row(tt('elevation'), items.map((it) => info(it)?.elev ?? NaN), (v) => `${fmtNum(L, v, 1)} m`, 1),
            { label: tt('landformNatural'), cells: items.map((it) => (it.kind === 'site' || ptOf(it) ? info(it)?.natural?.[L] ?? '…' : '–')) },
            { label: tt('landformArtificial'), cells: items.map((it) => (it.kind === 'site' || ptOf(it) ? (info(it) ? info(it)!.artificial?.[L] ?? '–' : '…') : '–')) },
            { ...row(tt('groundRisk'), items.map((it) => { const i = info(it); const r = i ? groundRisk(i) : null; return r ? rank[r] : NaN; }),
                (v) => tt(v === 1 ? 'risk_low' : v === 2 ? 'risk_mid' : 'risk_high'), -1) },
          ];
        })(),
      ] });
    }
    {
      // コスト試算 with the assumptions set in the cost panel
      // a plot's own area replaces the assumed plot size
      const est = items.map((it) => { const mc = muniOf(it); return mc ? estimate(lt!.indexOf(mc), it.kind === 'plot' ? { ...costs.inputs, plot: plotArea(it) } : costs.inputs) : null; });
      const oku = (y: number) => (L === 'ja' ? `${fmtNum(L, y / 1e8, 1)}億円` : `¥${fmtNum(L, y / 1e6, 0)}m`);
      groups.push({ title: tt('costTitle'), rows: [
        row(tt('costLand'), est.map((e) => e?.land ?? NaN), oku, -1),
        row(tt('costStaffYear'), est.map((e) => e?.staff ?? NaN), oku, -1),
        row(tt('costFuelYear'), est.map((e) => e?.fuel ?? NaN), oku, -1),
        ...(() => {
          const trs = items.map((it) => { const mc = muniOf(it); return mc ? transport(lt!.indexOf(mc)) : null; });
          return trs.some((x) => x) ? [
            row(tt('trYearly'), trs.map((x) => x?.yearly ?? NaN), oku, -1),
            row(tt('trPerRun'), trs.map((x) => x?.km ?? NaN), (v) => `${fmtNum(L, v, 0)} km`, -1),
            row(tt('trCo2'), trs.map((x) => (x ? x.co2 / 1000 : NaN)), (v) => `${fmtNum(L, v, 0)} t`, -1),
            ...(() => {
              // labour: transport / handling workers within a 30-minute drive, from each candidate's municipality
              const r = lt!.router ? lt!.rt() : null;
              const cm = items.map((it) => { const mc = muniOf(it); const i = mc ? lt!.indexOf(mc) : -1; return r && i >= 0 ? commuteFrom(r.toMunis([r.muni(i)]))?.[1] ?? null : null; });
              return [row(`${tt('commuteTitle')} 30${L === 'ja' ? '分' : ' min'}`, cm.map((c) => c?.workers ?? NaN), (v) => `${fmtCompact(L, v)}${L === 'ja' ? '人' : ''}`, 1)];
            })(),
          ] : [];
        })(),
      ] });
    }
    if (live.warnTime) groups.push({ title: tt('cmpLive'), rows: [{ label: tt('liveWarn'), cells: items.map((it) => { const a = shortAlert(it); return a.level >= 2 ? `${nt?.levelName(a.level) ?? a.level}：${a.text}` : '–'; }) }] });
    return { head: items.map((it) => shortLabel(it)), groups };
  });
  const compareSources = $derived(muni ? [...new Set(Object.values(muni.sources).map((x) => x[L]))] : []);

</script>

<section class="panel">
  <div class="head-row">
    <p class="eyebrow">{tt('shortlist')}{shortlist.items.length ? `（${shortlist.items.length}）` : ''}</p>
    {#if shortlist.items.length}
      <span class="acts">
        <button type="button" class="linkish" onclick={() => (compareOpen = true)}>{tt('compareShort')}</button>
        <button type="button" class="linkish" onclick={openReport}>{tt('rpTitle')}</button>
        <button type="button" class="linkish" onclick={copyLink}>{copied ? tt('shareCopied') : tt('shareLink')}</button>
        {#if canNotify}<button type="button" class="linkish" aria-pressed={notify} onclick={toggleNotify} title={tt('notifyHint')}>{notify ? tt('notifyOn') : tt('notifyOff')}</button>{/if}
        <button type="button" class="linkish" onclick={exportShortlist}>{tt('exportCsv')}</button>
        <button type="button" class="linkish" onclick={() => shortlist.clear()}>{tt('clearAll')}</button>
      </span>
    {/if}
  </div>
  {#if incoming.length}
    <div class="shared" role="status">
      <p>{tt('sharedList')}（{incoming.length}）: {incoming.slice(0, 4).map((x) => shortLabel(x)).join(L === 'ja' ? '、' : ', ')}{incoming.length > 4 ? '…' : ''}</p>
      <p class="acts">
        <button type="button" class="btn" onclick={() => takeShared(false)}>{tt('sharedAdd')}</button>
        {#if shortlist.items.length}<button type="button" class="btn" onclick={() => takeShared(true)}>{tt('sharedReplace')}</button>{/if}
        <button type="button" class="btn ghost" onclick={() => (shared.tokens = [])}>{tt('close')}</button>
      </p>
    </div>
  {/if}
  {#if shortlist.items.length}
    {@const alerts = shortlist.items.map((it) => shortAlert(it)).filter((a) => a.level >= 2)}
    {#if live.warnTime}
      <p class="alert-line" class:hot={alerts.some((a) => a.level >= 3)} role="status">
        {alerts.length ? `${tt('shortAlert')}：${alerts.length}` : tt('shortAlertNone')}
        {#if alerts.length}<button type="button" class="linkish" onclick={() => { app.layer = 'now'; app.nmet = 'warn'; }}>{tt('layerNow')} →</button>{/if}
      </p>
    {/if}
    {#if shortlist.items.some((it) => it.status === 'drop')}
      <label class="chk small"><input type="checkbox" bind:checked={hideDropped} /> {tt('hideDropped')}</label>
    {/if}
    <ul class="short">
      {#each shown as it (it.kind + it.code)}
        {@const al = shortAlert(it)}
        {@const key = it.kind + it.code}
        <li class="st-{it.status ?? 'cand'}">
          <button type="button" class="linkish" onclick={() => openShort(it)}>{shortLabel(it)}
            {#if al.level >= 2}<span class="lv-chip" style:background={WARN_COLORS[app.dark ? 'dark' : 'light'][al.level - 1]} class:inv={al.level >= 3}
                                    title={al.text}>{nt?.levelName(al.level) ?? ''}</span>{/if}</button>
          <span class="kind">{shortKind(it)}</span>
          <button type="button" class="btn ghost x" aria-label={tt('remove')} onclick={() => shortlist.toggle(it.kind, it.code)}>×</button>
          <div class="meta-row">
            <select class="st" value={it.status ?? 'cand'} aria-label={`${tt('status')}: ${shortLabel(it)}`}
                    onchange={(e) => shortlist.setStatus(it, e.currentTarget.value as Status)}>
              {#each STATUSES as st (st)}<option value={st}>{statusName(st)}</option>{/each}
            </select>
            <button type="button" class="linkish note-btn" aria-expanded={noteOpen === key} onclick={() => (noteOpen = noteOpen === key ? null : key)}>
              ✎ {it.note ? it.note.split('\n')[0].slice(0, 28) + (it.note.length > 28 ? '…' : '') : tt('addNote')}</button>
          </div>
          {#if noteOpen === key}
            <textarea class="note" rows="3" placeholder={tt('notePlaceholder')} aria-label={`${tt('note')}: ${shortLabel(it)}`}
                      value={it.note ?? ''} onchange={(e) => shortlist.setNote(it, e.currentTarget.value)}></textarea>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="src">{tt('shortEmpty')}</p>
  {/if}
</section>
{#if compareOpen && compareTable}
  {#await import('../components/Dossier.svelte') then { default: Dossier }}
  {#if report}
    <Dossier title={tt('rpTitle')} subtitle={tt('rpSub')} sections={[]} lead={reportLead} image={report.image} table={compareTable}
             sources={compareSources} lang={L} onclose={() => { compareOpen = false; report = null; }} />
  {:else}
    <Dossier title={tt('compareShortTitle')} subtitle={tt('compareShortSub')} sections={[]} table={compareTable}
             sources={compareSources} lang={L} onclose={() => (compareOpen = false)} />
  {/if}
  {/await}
{/if}

<style>
  .shared { border: 1px solid var(--line-strong); border-left: 3px solid var(--blue); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 13px; }
  .shared p { margin: 0; }
  .meta-row { grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; margin: -2px 0 6px; }
  .st { font-size: 12px; min-height: 26px; padding: 0 4px; border-radius: 4px; }
  .note-btn { font-size: 12px; color: var(--ink-2); text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; }
  .note { grid-column: 1 / -1; width: 100%; font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); color: var(--ink); margin-bottom: 8px; resize: vertical; }
  li.st-drop :global(.linkish:first-child) { text-decoration: line-through; color: var(--muted); }
  li.st-nego .st, li.st-survey .st { border-color: var(--blue); }
  .shared .acts { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
</style>
