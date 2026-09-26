<script lang="ts">
  // データの鮮度: for every source, how old the data is, how often it is updated and when the next release is due.
  // Automatic updates (quarterly warehouse report, news, diesel, DPL) are checked against their loaded dates;
  // the rest are updated by hand when a new release appears (npm run check-sources reports them).
  import { app } from '../lib/state.svelte';
  import { store as s } from '../lib/store.svelte';

  type Row = { name: string; asOf: string; cadence: string; next: string; auto?: boolean; stale?: boolean };
  const L = $derived(app.lang);
  const today = new Date();
  const days = (iso: string) => (today.getTime() - Date.parse(iso)) / 864e5;
  const ja = (a: string, b: string) => (L === 'ja' ? a : b);

  const rows = $derived.by((): Row[] => {
    const w = s.w, news = s.news, diesel = s.diesel, dpl = s.dpl, jobs = s.jobs, ssw = s.ssw;
    const out: Row[] = [];
    if (w) {
      const q = w.quarters.at(-1)!;
      out.push({ name: ja('倉庫統計季報', 'Warehouse statistics'), asOf: `${q[L]}${q.published ? `（${ja('公表', 'published')} ${q.published}）` : ''}`, cadence: ja('四半期（自動取込）', 'Quarterly (automatic)'),
        next: ja('約3か月後', 'about 3 months later'), auto: true, stale: !!q.published && days(q.published) > 150 });
    }
    if (news) out.push({ name: ja('ニュース', 'News'), asOf: news.generated.slice(0, 10), cadence: ja('毎日（自動）', 'Daily (automatic)'), next: ja('翌日', 'tomorrow'), auto: true, stale: days(news.generated) > 3 });
    if (diesel) { const d = diesel.dates.at(-1)!; out.push({ name: ja('軽油価格', 'Diesel price'), asOf: d, cadence: ja('毎週（自動）', 'Weekly (automatic)'), next: ja('翌週', 'next week'), auto: true, stale: days(d) > 16 }); }
    if (dpl) out.push({ name: 'DPL', asOf: `${dpl.source.updated}（${ja('取得', 'retrieved')} ${dpl.source.retrieved}）`, cadence: ja('随時（手動）', 'As published (manual)'), next: '–', stale: days(dpl.source.retrieved) > 120 });
    if (jobs) out.push({ name: ja('有効求人倍率（職業別）', 'Job-opening ratios'), asOf: jobs.periods.at(-1)![L], cadence: ja('年度（自動）', 'Fiscal year (automatic)'), next: ja('翌年度の6月頃', 'around June'), auto: true });
    if (ssw) out.push({ name: ja('特定技能', 'Specified skilled workers'), asOf: ssw.periods.at(-1)![L], cadence: ja('半年（自動）', 'Half-yearly (automatic)'), next: ja('約6か月後', 'about 6 months later'), auto: true });
    // updated by hand when a release appears
    const manual: [string, string, string, string, string, string, string, string][] = [
      ['行政区域（N03）', 'Boundaries (N03)', '2026-01-01', '2026-01-01', '毎年', 'Yearly', '2027年春', 'spring 2027'],
      ['国勢調査・1kmメッシュ人口', 'Census, 1 km population', '2020年', '2020', '5年', 'Every 5 years', '2025年調査の結果（2026〜27年に順次）', '2025 census results (2026–27)'],
      ['将来推計人口（1kmメッシュ）', 'Population projection (1 km)', '令和6年推計', '2024 projection', '国勢調査ごと', 'After each census', '2025年国勢調査の後', 'after the 2025 census'],
      ['住民基本台帳（世帯・転入超過）', 'Resident register', '2026-01-01', '2026-01-01', '毎年', 'Yearly', '2027年夏', 'summer 2027'],
      ['経済センサス‐活動調査', 'Economic Census', '2021年', '2021', '5年', 'Every 5 years', '2026年調査の結果（2027〜28年）', '2026 survey results (2027–28)'],
      ['製造品出荷額等', 'Manufacturing shipments', '2024年実績', '2024 figures', '毎年', 'Yearly', '2026年7月頃（2025年実績）', 'July 2026 (2025 figures)'],
      ['地価公示（工業地）', 'Land prices', '2026年', '2026', '毎年', 'Yearly', '2027年3月', 'March 2027'],
      ['用途地域（A29）', 'Zoning (A29)', '2019年度', 'FY2019', '不定期', 'Irregular', '–', '–'],
      ['高速道路（N06）', 'Expressways (N06)', '2025年度', 'FY2025', '毎年', 'Yearly', '2026年度版', 'FY2026 edition'],
      ['道路交通センサス（旅行速度）', 'Road census (speeds)', '2021年度', 'FY2021', '約5年', 'About 5 years', '令和7年度調査の結果（2027年頃）', 'FY2025 survey results (around 2027)'],
      ['物流センサス', 'Freight census', '2021年（第11回）', '2021 (11th)', '5年', 'Every 5 years', '第12回（2026年調査）の結果', '12th survey (2026) results'],
      ['標準的な運賃', 'Standard freight rates', '2024年3月告示', 'March 2024 notice', '改定時', 'On revision', '適正原価制度へ移行（2028年までに）', 'replaced by binding cost rates (by 2028)'],
      ['最低賃金', 'Minimum wage', '令和7年度', 'FY2025', '毎年', 'Yearly', '2026年10月', 'October 2026'],
      ['緊急輸送道路（N10）', 'Emergency roads (N10)', '2024年3月', 'March 2024', '不定期', 'Irregular', '–', '–'],
      ['重要物流道路（N12）', 'Key logistics roads (N12)', '2021年4月', 'April 2021', '不定期', 'Irregular', '–', '–'],
      ['大型車誘導区間（リンクのみ）', 'Large-vehicle routes (link only)', '2026年3月版', 'March 2026 edition', '不定期', 'Irregular', '新版で自動チェック', 'checked for new editions'],
      ['地震動予測（J-SHIS）', 'Earthquake hazard (J-SHIS)', '2024年版', '2024 edition', '毎年', 'Yearly', '2025年版', '2025 edition'],
      ['登記所備付地図', 'Registry maps', '2025年', '2025', '毎年', 'Yearly', '2026年版（公開後）', '2026 edition (when out)'],
    ];
    for (const [nj, ne, asOf, asOfEn, cj, ce, nx, nxe] of manual) out.push({ name: ja(nj, ne), asOf: ja(asOf, asOfEn), cadence: ja(cj, ce), next: ja(nx, nxe) });
    return out;
  });
</script>

<details class="fresh" id="freshness">
  <summary>{ja('データの鮮度', 'How current the data is')}（{today.toISOString().slice(0, 10)}）</summary>
  <div class="tbl">
    <table>
      <thead><tr><th>{ja('データ', 'Data')}</th><th>{ja('時点', 'As of')}</th><th>{ja('更新', 'Updates')}</th><th>{ja('次の更新', 'Next')}</th><th>{ja('状態', 'Status')}</th></tr></thead>
      <tbody>
        {#each rows as r (r.name)}
          <tr><th scope="row">{r.name}</th><td>{r.asOf}</td><td>{r.cadence}</td><td>{r.next}</td>
            <td class:warn={r.stale}>{r.stale ? ja('要確認（更新が遅れています）', 'Check: overdue') : r.auto ? ja('最新', 'Current') : ja('手動更新', 'Manual')}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="note">{ja('手動更新のデータは、新しい公表があると定期チェック（check-sources）が知らせます。', 'For hand-updated data, the scheduled source check reports new releases.')}</p>
</details>

<style>
  .fresh { margin-top: 16px; max-width: 110ch; }
  .fresh summary { cursor: pointer; font-weight: 600; color: var(--ink); min-height: 32px; }
  .tbl { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; margin-top: 6px; }
  th, td { text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  thead th { color: var(--muted); font-weight: 500; }
  tbody th { font-weight: 500; color: var(--ink); white-space: nowrap; }
  td.warn { color: var(--ink); font-weight: 600; }
  td.warn::before { content: '⚠ '; }
  .note { margin: 6px 0 0; color: var(--muted); }
</style>
