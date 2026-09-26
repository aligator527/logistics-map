// Sanity check of refreshed data against the last committed version, before the update jobs commit:
//
//   node scripts/check-data.mjs [files…]       (default: every public/data/*.json that changed)
//
// Fails (exit 1) when a file looks broken rather than updated:
//   * it shrank by more than 20%, or an array got shorter (time series only grow);
//   * more than 2% of its numbers (at least 5) moved by more than 30% — a real update appends a
//     period and revises a few figures, a changed spreadsheet layout shifts whole columns;
//   * news: fewer than half the items of before, or most PR TIMES items without a preview image.
// The job then stops before committing; the summary says what to look at.
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : git('diff', '--name-only', '--', 'public/data').split('\n').filter((f) => f.endsWith('.json'));

const problems = [];
function walk(a, b, path, acc) {
  if (typeof a === 'number' && typeof b === 'number') {
    acc.n++;
    const big = Math.max(Math.abs(a), Math.abs(b));
    if (big > 1e-9 && Math.abs(a - b) / big > 0.3 && Math.abs(a - b) > 0.5) acc.moved.push(`${path}: ${a} → ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (b.length < a.length) acc.shorter.push(`${path}: ${a.length} → ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${path}[${i}]`, acc);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') for (const k of Object.keys(a)) if (k in b && k !== 'generated') walk(a[k], b[k], `${path}.${k}`, acc);
}

for (const f of files) {
  let before;
  try { before = git('show', `HEAD:${f}`); } catch { continue; } // new file
  const after = readFileSync(resolve(root, f), 'utf8');
  if (after.length < before.length * 0.8) problems.push(`${f}: size ${before.length} → ${after.length} bytes`);
  const A = JSON.parse(before), B = JSON.parse(after);
  if (f.endsWith('news.json')) {
    if (B.items.length < A.items.length * 0.5) problems.push(`${f}: ${A.items.length} → ${B.items.length} items`);
    const pr = B.items.filter((i) => /prtimes/.test(i.link));
    if (pr.length >= 10 && pr.filter((i) => i.img).length < pr.length * 0.5) problems.push(`${f}: only ${pr.filter((i) => i.img).length}/${pr.length} PR TIMES items have a preview image`);
    continue;
  }
  const acc = { n: 0, moved: [], shorter: [] };
  walk(A, B, f.replace(/^public\/data\//, ''), acc);
  if (acc.shorter.length) problems.push(`${f}: arrays got shorter — ${acc.shorter.slice(0, 3).join('; ')}`);
  if (acc.moved.length >= 5 && acc.moved.length > acc.n * 0.02) problems.push(`${f}: ${acc.moved.length} of ${acc.n} numbers moved > 30% — e.g. ${acc.moved.slice(0, 3).join('; ')}`);
  console.log(`${f}: ${acc.n} numbers, ${acc.moved.length} moved > 30%`);
}

if (problems.length) {
  const text = `### Data check failed — nothing committed\n\n${problems.map((p) => `- ${p}`).join('\n')}\n`;
  console.error(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  process.exit(1);
}
console.log(`data check: ${files.length} changed file(s) look like normal updates`);
