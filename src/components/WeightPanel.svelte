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
          <div class="row" class:off={weights[k] === 0} title={c.hint[lang]}>
            <label for="{uid}-{c.key}">
              <span class="nm">{c[lang]}</span>
              <span class="sr-only">{c.hint[lang]}</span>
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
  .weights { display: grid; gap: 8px; }
  /* two columns once the panel is wide enough; the description is in the tooltip */
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 2px 16px; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); }
  legend { font-size: 12px; font-weight: 600; color: var(--muted); padding: 0 0 2px; }
  .row { display: grid; grid-template-columns: 1fr 18px; grid-template-areas: 'nm nm' 'in out'; gap: 0 8px; align-items: center; cursor: help; }
  label { grid-area: nm; }
  input[type='range'] { grid-area: in; }
  output { grid-area: out; }
  .row.off .nm { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--line-strong); }
  label { display: grid; min-width: 0; padding-top: 4px; }
  .nm { font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  input[type='range'] { width: 100%; accent-color: var(--blue); height: 24px; margin: 0; cursor: pointer; }
  output { font-size: 13px; font-weight: 600; text-align: right; }
</style>
