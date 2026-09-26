// Write a JSON output only when its content changed, ignoring the `generated` date, so that the
// scheduled update job does not commit files whose only difference is the run date.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function writeJson(path, obj) {
  if (existsSync(path)) {
    try {
      const prev = JSON.parse(readFileSync(path, 'utf8'));
      const strip = (o) => JSON.stringify({ ...o, generated: null });
      if (strip(prev) === strip(obj)) { if (prev.generated) obj = { ...obj, generated: prev.generated }; }
    } catch { /* unreadable: overwrite */ }
  }
  const text = JSON.stringify(obj);
  const changed = !existsSync(path) || readFileSync(path, 'utf8') !== text;
  if (changed) writeFileSync(path, text);
  return changed;
}
