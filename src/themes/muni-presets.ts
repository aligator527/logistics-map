// Presets of the municipal site score (kept apart so the controls do not pull in the theme).
import type { Preset } from '../lib/score';

export const MUNI_PRESETS: Preset[] = [
  { key: 'balanced', ja: 'バランス', en: 'Balanced', weights: {} },
  { key: 'consumer', ja: '大消費地に近い', en: 'Near consumers', weights: { pop30: 4, pop60: 3, ic: 2, land: 1, zone: 1, cluster: 1, pool: 1, drivers: 0, handlers: 0 } },
  { key: 'hub', ja: '広域配送ハブ', en: 'Wide-area hub', weights: { ic: 4, pop60: 3, cluster: 2, zone: 2, land: 2, port: 2, pop30: 1, pool: 1 } },
  { key: 'cost', ja: 'コスト重視', en: 'Low cost', weights: { land: 5, zone: 3, ic: 2, pop30: 1, pop60: 1, cluster: 0, pool: 1 } },
  { key: 'labour', ja: '人手を確保しやすい', en: 'Easier hiring', weights: { pool: 5, drivers: 2, handlers: 2, pop30: 1, ic: 1, land: 1, zone: 1, cluster: 0 } },
  { key: 'safe', ja: '災害リスクを避ける', en: 'Low hazard', weights: {} },
];
