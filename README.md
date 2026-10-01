# 総合物流マップ — Japan Logistics Map

A first-pass site-screening tool for logistics real estate: where in Japan to build or lease a warehouse.
A static site (Vite + Svelte 5, a custom SVG map, no backend), built on the same architecture as
[zairyu-map](https://github.com/aligator527/zairyu-map).

**Live:** https://aligator527.github.io/logistics-map/ — Japanese and English UI, light and dark themes, works on phones.

The site is **non-commercial**. Several sources are used under non-commercial terms (see [Licences](#licences-and-limits)).

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # -> dist/
```

## What it does

### Subjects on one map
Six subjects share one map, the DPL sites (Daiwa House logistics parks), expressways and interchanges, a
prefecture comparison mode, a table view and the news layer. The whole state lives in the URL `#hash`.

- **倉庫 (warehouses)** — prefecture choropleth of commercial warehouse statistics (所管面積 / 入庫高 / 保管残高 /
  空面積率, value or year-on-year), with a slider over 61 quarters.
- **貨物流動 (freight flows)** — 物流センサス 2005/2010/2015/2021: outbound / inbound / net / intra-prefecture,
  origin–destination arcs (the 30 largest flows nationally, or the top 8 destinations and sources of a prefecture),
  annual or 3-day basis, by transport mode (3-day only) or commodity.
- **労働力 (labour)** — job-opening ratios for drivers and handling workers by prefecture (FY2012–2025; the 2023
  classification break is marked), specified skilled workers (特定技能1号) by field, and the regional 2024 capacity
  shortfall estimate (NX総研).
- **市区町村 (municipalities)** — an explorer of about 40 metrics for all 1,898 municipalities and designated-city wards:
  population outlook (2035/2050, working age, 65+), population within 30 km, demand (households, migration, income,
  retail and e-commerce employees, manufacturing shipments, wholesale), access (interchanges, ports, cargo airports,
  rail freight stations, emergency and key logistics roads), land (industrial land price and its 5/10-year change,
  industrial zoning, urbanisation area shares), industry (road freight, warehousing, cold storage employees), labour
  (transport workers within 30 km, commuting) and hazards (J-SHIS earthquake, shares of residents in flood, deep flood,
  storm-surge, tsunami and landslide zones). Profile with ranks, A/B comparison, top lists per prefecture.
- **立地スコア (site score)** — 11 criteria per prefecture (market, access, labour, risk) or a municipal score; each
  criterion becomes a 0–100 percentile rank and the total is a weighted mean. Weights 0–5, five presets, breakdown per
  place, and a stability check: 200 random re-weightings (±50% each) give each place's rank range and share of top-10
  finishes (◆ marks robust leaders).
- **現況 (live)** — JMA warnings per municipality (new level system, polled every 90 s), earthquakes of the last 7 days,
  typhoons, designated-river flood forecasts, and weekly diesel prices per prefecture.

### Decisions
- **絞り込み (screening funnel)** — hard conditions on municipal metrics (≥ / ≤, sliders move along the national
  distribution), applied in order: "1,898 → 1,230 → … → 190". Municipalities that fail are greyed out on the map; the
  conditions are in the link (`fx=`); the passing list can be starred into the shortlist and used as the only candidates
  of the simulation. A warehouse-site example is one click away.
- **到達圏 (reach)** — truck travel time from a municipality, a DPL site, all DPL sites, the shortlist or any point on the
  map: population within 30–180 minutes, the 2024 driving rules (day trip / one day / two days or relay, from the
  改善基準告示: 13 h on duty, 9 h driving, 30 min rest per 4 h, 1 h handling at each end), nearest ports, airports and
  rail freight stations, and a 1 km population grid (cells drawn at their true 45″ × 30″ shape; hover shows population,
  time and trip class).
- **通行止め (road closures)** — click an expressway to close the stretch between two interchanges (`cl=`): extra travel
  time per municipality, people dropping out of day-trip reach, the places hit hardest.
- **混雑時 (rush hour)** — switch to rush-hour truck speeds (road census, 7–9 and 17–19 h).
- **配送費 (delivery cost)** — yearly cost of delivery runs from a site at the MLIT **standard freight rates**
  (標準的な運賃, 2024 notice: 10 regions × 4 vehicle classes, distance bands rounded up as in the MLIT Q&A). Runs go to
  the municipalities within a chosen time, in proportion to a chosen demand (population, households, retail, e-commerce,
  manufacturing shipments, wholesale), over the real road distance of the quickest path. CO₂ by the improved ton-km
  method (METI/MLIT guideline Ver.3.2). Tolls, waiting, handling and surcharges are not included.
- **コスト試算 (site cost)** — land purchase at the industrial land price, staff at the prefecture's minimum wage, fuel at
  the diesel price; the assumptions are kept in the browser.
- **立地シミュレーション (site simulation)**, two objectives:
  - *reach the most people*: greedy maximum coverage — the N municipalities whose sites reach the most people within a
    time limit, on top of existing sites (none / DPL / shortlist);
  - *lowest total cost*: greedy p-median — delivery runs at the standard fares from the nearest site plus a fixed yearly
    cost per site (land at a yearly rate + staff); every step is shown and ★ marks the number of sites with the lowest
    total. Ferries are off in this mode (ferry fares are not in the table).
  Candidates can be restricted to industrial zoning ≥ 20 ha, flood share < 50%, one prefecture or the screened set.
  Runs in a Web Worker (about a second).
- **Your own data (自社データ)** — load a CSV / TSV (UTF-8 or Shift_JIS, as Excel saves it) of customers, stores or
  destinations with coordinates or an address (geocoded by the GSI address search) and a volume. Points are assigned to
  the municipality whose outline contains them; the volumes per municipality become a demand for the delivery cost, the
  simulation (both objectives) and the screening, and the points are drawn on the map. The file stays in the browser
  (only address lookups leave it) and is never put in links.
- **経路と中継 (route and relay)** — the quickest path from the reach origin to the selected municipality: time, km, the
  trunk roads in order (common names first), and — when the run is longer than a day trip — the fewest relay points at
  named interchanges so that every leg is a day trip for its driver; the route and relay points are drawn on the map.
- **Total cost over time** — present value over N years (default 10, discount 3%). *Buy*: land bought now less its value
  at the end (the local 5-year land-price trend), plus the building (floor area × cost per ㎡) less what is left of it
  after straight-line depreciation over 31 years. *Lease*: a rental logistics facility of the same floor area at the
  region's median asking rent (or your own), following the region's 5-year rent trend. Then staff growing with the prefecture's minimum-wage trend (last 5 years),
  delivery runs. Staff pay can be the minimum wage or actual pay (賃金構造基本統計調査 2025: warehouse and handling
  workers, truck drivers, part-time in transport).
- **Labour** — transport and handling workers (census 2020, by residence) within a 20/30/45-minute car commute of a site;
  competition for them: logistics jobs within 30 km per such worker living within 30 km.
- **New supply** — warehouse floor area started per prefecture (建築着工統計, 2015 – mid-2026) and its ratio to the
  commercial warehouse stock; per municipality, transport-industry buildings started (a proxy: there is no municipal
  warehouse figure).
- **Rental market (物流施設の賃貸市場)** — vacancy and median asking rent of rental logistics facilities (10,000 ㎡+) in
  Greater Tokyo, Kansai, Chukyo and Kyushu, quarterly since 2008 (一五不動産情報サービス); shown as metrics for the
  municipalities of those regions (one value per region) and as trends in the metrics tab.
- **Your weighting and scenarios** — pick criteria and weights (0–5) for the shortlist and get a 0–100 score and a
  ranking (presets: cost, reach, labour, safety first); save the current settings with each candidate's results as a
  scenario, compare scenarios side by side and apply one back.
- **Shortlist (候補)** — prefectures, municipalities, DPL sites, map points and measured plots; status (candidate / site
  visit / negotiating / on hold / dropped) and notes; side-by-side comparison with the best value marked in each row;
  CSV; a share link (with statuses); browser notifications when a candidate gets a JMA warning.
- **意思決定レポート (decision report)** — printable / PDF: a picture of the map, the assumptions (screening, speeds,
  closures, cost settings), the candidates with status and notes, the full comparison and the sources.
- **地点カルテ (site memo)** for any point (map click or address search via the GSI geocoder): address, elevation,
  landform, flood / storm-surge / tsunami / landslide depth at the point, industrial zoning, travel times, population
  in 30/60/120 minutes, distance to emergency and key logistics roads, a link to the official large-vehicle route map of
  the prefecture, DPL and other developers' facilities within 20 km, the municipality's metrics and live warnings.
- **立地メモ (area memo)** — a printable summary of a prefecture or municipality across all subjects.

### The map
- **Close zoom** — down to single buildings (about z17.5 of the GSI tiles, ~1 m per pixel). From z10.5, detailed
  municipal boundaries and expressway lines (simplified to 5 m, `public/geo/detail/NN.json`, 60–600 KB gzipped) are
  loaded for the prefectures on screen; the overview stays at 180 m. Between z11.5 and z14.5 the fill fades into coloured
  outlines, and without a chosen background the pale GSI map comes in on its own.
- **Background maps (地理院タイル)** — pale, standard and aerial maps, hillshade, elevation and slope, flood-control
  landform, Meiji-era wetlands and land-condition maps. Web Mercator tiles are placed into the map's Lambert projection
  piecewise-affinely (each tile split into up to 8 × 8 pieces, the Okinawa and Ogasawara insets separately).
- **Buildings (建物, from z15)** — GSI optimised vector tiles (layer BldA). **Land parcels (筆界, from z16)** — the MOJ
  registry maps 2025 (tiles by KotobaMedia): lot number, district and accuracy class on hover, lot numbers on the map
  from z17. Only maps in public coordinates are in the data — about half of Japan; where there are none, the map says so.
  Tile geometry is projected once and kept as `Path2D`.
- **Emergency transport roads (N10) and key logistics roads (N12)** — a layer, distances per municipality and in the
  site memo.
- **More hazards** — liquefaction tendency by landform (MLIT, 250 m mesh), flood duration (maximum scenario) and
  pluvial flooding (only the 65 municipalities that publish it) at any point; per municipality, residents on
  liquefaction-prone land and where floods last 3 days or more.
- **Industrial zoning (A29)** and **other developers' facilities** — a registry built from developer press releases
  (stages with dates, floor area, geocoded address checked against the place in the name; manual fixes in
  `data/facilities-overrides.json`).
- **Ports, airports, rail freight stations** — sized by cargo; nearest cargo airport for every DPL site.
- **News on the map** — bubbles with the number of items per place over 90 days; on wide maps the freshest places get
  callout cards over the sea (a land mask on a canvas picks free spots, leader lines with a bend); related news
  (same facility, series, company, place, topic) and a facility timeline; on narrow maps a card strip under the map.
- **Measuring** — distances and areas (m², ha, 坪); a closed shape can be saved to the shortlist as a plot (its area then
  replaces the assumed plot size in the cost estimate).
- **Scale bar**, the view in the URL (`mv=zoom/lat/lon`), wheel zoom after a click on the map, double click / double tap
  to zoom, keyboard navigation (arrows walk prefectures, then municipalities; Enter selects).
- **Side by side** (`lk2=`) — a second map with another municipal metric, sharing the exact view while moving.
- **Smooth panning** — during a gesture the heavy layers (area SVG, tile and raster canvases) move as one composited
  layer by a CSS transform and are redrawn when it ends; zoomed in, only the areas on screen are drawn.

### Interface
- **Side panel** with tabs — 概要 (overview), 絞り込み (screening), 指標 / 重み・内訳 (metrics or weights), 到達圏・計算
  (reach and costs), 候補 (shortlist, with a count and a warning dot), ニュース (news, with a count of fresh items). Only
  the tabs a subject has are shown; the chosen tab is in the URL (`tb=`). On wide screens the panel sticks under the
  controls and scrolls on its own while the map stays in view; its width can be dragged (or set with the arrow keys on
  the splitter) and it can be hidden.
- **Pinned metrics** (📌) on the overview tab; **view history** (← → and the browser buttons) over places, subjects and
  metrics; **saved views**; export to **PNG**, **GeoJSON** and **KML**.
- **ガイド** — four step-by-step scenarios (finding a site, the 2024 driving rules, hazards, the warehouse market).
- **Phones** — controls fold under 表示設定; a bar at the bottom keeps the selection and its value in sight.
- **Glossary** of about 30 Japanese logistics terms, shown as hints in legends and help texts.
- **PWA** — installable, opens offline with the last loaded data.
- **Data freshness** (in the footer) — for every source: as-of date, update cadence, next expected release and status.
- **Performance** — heavy calculations (1 km grid, score stability, simulation) in Web Workers; municipal themes, the
  router and the memo load as separate chunks; prefectures paint first and municipalities follow; Lighthouse (mobile)
  about 70.

## Data

| Layer | Source | Script | Output |
|---|---|---|---|
| Warehouses | MLIT 倉庫統計季報, quarterly .xls ([page](https://www.mlit.go.jp/seisakutokatsu/freight/seisakutokatsu_freight_mn2_000007_2.html)) | `npm run etl:warehouse` | `public/data/warehouse.json` |
| Boundaries | 国土数値情報 N03 (2026-01-01) | `npm run geo` | `public/geo/japan.topo.json` |
| Detailed boundaries and expressways | N03 + N06, simplified to 5 m, per prefecture | `npm run detail` | `public/geo/detail/NN.json` |
| English names | Wikidata, `data/labels/wikidata_lg_codes.csv` | `npm run labels` | `public/geo/muni-en.json` |
| Expressways, interchanges | 国土数値情報 N06 (FY2025) | `npm run roads` | `public/geo/roads.json` |
| DPL sites | Daiwa House property list (XML) | `npm run etl:dpl` | `public/data/dpl.json` |
| Freight flows | MLIT 全国貨物純流動調査 (物流センサス), tables I-3-1/2/3, 2005–2021 | `npm run etl:census` | `public/data/census/{index,YYYY}.json` |
| Job-opening ratios | MHLW 職業安定業務統計, tables 4 and 5 (e-Stat) | `npm run etl:jobs` | `public/data/jobs.json` |
| Specified skilled workers | ISA, table 5 | `npm run etl:ssw` | `public/data/ssw.json` |
| Flow arc anchors | prefectural offices | `npm run anchors` | `public/geo/anchors.json` |
| Earthquake hazard | J-SHIS API (Y2024), 1,898 points + DPL sites | `npm run etl:risk` | `public/data/risk.json` |
| Landslide zones (prefecture) | MLIT 砂防部, snapshot `data/risk/sabo.csv` | ↑ | ↑ |
| Flood damage | 水害統計 table 2, 2014–2023 (e-Stat) | `npm run etl:suigai` → `etl:risk` | `data/risk/suigai.json` |
| Hazard shares per municipality | ハザードマップポータル tiles on the 1 km grid | `npm run etl:hazard` → `etl:muni` | `public/data/muni.json` |
| 1 km population grid | 国土数値情報 mesh1000r6 (CC BY 4.0) | `npm run etl:mesh` | `data/raw/mesh/pop2020.json` |
| Municipal metrics | the grid + L01/L02 2026 + 都市計画現況調査 + census 2020 + economic census 2021 + N06 + J-SHIS | `npm run etl:muni` | `public/data/muni.json` |
| Demand, wages, land trend | 住民基本台帳, 課税状況, economic census 2021, 経済構造実態調査 2025 (2024 shipments), minimum wages, L01 | `npm run etl:demand` | `public/data/muni.json` |
| Industrial zoning | 国土数値情報 A29 (2019) | `npm run zoning` | `public/geo/zoning/NN.json` |
| Logistics pay | 賃金構造基本統計調査 2025, prefecture tables (full-time by occupation, part-time by industry) | `npm run etl:wages` | `public/data/muni.json` |
| New warehouse supply | 建築着工統計調査 tables 1 and 7-2 | `npm run etl:supply` | `public/data/muni.json` |
| Logistics rents and vacancy | 一五不動産情報サービス「物流施設の賃貸マーケットに関する調査」(CSV of the latest report) | `npm run etl:rent` | `public/data/rent.json` |
| Road network, travel times | N06 + 道路交通センサス 2021 speeds + ferries | `npm run network` | `public/geo/network.json`, `grid.bin.gz` |
| Emergency / key logistics roads | 国土数値情報 N10 (2024), N12 (2021) | `npm run bcp-roads` | `public/tiles/logiroads/` (pictures), `public/geo/logidist.bin.gz` |
| Ports, airports, rail stations | 国土数値情報 C28 / C02 / P31, 港湾統計, 空港管理状況調書 | `npm run etl:multimodal` | `public/data/multimodal.json`, `public/tiles/hubs/` (ports and stations as pictures) |
| News, facility registry | RSS (see below) | `npm run news` | `public/data/news.json`, `facilities.json` |

`npm run data` rebuilds everything. Large inputs (`data/raw`, `data/geo`) are not committed; `data/raw-manifest.json`
records each file's size, SHA-256, source page and the script that reads it (`npm run raw:verify`, `npm run raw:update`).

### Notes on the sources
- **Warehouse statistics** — 普通倉庫 classes 1–3: floor area, used and empty area (end of quarter), inbound (sum of three
  months) and stock (end of the last month). Columns are found by their headings because they shift between issues.
  Where the source total disagrees with the sum of prefectures (2010-Q2 area, 2018-Q3 stock) the sum is used and noted.
  Publication lags a lot: April–June 2025 was published on 2026-09-03; each issue's date is shown next to the metric.
- **DPL** — the page refuses non-browser clients, so the data is a saved XML snapshot (`data/dpl/datas03.xml`). It is the
  leasing catalogue, not the whole portfolio. 31 sites without coordinates are geocoded by address (marked approximate).
- **Freight census** — rows are origin prefectures, columns destinations (tonnes); the 2021 (.xlsx) and 2005–2015 (.xls)
  layouts differ, so tables are found by prefecture names. Checked: 3-day total 2021 = 20,722,421 t. The 12th survey
  (fieldwork October 2025) will be added as a new round.
- **Job-opening ratios** — openings (table 4) ÷ applicants (table 5), full-time incl. part-time, by the office that took the
  opening (Tokyo is inflated by head offices). National FY2022–2025 = 2.38 / 2.62 / 2.61 / 2.58, as published by MHLW.
- **Municipal data** — the grid sums to exactly 126,146,099 (census 2020). Industrial land price: 816 municipalities have
  their own points, 454 take the median within 15 km, 628 the prefecture median (marked). Zoning of designated-city wards
  is the city's split by ward area. Hamamatsu's wards were redrawn in 2024: earlier figures are shared by population.
- **Travel times** — `scripts/build-network.mjs` builds a graph from N06 sections in service. Truck speeds come from the
  2021 road census (箇所別基本表, 大型車, daytime and rush hour). Each census section is matched to the graph by its
  shape: the section lines of the census WEBマップ (`scripts/fetch-census-geom.mjs`) are laid over the N06 edges (points
  every 100 m, within 45 m). 道路局 道路経済調査室 allowed this use in writing (2026-10) for matching only — the lines and
  the positions of the survey points are never published; they stay in `data/raw` and only speeds per N06 edge reach the
  site. Edges left over take IC-to-IC stretches matched by interchange names (path length within 30%). 97% of
  expressway km are measured, 1% take their route's average, the rest keep flat speeds (80 / 65 / 60 / 45 km/h by road
  type). Access legs are straight lines × 1.3 at
  30 km/h (40 in Hokkaido) up to 80 km, only through interchanges; ordinary-road trips up to 30 km. Roads never cross the
  sea: both ends must be on the same "land piece". 22 long-distance ferry routes (sailing time + 90 min check-in) can be
  switched off. Dijkstra runs in the browser (`src/lib/travel.ts`, about 5 ms). It is an estimate, not a route planner:
  truck restrictions and live traffic are not modelled.
- **Standard freight rates** — the table in `src/lib/fares.ts` was transcribed from the gazette (an image), each column
  checked for steady steps. The 2025 law replaces the standard rates with binding 適正原価 by about 2028.
- **Hazards** — shares of residents in hazard zones sample every populated 1 km cell 4 × 4 on the Hazard Map Portal tiles
  at z12 (~31% of residents nationally in 0.5 m+ flood zones; MLIT estimates about 28%). J-SHIS depends strongly on the
  ground at the point, so a prefecture is the median of its municipalities. Raw J-SHIS answers are cached locally and not
  committed (their terms forbid redistributing raw data); only derived values are published.

## Checks
- `npm test` — published data against hand-checked official figures (including routing, fares and demand);
  `npm run check` — types.
- `npm run e2e` — Playwright on the built site (desktop and phone, light and dark, axe accessibility checks). Third
  parties (JMA, PR TIMES images, GSI, parcel tiles) are blocked on purpose: the site must survive their failure; a real
  parcel tile is served from `e2e/fixtures/`.
- Visual regression (`VISUAL=1`) runs in the Playwright container in CI; baselines are regenerated by the
  `visual-baselines.yml` workflow (then run CI by hand). Web fonts are blocked in tests so screenshots are stable.
- Daily `site-check.yml` opens the published site with the real sources and runs `tests-live/*.test.mjs`.
- `npm run check-sources` reports new releases of the hand-updated sources (freight census, flood statistics, 国土数値情報
  layers, J-SHIS, the large-vehicle route maps, the age of the DPL snapshot …).
- Before an automatic data commit, `scripts/check-data.mjs` stops the job if a file shrank, a series got shorter or many
  numbers moved by more than 30%.
- Weekly `update-manual.yml` looks for a new minimum-wage year, a new edition of the large-vehicle route maps and a new
  quarter of the rental market survey; a
  change goes to a branch (after the data tests) and an issue links to it for review. (The MLIT map server does not
  answer GitHub's runners, so that part works only in local runs of `check-sources`.)
- Weekly `update-data.yml` refreshes the warehouse statistics, specified skilled workers and job-opening ratios; daily
  `update-news.yml` refreshes the news and the facility registry.

## Licences and limits
- The site is non-commercial. Ports (C02), rail freight stations (P31), **emergency transport roads (N10)** and **key
  logistics roads (N12)** are 国土数値情報 licensed 非商用 (`etl:multimodal --noncommercial`; drop the flag for a
  commercial deployment). The 国土情報提供サイト運営事務局 confirmed with MLIT (2026-10) that showing such data as a
  map layer is not redistribution, but that a state where viewers can obtain the data (vector tiles, APIs) may be. So
  these layers are published only as **picture tiles** (`public/tiles/logiroads`, `public/tiles/hubs`, drawn by
  `scripts/lib/raster-tiles.mjs`); the browser never receives their coordinates. What is published as data are GIS
  results allowed by 規約 3条2項: distances per municipality and per 1 km grid cell (`public/geo/logidist.bin.gz`), the
  road time to each port / station, and its 0.01° cell for short trips. Parcel tiles (KotobaMedia) are free for
  non-commercial use.
- **Rental market** — 一五不動産情報サービス allows reprinting with the source named, except for commercial use or
  material marked 「無断転載を禁じます」 (their FAQ); the survey data carries no such mark and the source is shown with
  every figure. A commercial deployment needs their permission.
- **Large-vehicle routes (大型車誘導区間)** are not drawn: there is no open data, and the official condition maps (PDF) may
  only be read, not reused. The site memo links to the prefecture's map instead.
- News: headlines, links, a short excerpt (≤ 110 characters) and the preview image URL only — no article text or copied
  images. Sources: MLIT press releases, e-Gov public comments and logistics developers' own PR TIMES feeds. Trade media
  (物流ウィークリー, LOGISTICS TODAY) are wired in `scripts/fetch-news.mjs` but disabled until permission is given; LNEWS
  (メディアビズ) declined in writing (RSS only for incorporated partners) and is not used;
  MHLW and Google News are not used (their terms do not allow it).
- Live traffic (JARTIC) and NEXCO closures are not used: no CORS or open feeds. The diesel price page sits behind a WAF;
  when a request is refused the previous data stays.
- Figures are estimates from open data for a first screening, not quotes, legal boundaries or route permits.

## Design
Palette "concrete / container / floor marking": concrete-grey neutrals, a container-blue sequential scale (7 quantile
classes, OKLCH, monotonic lightness; in the dark theme more = lighter), amber only for DPL and selection A. Year-on-year
uses a diverging clay ← grey → blue scale. Comparison: A is a solid amber outline, B a dashed ink outline, both with
letter labels (not colour alone). Text contrast ≥ 5:1. Flow arcs: outbound in ink, inbound in terracotta, width ∝
√volume, bending to the right of their direction, arrowhead at the destination.

## Deploy
- **GitHub Pages**: `.github/workflows/deploy-pages.yml`; Settings → Pages → Source = GitHub Actions. Paths are relative
  (`base: './'`), so the site works from a subfolder.
- **Vercel**: import the repository (settings in `vercel.json`).
