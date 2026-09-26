<script lang="ts">
  import type { Criterion } from '../lib/score';
  import { t, type Key, type Lang } from '../lib/i18n';

  let { criteria, weights, lang, onweight }: {
    criteria: Criterion[];
    weights: number[];
    lang: Lang;
    onweight: (key: string, v: number) => void;
  } = $props();

  const GROUPS: { key: Criterion['group']; label: Key }[] = [
    { key: 'market', label: 'groupMarket' },
    { key: 'access', label: 'groupAccess' },
    { key: 'cost', label: 'groupCost' },
    { key: 'labour', label: 'groupLabour' },
    { key: 'risk', label: 'groupRisk' },
  ];
  const uid = $props.id();
</script>

<div class="weights">
  {#each GROUPS as g (g.key)}
    {@const items = criteria.map((c, k) => ({ c, k })).filter((x) => x.c.group === g.key)}
    {#if items.length}
      <fieldset>
        <legend>{t(lang, g.label)}</legend>
        {#each items as { c, k } (c.key)}
          <div class="row" class:off={weights[k] === 0}>
            <label for="{uid}-{c.key}">
              <span class="nm">{c[lang]}</span>
              <span class="hint">{c.hint[lang]}</span>
            </label>
            <input id="{uid}-{c.key}" type="range" min="0" max="5" step="1" value={weights[k]}
                   aria-valuetext={`${t(lang, 'weightOf')} ${weights[k]}`}
                   oninput={(e) => onweight(c.key, Number(e.currentTarget.value))} />
            <output for="{uid}-{c.key}" class="tnum">{weights[k]}</output>
          </div>
        {/each}
      </fieldset>
    {/if}
  {/each}
</div>

<style>
  .weights { display: grid; gap: 12px; }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 4px; }
  legend { font-size: 12px; font-weight: 600; color: var(--muted); padding: 0 0 4px; }
  .row { display: grid; grid-template-columns: 1fr 110px 18px; gap: 4px 10px; align-items: center; min-height: 40px; }
  .row.off .nm { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--line-strong); }
  label { display: grid; min-width: 0; }
  .nm { font-size: 13px; font-weight: 500; }
  .hint { font-size: 11.5px; color: var(--muted); line-height: 1.35; }
  input[type='range'] { width: 100%; accent-color: var(--blue); height: 28px; margin: 0; }
  output { font-size: 13px; font-weight: 600; text-align: right; }
</style>
