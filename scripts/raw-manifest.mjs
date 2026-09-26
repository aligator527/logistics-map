// Manifest of the raw source files behind public/data (data/raw-manifest.json, committed):
// file, size, SHA-256, where it comes from and which script reads it. The downloads themselves are
// not committed (data/raw/, data/geo/ are ignored), so this is what makes a rebuild checkable.
//
//   node scripts/raw-manifest.mjs            verify: list missing files and files that differ
//   node scripts/raw-manifest.mjs --update   rewrite the manifest from the files on disk
//   node scripts/raw-manifest.mjs --strict   verify, exit 1 on any difference (CI with a raw cache)
//
// A file that differs is not necessarily wrong — publishers revise files — but the rebuilt data
// will then differ too, and the diff says where to look.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'data/raw-manifest.json');

// folder / file pattern -> source page and the script that reads it
const SOURCES = [
  [/^data\/geo\/N03-/, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html', 'build-geo'],
  [/^data\/geo\/N06-/, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N06-2025.html', 'build-roads, build-network'],
  [/^data\/raw\/\d{4}-Q\d_/, 'https://www.mlit.go.jp/statistics/details/t-other-2_tk_000196.html (倉庫統計季報)', 'etl-warehouse'],
  [/^data\/raw\/census\//, 'https://www.mlit.go.jp/statistics/details/t-other-2_tk_000196.html (物流センサス; 2021: e-Stat)', 'etl-census'],
  [/^data\/raw\/census2020\/000032214569/, 'https://www.e-stat.go.jp/stat-search/files?toukei=00200521 (国勢調査2020 第12表)', 'etl-muni'],
  [/^data\/raw\/census2020\/000040067885/, 'https://www.e-stat.go.jp/stat-search/files?toukei=00200553 (経済センサス2021 第9-1B表)', 'etl-muni'],
  [/^data\/raw\/industry\/2025-k4-data/, 'https://www.e-stat.go.jp/stat-search/files?toukei=00200555 (経済構造実態調査2025 製造業 参考表, statInfId 000040480531)', 'etl-demand'],
  [/^data\/raw\/jobs\//, 'https://www.e-stat.go.jp/stat-search/files?toukei=00450222 (職業安定業務統計)', 'etl-jobs'],
  [/^data\/raw\/ssw\//, 'https://www.moj.go.jp/isa/applications/ssw/nyuukokukanri07_00215.html', 'etl-ssw'],
  [/^data\/raw\/suigai\//, 'https://www.e-stat.go.jp/stat-search/files?toukei=00600590 (水害統計 表-2)', 'etl-suigai'],
  [/^data\/raw\/land\/L01/, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L01-2026.html', 'etl-muni'],
  [/^data\/raw\/land\/L02/, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L02-2026.html', 'etl-muni'],
  [/^data\/raw\/land\/toshikeikaku/, 'https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000217.html (都市計画現況調査)', 'etl-muni'],
  [/^data\/raw\/mesh\/1km_mesh/, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-mesh1000r6.html', 'etl-mesh'],
  [/^data\/raw\/multimodal\/C02/, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C02-2014.html', 'etl-multimodal'],
  [/^data\/raw\/multimodal\/C28/, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C28-2021.html', 'etl-multimodal'],
  [/^data\/raw\/multimodal\/airport/, 'https://www.mlit.go.jp/koku/15_bf_000185.html (空港管理状況調書)', 'etl-multimodal'],
  [/^data\/raw\/multimodal\/port/, 'https://www.mlit.go.jp/k-toukei/kowan.html (港湾統計)', 'etl-multimodal'],
  [/^data\/raw\/multimodal\/p31/, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P31.html', 'etl-multimodal'],
  [/^data\/raw\/demand\/juki/, 'https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html', 'etl-demand'],
  [/^data\/raw\/demand\/J51/, 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/ichiran09_25.html', 'etl-demand'],
  [/^data\/raw\/wage\//, 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/', 'etl-demand'],
  [/^data\/raw\/zoning\//, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A29-2019.html', 'build-zoning'],
  [/^data\/raw\/diesel\//, 'https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html', 'etl-diesel'],
];
// downloaded sources only: caches and intermediates (tiles, API answers, *.json we derive) are left out
const isSource = (p) => /\.(zip|xlsx?|csv|geojson)$/.test(p) && !/\/(risk|hazard)\//.test(p) && !/\/(c02|c28a?|c28p)\//.test(p);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) { if (!/^N0[36]-\d+$|_GML$|Shift-JIS|UTF-8|tmp/.test(e.name)) walk(p, out); }
    else out.push(relative(root, p));
  }
  return out;
}
const sha = (p) => createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex');

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { files: [] };
if (process.argv.includes('--update')) {
  const files = [...walk(resolve(root, 'data/raw')), ...walk(resolve(root, 'data/geo'))].filter(isSource).sort();
  const entries = files.map((f) => {
    const src = SOURCES.find(([re]) => re.test(f));
    const old = prev.files.find((x) => x.file === f);
    return { file: f, bytes: statSync(resolve(root, f)).size, sha256: sha(f), source: old?.source ?? src?.[1] ?? '', script: src?.[2] ?? '' };
  });
  writeFileSync(OUT, JSON.stringify({ note: 'raw inputs of the published data; verify with: node scripts/raw-manifest.mjs', files: entries }, null, 1) + '\n');
  console.log(`raw-manifest: ${entries.length} files, ${(entries.reduce((s, e) => s + e.bytes, 0) / 1e6).toFixed(0)} MB; without a source: ${entries.filter((e) => !e.source).map((e) => e.file).join(', ') || 'none'}`);
} else {
  let missing = 0, changed = 0;
  for (const e of prev.files) {
    const p = resolve(root, e.file);
    if (!existsSync(p)) { missing++; console.log(`missing  ${e.file}  ← ${e.source}`); continue; }
    if (statSync(p).size !== e.bytes || sha(e.file) !== e.sha256) { changed++; console.log(`changed  ${e.file}  (${e.script})`); }
  }
  console.log(`raw-manifest: ${prev.files.length} files, ${missing} missing, ${changed} changed`);
  if (process.argv.includes('--strict') && (missing || changed)) process.exit(1);
}
