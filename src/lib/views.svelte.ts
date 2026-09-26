// Saved views: a name for the current map state (the URL hash), kept in this browser.
export interface SavedView { name: string; hash: string; at: string }
const KEY = 'savedViews';
function read(): SavedView[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string' && typeof x.hash === 'string') : []; }
  catch { return []; }
}
class Views {
  items = $state<SavedView[]>(read());
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* private mode */ } }
  add(name: string, hash: string) {
    this.items = [{ name: name.slice(0, 60), hash, at: new Date().toISOString().slice(0, 10) }, ...this.items.filter((v) => v.name !== name)].slice(0, 30);
    this.save();
  }
  remove(name: string) { this.items = this.items.filter((v) => v.name !== name); this.save(); }
}
export const views = new Views();
