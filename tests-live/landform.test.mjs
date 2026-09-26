// Landform class names against places whose landform is well known (needs the network: run by the
// daily site check). Guards the code → name table in src/lib/pointinfo.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInfo } from '../src/lib/pointinfo.ts';

const CASES = [
  ['鳥取砂丘', 134.229, 35.541, '砂州・砂丘', null],
  ['黒部川扇状地（入善町）', 137.505, 36.929, '扇状地', null],
  ['輪中（愛西市）', 136.728, 35.165, '氾濫平野', null],
  ['武蔵野台地（府中市）', 139.477, 35.669, '台地・段丘', null],
  ['上町台地（大阪市）', 135.517, 34.67, '台地・段丘', null],
  ['葛飾区', 139.847, 35.743, '氾濫平野', null],
  ['此花区（埋立地）', 135.43, 34.66, null, '盛土地・埋立地'],
  ['お台場（埋立地）', 139.775, 35.625, null, '盛土地・埋立地'],
  ['多摩ニュータウン（人工平坦地）', 139.42, 35.62, null, '人工平坦地'],
];
for (const [name, lon, lat, natural, artificial] of CASES) {
  test(`landform: ${name}`, async () => {
    const i = await pointInfo(lon, lat);
    if (natural) assert.equal(i.natural?.ja, natural);
    if (artificial) assert.equal(i.artificial?.ja, artificial);
    assert.ok(i.elev === null || (i.elev > -10 && i.elev < 4000));
  });
}
