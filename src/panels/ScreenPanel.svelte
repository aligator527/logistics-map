<script lang="ts">
  // 絞り込み: hard conditions on municipal metrics, applied in turn (a funnel); the map greys out the rest.
  import { app, type ScreenRule } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';
  import { t, type Key } from '../lib/i18n';
  import { fmtNum } from '../lib/scale';
  import { shortlist } from '../lib/shortlist.svelte';

  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  const lt = $derived(s.lt), res = $derived(s.screened);
  const { muniLabel, onpick } = s;

  /** metrics a threshold makes sense for (not the trip categories) */
  const usable = $derived(lt ? lt.metrics.filter((m) => !m.category) : []);
  const byKey = $derived(new Map(usable.map((m) => [m.key, m])));
  /** sorted finite values of a metric, for the slider (it moves along the distribution, not the raw scale) */
  const sortedCache = new Map<string, Float64Array>();
  function sorted(key: string) {
    const m = byKey.get(key);
    if (!m || !lt) return new Float64Array();
    const ck = `${key}|${lt.originKey ?? ''}`;
    let a = sortedCache.get(ck);
    if (!a) { a = Float64Array.from(lt.codes.map((_, i) => m.get(i)).filter(isFinite)).sort(); sortedCache.set(ck, a); }
    return a;
  }
  const posOf = (key: string, v: number) => { const a = sorted(key); if (!a.length) return 50; let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < v) lo = mid + 1; else hi = mid; } return Math.round((lo / Math.max(1, a.length - 1)) * 100); };
  const valAt = (key: string, pos: number) => { const a = sorted(key); return a.length ? a[Math.min(a.length - 1, Math.round((pos / 100) * (a.length - 1)))] : 0; };

  const set = (i: number, r: Partial<ScreenRule>) => (app.screen = app.screen.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const remove = (i: number) => (app.screen = app.screen.filter((_, j) => j !== i));
  let adding = $state('');
  function add(key: string) {
    const m = byKey.get(key);
    if (!m) return;
    const op = m.better === -1 ? 'le' : 'ge';
    // start at the median: half the municipalities pass
    app.screen = [...app.screen, { key, op, v: valAt(key, 50) }];
    adding = '';
  }
  /** a starting point for warehouse sites (all adjustable) */
  const EXAMPLE: ScreenRule[] = [
    { key: 'zone', op: 'ge', v: 20 },
    { key: 'hz_flood', op: 'le', v: 30 },
    { key: 'ic', op: 'le', v: 5 },
    { key: 'land', op: 'le', v: 100_000 },
    { key: 'pool30', op: 'ge', v: 50_000 },
  ];
  const list = $derived.by(() => {
    if (!res || !lt) return [];
    const m = lt.metric;
    return res.idx.map((i) => ({ c: lt.codes[i], v: m.get(i) })).sort((a, b) => (m.better === -1 ? a.v - b.v : b.v - a.v)).slice(0, 30);
  });
</script>

<section class="panel screen">
  <div class="head-row">
    <p class="eyebrow">{tt('screenTitle')}</p>
    {#if app.screen.length}<button type="button" class="linkish" onclick={() => (app.screen = [])}>{tt('clearAll')}</button>{/if}
  </div>
  <p class="help">{tt('screenHint')}</p>

  {#if app.screen.length}
    <ol class="rules">
      {#each app.screen as r, i (i)}
        {@const m = byKey.get(r.key)}
        {#if m}
          <li>
            <div class="r-head">
              <span class="nm">{m[L]}</span>
              <button type="button" class="op" onclick={() => set(i, { op: r.op === 'ge' ? 'le' : 'ge' })} aria-label={tt('screenFlip')}>{r.op === 'ge' ? '≥' : '≤'}</button>
              <strong class="tnum">{m.fmt(r.v)}</strong>
              <button type="button" class="x" aria-label={`${tt('remove')} ${m[L]}`} onclick={() => remove(i)}>×</button>
            </div>
            <input type="range" min="0" max="100" step="1" value={posOf(r.key, r.v)} aria-label={`${m[L]} ${r.op === 'ge' ? '≥' : '≤'}`}
                   aria-valuetext={m.fmt(r.v)} oninput={(e) => set(i, { v: valAt(r.key, Number(e.currentTarget.value)) })} />
            {#if res?.steps[i]}
              {@const prev = i ? res.steps[i - 1].n : res.total}
              <div class="funnel" aria-hidden="true"><span style:width="{(res.steps[i].n / res.total) * 100}%"></span></div>
              <p class="cnt tnum">{fmtNum(L, res.steps[i].n, 0)} {tt('muniCount')}{#if prev > res.steps[i].n}<span class="drop"> −{fmtNum(L, prev - res.steps[i].n, 0)}</span>{/if}</p>
            {/if}
          </li>
        {/if}
      {/each}
    </ol>
  {/if}

  <div class="add">
    <select bind:value={adding} onchange={() => add(adding)} aria-label={tt('screenAdd')}>
      <option value="">＋ {tt('screenAdd')}</option>
      {#each ['people', 'demand', 'access', 'land', 'industry', 'labour', 'risk'] as g (g)}
        <optgroup label={tt(`lg_${g}` as Key)}>
          {#each usable.filter((m) => m.group === g && !app.screen.some((r) => r.key === m.key)) as m (m.key)}<option value={m.key}>{m[L]}</option>{/each}
        </optgroup>
      {/each}
    </select>
    {#if !app.screen.length}<button type="button" class="btn" onclick={() => (app.screen = EXAMPLE.filter((r) => byKey.has(r.key)))}>{tt('screenExample')}</button>{/if}
  </div>

  {#if res}
    <p class="result">{tt('screenResult')} <strong class="tnum">{fmtNum(L, res.keep.size, 0)}</strong> / {fmtNum(L, res.total, 0)}</p>
    {#if list.length}
      <p class="sub-eyebrow">{tt('screenList')} · {lt?.metric[L]}</p>
      <ul class="plain res">
        {#each list as x (x.c)}
          <li><button type="button" class="linkish" onclick={() => onpick(x.c)}>{muniLabel(x.c)}</button> <span class="tnum">{lt?.metric.fmt(x.v)}</span>
            <button type="button" class="linkish star" aria-label={tt('addShort')} aria-pressed={shortlist.has('muni', x.c)} onclick={() => shortlist.toggle('muni', x.c)}>{shortlist.has('muni', x.c) ? '★' : '☆'}</button></li>
        {/each}
      </ul>
      {#if res.keep.size > list.length}<p class="small">{tt('screenMore').replace('{n}', String(res.keep.size - list.length))}</p>{/if}
    {/if}
  {/if}
</section>

<style>
  .rules { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 10px; }
  .r-head { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .r-head .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .op { border: 1px solid var(--line-strong); background: var(--surface); border-radius: 4px; min-width: 26px; min-height: 24px; font-weight: 700; cursor: pointer; color: var(--ink); }
  .x { border: 0; background: none; font-size: 16px; min-width: 24px; min-height: 24px; cursor: pointer; color: var(--muted); }
  input[type='range'] { width: 100%; accent-color: var(--blue); margin: 2px 0 0; }
  .funnel { height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
  .funnel span { display: block; height: 100%; background: var(--blue); }
  .cnt { margin: 2px 0 0; font-size: 12px; color: var(--ink-2); }
  .drop { color: var(--muted); }
  .add { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .add select { flex: 1; min-width: 160px; min-height: 34px; }
  .result { margin: 12px 0 0; font-size: 14px; }
  .result strong { font-size: 18px; }
  .res li { display: flex; gap: 8px; align-items: baseline; }
  .res li .tnum { margin-left: auto; color: var(--ink-2); }
  .star { min-width: 22px; text-decoration: none; }
</style>
