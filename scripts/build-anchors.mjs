// Prefecture anchor points for flow arcs -> public/geo/anchors.json
//
//   node scripts/build-anchors.mjs
//
// Arcs start and end at the prefectural government office (県庁所在地), not at the polygon
// centroid: Tokyo's centroid is pulled south by the Izu / Ogasawara islands and Hokkaido's sits in
// empty mountains. Coordinates (WGS84, ≈0.01°) are projected like every other point layer.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, r10 } from './lib/project.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// [lat, lon] of each 都道府県庁, code order 01..47
const OFFICES = [
  [43.064, 141.347], [40.824, 140.740], [39.704, 141.153], [38.269, 140.872], [39.719, 140.102],
  [38.240, 140.363], [37.750, 140.468], [36.342, 140.447], [36.566, 139.884], [36.391, 139.061],
  [35.857, 139.649], [35.605, 140.123], [35.690, 139.692], [35.448, 139.642], [37.902, 139.023],
  [36.695, 137.211], [36.595, 136.626], [36.065, 136.222], [35.664, 138.568], [36.651, 138.181],
  [35.391, 136.722], [34.977, 138.383], [35.180, 136.907], [34.730, 136.509], [35.004, 135.868],
  [35.021, 135.756], [34.686, 135.520], [34.691, 135.183], [34.685, 135.833], [34.226, 135.168],
  [35.504, 134.238], [35.472, 133.051], [34.662, 133.935], [34.397, 132.460], [34.186, 131.471],
  [34.066, 134.559], [34.340, 134.043], [33.842, 132.766], [33.560, 133.531], [33.607, 130.418],
  [33.249, 130.299], [32.745, 129.874], [32.790, 130.742], [33.238, 131.613], [31.911, 131.424],
  [31.560, 130.558], [26.212, 127.681],
];
const out = OFFICES.map(([lat, lon]) => r10(project([lon, lat])));
writeFileSync(resolve(root, 'public/geo/anchors.json'), JSON.stringify(out));
console.log(`wrote anchors.json: ${out.length} prefectures`);
