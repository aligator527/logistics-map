// Daily check of the published site (LIVE_URL=https://aligator527.github.io/logistics-map/ npx playwright test)
// — with the real third parties, so a broken source shows up before a user finds it.
import { test, expect } from '@playwright/test';

test.use({ locale: 'ja-JP' });

test('site, data and live sources load', async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./#t=now&nw=1');
  await expect(page.locator('main#main')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(errors, errors.join('\n')).toEqual([]);

  // every data file the app reads
  for (const f of ['data/warehouse.json', 'data/muni.json', 'data/news.json', 'data/diesel.json', 'data/jma-areas.json', 'geo/network.json', 'geo/japan.topo.json']) {
    const r = await request.get(new URL(f, baseURL).toString());
    expect(r.ok(), f).toBe(true);
  }
  // JMA warnings reached the page (the time stamp is shown once loaded)
  await expect(page.locator('aside')).toContainText(/更新|Updated/, { timeout: 30_000 });
  await expect(page.locator('aside')).not.toContainText(/取得できません|could not be loaded/);

  // 地理院タイル and the elevation API answer (background maps, 地点を調べる)
  expect((await request.get('https://cyberjapandata.gsi.go.jp/xyz/pale/12/3638/1612.png')).ok(), 'GSI tile').toBe(true);
  const elev = await (await request.get('https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=139.8&lat=35.7&outtype=JSON')).json();
  expect(typeof elev.elevation, 'GSI elevation API').toBe('number');

  // news: fresh enough, and preview images actually load
  const news = await (await request.get(new URL('data/news.json', baseURL).toString())).json();
  const age = (Date.now() - Date.parse(news.generated)) / 864e5;
  expect(age, 'news.json older than 3 days').toBeLessThan(3);
  const imgs = page.locator('.callout img');
  if (await imgs.count()) {
    await expect.poll(async () => imgs.first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
});
