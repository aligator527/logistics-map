import { test, expect } from '@playwright/test';
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
