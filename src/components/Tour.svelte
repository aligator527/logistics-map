<script lang="ts">
  // ガイド: four walk-throughs of typical questions. Each step is a view (a URL hash) plus a short explanation of what to read in it.
  import { app } from '../lib/state.svelte';
  import { t, type Key } from '../lib/i18n';

  type Txt = { ja: string; en: string };
  type Step = { hash: string; title: Txt; text: Txt };
  type Scenario = { key: string; title: Txt; lead: Txt; steps: Step[] };

  const SCENARIOS: Scenario[] = [
    {
      key: 'site', title: { ja: '物流拠点の候補地を探す', en: 'Find candidate sites' },
      lead: { ja: '立地スコア → 用途地域 → 到達圏 → 地価の順に絞り込みます。', en: 'Narrow down by score, zoning, reach and land price.' },
      steps: [
        { hash: 't=score&sl=muni', title: { ja: '市区町村の立地スコア', en: 'Municipal site score' },
          text: { ja: '人口・アクセス・労働力・リスクなどを重み付けした総合点です。上の「重み」やプリセットで目的に合わせて変えられます。濃い色ほど高評価です。', en: 'A weighted mix of population, access, labour and risk. Change the weights or preset to suit the use case; darker is better.' } },
        { hash: 't=local&lk=zone&zn=1&r=11', title: { ja: '工業系用途地域', en: 'Industrial zoning' },
          text: { ja: '倉庫を建てやすい工業系用途地域の面積（埼玉県）。地図上の点線は用途地域の範囲です。拡大すると形がわかります。', en: 'Area of industrial zoning (Saitama). The dashed outlines on the map are the zones; zoom in to see their shape.' } },
        { hash: 't=local&lk=iso&mu=11232&io=muni:11232&r=11', title: { ja: '到達圏（久喜市から）', en: 'Reach from Kuki' },
          text: { ja: '高速道路網でトラックが何分で届くか。2024年ルール（連続運転4時間・拘束13時間）の範囲も「運行区分」で確認できます。', en: 'Truck drive time over the expressway network. See "Trip type" for the 2024 driving rules.' } },
        { hash: 't=local&lk=land&mu=11232&r=11', title: { ja: '地価と候補リスト', en: 'Land price and shortlist' },
          text: { ja: '工業地の地価を確認し、右の「☆ 候補に追加」でリストへ。候補リストでは比較表・コスト試算・地点カルテを作成できます。', en: 'Check industrial land prices, then "☆ Add to shortlist" on the right. The shortlist compares candidates, estimates costs and builds site memos.' } },
      ],
    },
    {
      key: 'rules', title: { ja: '2024年問題と配送網', en: '2024 driving rules and coverage' },
      lead: { ja: '拠点から日帰りで届く範囲と、ドライバー不足の状況を見ます。', en: 'What a site can reach within a shift, and where drivers are short.' },
      steps: [
        { hash: 't=local&lk=shift&mu=23206&io=muni:23206', title: { ja: '運行区分（春日井市から）', en: 'Trip type from Kasugai' },
          text: { ja: '日帰り・休憩1回・宿泊が必要な範囲を色分けしています。フェリーの利用は到達圏パネルで切り替えられます。', en: 'Day trips, one-break trips and overnight trips. Ferries can be toggled in the reach panel.' } },
        { hash: 't=local&lk=iso&io=net:dpl', title: { ja: 'DPLの配送網カバー率', en: 'DPL network coverage' },
          text: { ja: '全DPL拠点のうち最も近い拠点からの時間。「立地シミュレーション」で次の拠点をどこに置くと人口カバー率が最も上がるかを計算できます。', en: 'Time from the nearest DPL. "Site simulation" finds where the next site adds the most population coverage.' } },
        { hash: 't=labour&lm=jobs', title: { ja: 'ドライバーの有効求人倍率', en: 'Driver job-opening ratio' },
          text: { ja: '倍率が高いほど採用が難しい地域です。', en: 'The higher the ratio, the harder it is to hire.' } },
        { hash: 't=flows', title: { ja: '都道府県間の貨物流動', en: 'Freight flows between prefectures' },
          text: { ja: '都道府県を選ぶと、どこから・どこへ貨物が動いているかが線で表示されます。', en: 'Select a prefecture to see where its freight comes from and goes to.' } },
      ],
    },
    {
      key: 'risk', title: { ja: '災害リスクを確かめる', en: 'Check hazard risk' },
      lead: { ja: '地震・浸水・地形を市区町村と地点の両方で確認します。', en: 'Earthquake, flooding and landform, by municipality and by point.' },
      steps: [
        { hash: 't=local&lk=quake', title: { ja: '地震リスク', en: 'Earthquake risk' },
          text: { ja: '30年以内に震度6弱以上となる確率（J-SHIS）を市区町村ごとに集計したものです。', en: 'Probability of intensity 6− or more within 30 years (J-SHIS), per municipality.' } },
        { hash: 't=local&lk=hz_flood&r=13', title: { ja: '洪水浸水想定区域', en: 'Flood zones' },
          text: { ja: '想定最大規模の降雨で浸水する区域に住む人口の割合（東京都）。', en: 'Share of residents in areas flooded by the largest assumed rainfall (Tokyo).' } },
        { hash: 't=local&lk=hz_flood&r=13&bm=lcmfc&fo=0.3', title: { ja: '治水地形分類図を重ねる', en: 'Overlay the flood-control landform map' },
          text: { ja: '背景地図を地理院タイルに切り替え、塗りを薄くしています。旧河道・後背湿地などの低地が見えます（拡大してください）。', en: 'A GSI basemap under a lighter fill: old river channels and back marshes show up when zoomed in.' } },
        { hash: 't=local&lk=hz_flood&r=13&bm=pale', title: { ja: '地点を調べる', en: 'Inspect a point' },
          text: { ja: '「地点を調べる」を押して地図をクリックすると、標高・地形分類・ハザード・住所がわかり、地点カルテも作れます。', en: 'Press "Inspect a point" and click the map for elevation, landform, hazards and address, and build a site memo.' } },
      ],
    },
    {
      key: 'market', title: { ja: '倉庫市場の動き', en: 'Warehouse market' },
      lead: { ja: '在庫・空室・新規開発・地価の推移を見ます。', en: 'Stock, vacancy, new development and land prices.' },
      steps: [
        { hash: '', title: { ja: '倉庫の保管面積', en: 'Warehouse floor area' },
          text: { ja: '営業倉庫の所管面積の四半期推移。下の時系列で期間を選べます。', en: 'Quarterly commercial warehouse floor area; pick a quarter in the chart below.' } },
        { hash: 'm=vacancy', title: { ja: '空室率', en: 'Vacancy' },
          text: { ja: '空きの多い地域・少ない地域。「前年比」に切り替えると変化がわかります。', en: 'Where space is loose or tight; switch to year-on-year to see the change.' } },
        { hash: 'nw=1&fc=1', title: { ja: '開発ニュースと施設', en: 'Development news and facilities' },
          text: { ja: '地図上のカードは最新の開発ニュース。クリックすると関連ニュースと施設の経緯が表示されます。◆は他社の物流施設です。', en: 'Cards on the map are recent development news; click one for related news and the facility timeline. ◆ marks other developers\' facilities.' } },
        { hash: 't=local&lk=land5', title: { ja: '工業地地価の5年変化', en: 'Industrial land, 5-year change' },
          text: { ja: '地価の上昇が大きい地域は開発が集中している可能性があります。', en: 'Fast-rising land prices often mark development hot spots.' } },
      ],
    },
  ];

  const L = $derived(app.lang);
  const tt = (k: Key) => t(app.lang, k);
  let dlg = $state<HTMLDialogElement | null>(null);
  let cur = $state<Scenario | null>(null);
  let i = $state(0);

  function go(n: number) {
    i = n;
    location.hash = cur!.steps[n].hash;
    document.querySelector('.mapcol')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function start(sc: Scenario) { cur = sc; dlg?.close(); go(0); }
  function stop() { cur = null; }
</script>

<button type="button" class="btn guide" onclick={() => dlg?.showModal()}>{tt('guide')}</button>

<dialog bind:this={dlg} class="tour-dlg" aria-labelledby="tour-h" onclick={(e) => { if (e.target === dlg) dlg?.close(); }}>
  <h2 id="tour-h">{tt('guide')}</h2>
  <p class="help">{tt('guideLead')}</p>
  <ul class="sc">
    {#each SCENARIOS as sc (sc.key)}
      <li><button type="button" class="tile" onclick={() => start(sc)}>
        <span class="tv">{sc.title[L]}</span><span class="ty">{sc.lead[L]}</span><span class="tl">{sc.steps.length} {tt('steps')}</span>
      </button></li>
    {/each}
  </ul>
  <p class="acts"><button type="button" class="btn" onclick={() => dlg?.close()}>{tt('close')}</button></p>
</dialog>

{#if cur}
  {@const st = cur.steps[i]}
  <div class="tour" role="dialog" aria-live="polite" aria-label={cur.title[L]}>
    <p class="eyebrow">{cur.title[L]} · {i + 1} / {cur.steps.length}</p>
    <h3>{st.title[L]}</h3>
    <p>{st.text[L]}</p>
    <p class="acts">
      <button type="button" class="btn" disabled={i === 0} onclick={() => go(i - 1)}>← {tt('prev')}</button>
      {#if i < cur.steps.length - 1}
        <button type="button" class="btn solid" onclick={() => go(i + 1)}>{tt('next')} →</button>
      {:else}
        <button type="button" class="btn solid" onclick={stop}>{tt('finish')}</button>
      {/if}
      <button type="button" class="linkish" onclick={stop}>{tt('close')}</button>
    </p>
  </div>
{/if}

<style>
  .tour-dlg { max-width: min(560px, calc(100vw - 32px)); border: 1px solid var(--line-strong); border-radius: 10px; background: var(--bg); color: var(--ink); padding: 20px; }
  .tour-dlg::backdrop { background: rgb(0 0 0 / 0.35); }
  .tour-dlg h2 { margin: 0 0 4px; font-size: 18px; }
  .sc { list-style: none; margin: 12px 0; padding: 0; display: grid; gap: 8px; }
  .sc .tile { width: 100%; }
  .tour {
    position: fixed; right: 16px; bottom: 16px; z-index: 70; width: min(380px, calc(100vw - 32px));
    background: var(--surface); border: 1px solid var(--line-strong); border-left: 3px solid var(--blue); border-radius: 10px;
    padding: 12px 14px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); font-size: 13.5px;
  }
  .solid { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .tour h3 { margin: 0 0 6px; font-size: 15px; }
  .tour p { margin: 0; line-height: 1.6; }
  .tour .acts { margin-top: 10px; align-items: center; flex-wrap: wrap; }
  @media (max-width: 720px) { .tour { left: 0; right: 0; bottom: 0; width: auto; border-radius: 10px 10px 0 0; padding-bottom: calc(12px + env(safe-area-inset-bottom)); } }
</style>
