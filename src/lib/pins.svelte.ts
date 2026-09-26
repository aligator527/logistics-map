// Metrics pinned to the overview tab (up to four), kept in this browser.
const KEY = 'pinnedMetrics';
function read(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 4) : []; } catch { return []; }
}
class Pins {
  keys = $state<string[]>(read());
  has(k: string) { return this.keys.includes(k); }
  toggle(k: string) {
    this.keys = this.has(k) ? this.keys.filter((x) => x !== k) : [...this.keys, k].slice(-4);
    try { localStorage.setItem(KEY, JSON.stringify(this.keys)); } catch { /* private mode */ }
  }
}
export const pins = new Pins();
