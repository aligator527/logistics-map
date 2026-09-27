// シナリオ比較: named sets of settings (the URL state, the cost assumptions, your candidate weights) with a snapshot
// of what they gave for each shortlisted place when saved — so two or three what-ifs can be read side by side and
// any of them brought back. Kept in this browser.
import { costs, type CostInputs } from './costs.svelte';
import { shortWeights } from './shortweights.svelte';

export interface ScenarioResult { label: string; score: number | null; tco: number | null; delivery: number | null }
export interface Scenario {
  name: string; at: string; hash: string; costs: CostInputs; weights: Record<string, number>;
  /** what the settings meant: screening survivors, and per candidate */
  screened: number | null; results: ScenarioResult[]; notes: string[];
}
const KEY = 'scenarios';
function read(): Scenario[] { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

class Scenarios {
  list = $state<Scenario[]>(read());
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.list)); } catch { /* private mode */ } }
  add(s: Scenario) { this.list = [...this.list.filter((x) => x.name !== s.name), s].slice(-4); this.save(); }
  remove(name: string) { this.list = this.list.filter((x) => x.name !== name); this.save(); }
  /** bring a scenario's settings back */
  apply(s: Scenario) {
    costs.inputs = { ...costs.inputs, ...s.costs }; costs.save();
    shortWeights.replace(s.weights);
    location.hash = s.hash;
  }
}
export const scenarios = new Scenarios();
