import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open } from './helpers';

test('street-level view from the URL: detail boundaries, auto background map, scale bar', async ({ page }) => {
  const detail = page.waitForResponse(/geo\/detail\/13\.json/);
  const errors = await open(page, 't=local&mv=15.5/35.6812/139.7671');
  expect((await detail).ok()).toBe(true);
  await expect(page.locator('.scalebar')).toContainText(/\d+ m\b/);
  // no background map chosen, the pale map comes in on its own (named in the source line)
  await expect(page.locator('#basemap')).toHaveValue('');
  await expect(page.locator('.mapcol')).toContainText('淡色地図');
  // the fill has faded into outlines
  const fo = await page.locator('g.areas path[data-code="13101"]').evaluate((p) => Number(getComputedStyle(p).fillOpacity));
  expect(fo).toBeLessThan(0.2);
  await expect(page).toHaveURL(/mv=15\.5\//);
  expect(errors).toEqual([]);
});

test('measure a distance and an area', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse');
  const errors = await open(page, 't=local&mv=16.5/35.7925/139.6130');
  if (await page.locator('.ctl-toggle').isVisible()) await page.locator('.ctl-toggle').click();
  await page.getByRole('button', { name: '距離・面積を測る' }).click();
  const b = (await page.locator('div.map').first().boundingBox())!;
  for (const [fx, fy] of [[0.4, 0.35], [0.6, 0.35], [0.6, 0.6], [0.4, 0.6]]) await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  const box = page.locator('.measure-box');
  await expect(box).toContainText('距離');
  await box.getByRole('button', { name: '閉じて面積' }).click();
  await expect(box).toContainText('面積');
  await expect(box).toContainText('坪');
  // the plot is a few hundred metres across
  const m2 = Number((await box.innerText()).match(/面積\s*([\d,]+) m²/)![1].replace(/,/g, ''));
  expect(m2).toBeGreaterThan(10_000);
  expect(m2).toBeLessThan(200_000);
  await page.keyboard.press('Escape');
  await box.getByRole('button', { name: '完了' }).click();
  await expect(box).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('double click zooms in and the view goes into the URL', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse');
  await open(page, 't=local&mv=10.0/35.70/139.70');
  const b = (await page.locator('div.map').first().boundingBox())!;
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page).toHaveURL(/mv=11\.0\//);
});

test('double tap zooms in on a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch');
  await open(page, 't=local');
  const b = (await page.locator('div.map').first().boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page).toHaveURL(/mv=\d/);
});

// parcels: one real tile from the registry-map tiles (春日井市 瑞穂通), the others empty
const fudeFixture = async (page: import('@playwright/test').Page) => {
  const tile = readFileSync(new URL('./fixtures/fude-16-57702-25903.mvt', import.meta.url));
  await page.route(/tiles\.kmproj\.com\/mojxml/, (r) => r.request().url().includes('/16/57702/25903.')
    ? r.fulfill({ body: tile, contentType: 'application/vnd.mapbox-vector-tile' }) : r.fulfill({ status: 204, body: '' }));
};

test('land parcels with their lot number under the pointer', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'hover');
  const errors = await open(page, 't=local&mv=17.0/35.2490/136.9710', { before: fudeFixture });
  await expect(page.locator('canvas.vec')).toBeAttached();
  await expect(page.locator('.mapcol')).toContainText('登記所備付地図データ');
  const b = (await page.locator('div.map').first().boundingBox())!;
  let found = '';
  for (let i = 1; i < 8 && !found; i++) for (let j = 1; j < 6 && !found; j++) {
    await page.mouse.move(b.x + (b.width * i) / 8, b.y + (b.height * j) / 6);
    const tip = page.locator('.tip').filter({ hasText: '地番' });
    if (await tip.count()) found = await tip.first().innerText();
  }
  expect(found).toMatch(/地番 \S+/);
  expect(found).toContain('春日井市');
  expect(errors).toEqual([]);
});

test('no parcel data here: said so on the map', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  await open(page, 't=local&mv=16.5/35.7925/139.6130', { before: fudeFixture });
  await expect(page.locator('.tiles-hint')).toContainText('筆界データがありません');
});

test('a measured plot goes into the shortlist and onto the map', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse');
  const errors = await open(page, 't=local&mv=16.5/35.2500/136.9700');
  await page.getByRole('button', { name: '距離・面積を測る' }).click();
  const b = (await page.locator('div.map').first().boundingBox())!;
  for (const [fx, fy] of [[0.4, 0.35], [0.6, 0.35], [0.6, 0.6], [0.4, 0.6]]) await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  const box = page.locator('.measure-box');
  await box.getByRole('button', { name: '閉じて面積' }).click();
  await box.getByRole('button', { name: /候補に追加/ }).click();
  await box.getByRole('button', { name: '完了' }).click();
  await page.getByRole('tab', { name: /候補/ }).click();
  await expect(page.locator('aside ul.short li').filter({ hasText: '区画' })).toContainText(/\d+\.\d\d ha/);
  await expect(page.locator('path.plot')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('1 km cell under the pointer on a reach map', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'hover');
  await open(page, 't=local&lk=iso&mu=23206&io=muni:23206&ig=1&mv=11.5/35.30/137.05');
  await expect(page.locator('canvas.raster:not(.vec)')).toBeAttached({ timeout: 20_000 });
  const b = (await page.locator('div.map').first().boundingBox())!;
  await expect(async () => {
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
    await page.mouse.move(b.x + b.width * 0.31, b.y + b.height * 0.31);
    await expect(page.locator('.tip').filter({ hasText: '1kmメッシュ' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('.tip').filter({ hasText: '1kmメッシュ' })).toContainText('人口');
});

test('side panel: tabs, width and hiding (wide screens)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'wide layout');
  const errors = await open(page, 't=local&mu=23206');
  const side = page.locator('aside.side');
  // the panel scrolls on its own and is never taller than the window
  const vh = page.viewportSize()!.height;
  expect((await side.boundingBox())!.height).toBeLessThanOrEqual(vh);
  await page.getByRole('tab', { name: '指標' }).click();
  await expect(page).toHaveURL(/tb=metrics/);
  await expect(side).toContainText('市区町村の指標');
  await page.getByRole('tab', { name: '指標' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: '到達圏・計算' })).toHaveAttribute('aria-selected', 'true');
  // narrower with the keyboard on the splitter
  const w0 = (await side.boundingBox())!.width;
  await page.getByRole('separator').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  expect((await side.boundingBox())!.width).toBeLessThan(w0 - 40);
  // hide: the map takes the width, one button brings the panel back
  const m0 = (await page.locator('div.map').first().boundingBox())!.width;
  await page.getByRole('button', { name: 'パネルを隠す' }).click();
  await expect(side).toBeHidden();
  expect((await page.locator('div.map').first().boundingBox())!.width).toBeGreaterThan(m0 + 200);
  await page.getByRole('button', { name: 'パネルを表示' }).click();
  await expect(side).toBeVisible();
  expect(errors).toEqual([]);
});

test('screening funnel greys out municipalities and survives the link', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  const errors = await open(page, 't=local&tb=screen');
  await page.getByRole('button', { name: '物流用地の例を使う' }).click();
  await expect(page).toHaveURL(/fx=zone\.ge\.20~/);
  const result = page.locator('.screen .result');
  const n = Number((await result.innerText()).match(/([\d,]+)\s*\//)![1].replace(/,/g, ''));
  expect(n).toBeGreaterThan(20);
  expect(n).toBeLessThan(1000);
  await expect(page.locator('g.areas path.out').first()).toBeAttached();
  await expect(page.getByRole('tab', { name: new RegExp(`絞り込み\\s*${n}`) })).toBeVisible();
  // the same conditions from the link
  await page.reload();
  await expect(page.locator('.screen .result')).toContainText(String(n.toLocaleString('ja-JP')));
  expect(errors).toEqual([]);
});

test('candidate status and note; back and forward between places', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  await page.addInitScript(() => localStorage.setItem('shortlist', JSON.stringify([{ kind: 'muni', code: '23206' }])));
  await open(page, 't=local&mu=23206&tb=short');
  await page.locator('ul.short select').selectOption('nego');
  await page.locator('ul.short .note-btn').click();
  await page.locator('ul.short textarea').fill('地権者と面談済み');
  await page.locator('ul.short textarea').blur();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shortlist')!));
  expect(saved[0]).toMatchObject({ status: 'nego', note: '地権者と面談済み' });
  // a place picked from a list is a step in the history
  await page.getByRole('tab', { name: '概要' }).click();
  await page.locator('aside .panel', { hasText: '上位の市区町村' }).getByRole('button').first().click();
  await expect(page).toHaveURL(/mu=13102/);
  await page.getByRole('button', { name: '前の表示' }).click();
  await expect(page).toHaveURL(/mu=23206/);
  await page.getByRole('button', { name: '次の表示' }).click();
  await expect(page).toHaveURL(/mu=13102/);
});
