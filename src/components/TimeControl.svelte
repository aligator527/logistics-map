<script lang="ts">
  import { t, type Key, type Lang } from '../lib/i18n';

  export interface Period { id: string; ja: string; en: string }

  let { quarters, q, lang, onchange, label = 'period' }: {
    quarters: Period[];
    q: number;
    lang: Lang;
    onchange: (q: number) => void;
    label?: Key;
  } = $props();

  const nameOf = (i: number) => (lang === 'ja' ? quarters[i].ja : quarters[i].en);
  const uid = $props.id();
  const first = $derived(quarters[0].id.slice(0, 4));
  const last = $derived(quarters.at(-1)!.id.slice(0, 4));
</script>

<div class="time">
  <div class="row">
    <span class="lab" id="{uid}-label">{t(lang, label)}</span>
    <strong class="now tnum" aria-live="polite">{nameOf(q)}</strong>
    <span class="btns">
      <button type="button" class="step" aria-label={t(lang, 'prevPeriod')} title={t(lang, 'prevPeriod')}
              disabled={q === 0} onclick={() => onchange(q - 1)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 2L4 7l5 5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
      </button>
      <button type="button" class="step" aria-label={t(lang, 'nextPeriod')} title={t(lang, 'nextPeriod')}
              disabled={q === quarters.length - 1} onclick={() => onchange(q + 1)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 2l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
      </button>
      {#if q !== quarters.length - 1}
        <button type="button" class="linkish" onclick={() => onchange(quarters.length - 1)}>{t(lang, 'latest')}</button>
      {/if}
    </span>
  </div>
  <input
    type="range"
    min="0"
    max={quarters.length - 1}
    step="1"
    value={q}
    aria-labelledby="{uid}-label"
    aria-valuetext={nameOf(q)}
    oninput={(e) => onchange(Number(e.currentTarget.value))}
  />
  <div class="ends tnum" aria-hidden="true"><span>{first}</span><span>{last}</span></div>
</div>

<style>
  .time { display: grid; gap: 2px; min-width: 0; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .lab { font-size: 12px; color: var(--muted); }
  .now { font-size: 15px; }
  .btns { margin-left: auto; display: inline-flex; gap: 4px; align-items: center; }
  .step {
    width: 36px; height: 36px; display: grid; place-items: center;
    border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface);
  }
  .step:disabled { opacity: 0.4; cursor: default; }
  .linkish { margin-left: 6px; }
  input[type='range'] { width: 100%; accent-color: var(--blue); height: 28px; margin: 0; }
  .ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
</style>
