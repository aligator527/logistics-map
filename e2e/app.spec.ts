import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open, noHorizontalScroll, overlap } from './helpers';

const THEMES = [
  ['warehouse', ''],
  ['flows', 't=flows'],
  ['labour', 't=labour'],
  ['local', 't=local'],
  ['score', 't=score&sl=muni'],
  ['now', 't=now'],
] as const;

for (const [name, hash] of THEMES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${name} (${theme}) opens cleanly`, async ({ page }, info) => {
      const errors = await open(page, hash, { theme });
      await expect(page.locator('svg[role="application"]')).toBeVisible();
      await expect(page.locator('aside .panel').first()).toBeVisible();
      await noHorizontalScroll(page);
      expect(errors, errors.join('\n')).toEqual([]);
      await info.attach(`${name}-${theme}`, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
    });
  }
}

test('accessibility: no serious violations', async ({ page }) => {
  for (const [, hash] of THEMES) {
    await open(page, hash);
    const res = await new AxeBuilder({ page })
      // the map canvas is an application region with its own keyboard model
      .exclude('svg.overlay').exclude('.callouts .leaders')
      .analyze();
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${hash}: ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});

test.describe('news on the map', () => {
  test('callouts stay apart, hover does not add cards, click opens related', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'callouts are for wide maps');
    await open(page, 'nw=1');
    const cards = page.locator('.callout');
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    const mapEl = page.locator('div.map').first();
    // card positions relative to the map (hovering may scroll the page)
    const rel = async () => {
      const m = (await mapEl.boundingBox())!;
      return Promise.all(Array.from({ length: n }, async (_, i) => { const b = (await cards.nth(i).boundingBox())!; return { ...b, x: b.x - m.x, y: b.y - m.y }; }));
    };
    const boxes = await rel();
    const map = { ...(await mapEl.boundingBox())!, x: 0, y: 0 };
    for (let i = 0; i < n; i++) {
      const b = boxes[i]!;
      expect(b.x >= map.x - 1 && b.x + b.width <= map.x + map.width + 1, 'card inside the map').toBe(true);
      for (let j = i + 1; j < n; j++) expect(overlap(b, boxes[j]!), `cards ${i} and ${j} overlap`).toBe(false);
    }
    // hovering each card keeps the same set in the same places
    for (let i = 0; i < n; i++) {
      await cards.nth(i).hover();
      await expect(cards).toHaveCount(n);
    }
    expect(await rel()).toEqual(boxes);
    // a click on a card opens it alone with its related news; Esc closes
    await cards.first().locator('.meta').click();
    await expect(cards).toHaveCount(1);
    await expect(page.locator('.callout .more')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.callout .more')).toHaveCount(0);
  });

  test('narrow map: card strip under the map', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'strip is for narrow maps');
    await open(page, 'nw=1');
    await expect(page.locator('.strip .slot').first()).toBeVisible();
    await noHorizontalScroll(page);
  });
});

test('reach map from a municipality', async ({ page }) => {
  const errors = await open(page, 't=local&lk=iso&mu=23206&r=23');
  const panel = page.locator('aside .panel', { hasText: '到達圏の人口' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('名古屋港');
  expect(errors).toEqual([]);
});

test('shortlist: add, export CSV, clear', async ({ page }) => {
  await open(page, 't=local&mu=11203&r=11');
  await page.locator('aside button', { hasText: '候補に追加' }).first().click();
  // the list has its own tab, with the count on it
  await expect(page.getByRole('tab', { name: /候補\s*1/ })).toBeVisible();
  await page.getByRole('tab', { name: /候補/ }).click();
  const list = page.locator('aside ul.short li');
  await expect(list).toHaveCount(1);
  const dl = page.waitForEvent('download');
  await page.locator('aside button', { hasText: 'CSV' }).first().click();
  expect((await dl).suggestedFilename()).toMatch(/^shortlist-.*\.csv$/);
  await page.locator('aside button', { hasText: 'すべて削除' }).click();
  await expect(list).toHaveCount(0);
});

test('English UI has no untranslated keys', async ({ page }) => {
  await open(page, 't=local');
  await page.getByRole('radio', { name: 'EN', exact: true }).first().click();
  const text = await page.locator('body').innerText();
  // a missing i18n key renders as its identifier (lowerCamelCase) or undefined
  expect(text).not.toMatch(/\bundefined\b|\b[a-z]+[A-Z][a-zA-Z]+\b(?![.:/])/);
});

test('network reach on the 1 km grid, 2024 trip types', async ({ page }) => {
  const errors = await open(page, 't=local&lk=shift&io=net:dpl&ig=1');
  const panel = page.locator('aside .panel', { hasText: '2024年ルールでの運行' });
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('aside')).toContainText('到達圏の人口（1km）', { timeout: 30_000 });
  await expect(page.locator('canvas.raster')).toBeVisible();
  expect(errors).toEqual([]);
});

test('shortlist comparison table and rank stability', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('shortlist', JSON.stringify([{ kind: 'muni', code: '23206' }, { kind: 'muni', code: '11203' }, { kind: 'pref', code: '13' }])));
  await open(page, 't=score&sl=muni&mu=11229&r=11&tb=metrics');
  await expect(page.locator('.stab')).toContainText('%');
  await page.getByRole('tab', { name: /候補/ }).click();
  await page.locator('aside button', { hasText: '候補を比較' }).click();
  const table = page.locator('table.cmp');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveCount(4);
  await expect(table.locator('td.best').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(table).toHaveCount(0);
});

test('shared shortlist link offers the list', async ({ page }) => {
  await open(page, 't=local&sl=m23206~p13');
  const banner = page.locator('.shared');
  await expect(banner).toContainText('共有された候補リスト（2）');
  await banner.getByRole('button', { name: '追加する' }).click();
  await expect(page.locator('aside ul.short li')).toHaveCount(2);
});

test('background map layer and fill strength', async ({ page }) => {
  const errors = await open(page, 'bm=pale&r=13');
  await expect(page.locator('canvas.tiles').first()).toBeAttached();
  await expect(page.locator('#basemap')).toHaveValue('pale');
  // phones fold the controls away behind 表示設定
  if (await page.locator('.ctl-toggle').isVisible()) await page.locator('.ctl-toggle').click();
  await expect(page.locator('.base-row input[type=range]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keyboard: prefectures, then municipalities inside one', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard');
  await open(page, 't=local&r=11');
  const map = page.locator('svg[role="application"]');
  // the municipal shapes arrive after the first paint
  await expect(page.locator('g.areas.muni path').first()).toBeAttached({ timeout: 20_000 });
  await map.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/mu=11\d{3}/);
});

test('site memo from a point on the map (GSI offline)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'map click');
  const errors = await open(page, 'r=11');
  await page.getByRole('button', { name: '地点を調べる' }).click();
  const box = (await page.locator('div.map').first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const panel = page.locator('.panel.point');
  await expect(panel).toContainText('標高');
  await panel.getByRole('button', { name: '地点カルテを作成' }).click();
  await expect(page.locator('.dossier-root')).toContainText('地点カルテ');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('非商用 layers come as pictures: roads, ports and rail stations', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  const errors = await open(page, 't=local&bc=1&hb=1&mv=9.5/35.55/139.75');
  await expect(page.locator('canvas.ovl')).toBeAttached();
  await expect.poll(() => asked.filter((u) => /tiles\/logiroads\/\d+\//.test(u)).length).toBeGreaterThan(0);
  await expect.poll(() => asked.filter((u) => /tiles\/hubs\/\d+\//.test(u)).length).toBeGreaterThan(0);
  // no coordinates of those layers are ever fetched
  expect(asked.filter((u) => /logiroads\.json/.test(u))).toEqual([]);
  const mm = await page.evaluate(() => fetch('data/multimodal.json').then((r) => r.json()));
  expect(mm.items.filter((x: { kind: string; lat?: number; p?: unknown }) => x.kind !== 'air' && (x.lat !== undefined || x.p !== undefined))).toEqual([]);
  // the site memo still has the distances (from the 1 km grid)
  await page.getByRole('button', { name: '地点を調べる' }).click();
  const box = (await page.locator('div.map').first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.35);
  await page.locator('.panel.point').getByRole('button', { name: '地点カルテを作成' }).click();
  await expect(page.locator('.dossier-root')).toContainText(/第1次緊急輸送道路\s*約[\d.]+ km/);
  expect(errors).toEqual([]);
});

test('phone: folded controls and the selection bar', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  await open(page, 't=local&mu=23206');
  await expect(page.locator('#basemap')).toBeHidden();
  await page.locator('.ctl-toggle').click();
  await expect(page.locator('#basemap')).toBeVisible();
  const bar = page.locator('.minibar');
  await expect(bar).toContainText('春日井市');
  await bar.getByRole('button').click();
  await expect(bar).toHaveCount(0);
});

test('guide walks through a scenario', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  const errors = await open(page);
  await page.getByRole('button', { name: 'ガイド' }).click();
  await page.locator('.tour-dlg').getByRole('button', { name: /2024年問題/ }).click();
  const tour = page.locator('.tour');
  await expect(tour).toContainText('1 / 4');
  await expect(page).toHaveURL(/lk=shift/);
  await tour.getByRole('button', { name: /次へ/ }).click();
  await expect(page).toHaveURL(/io=net%3Adpl|io=net:dpl/);
  await tour.getByRole('button', { name: '閉じる' }).click();
  await expect(tour).toHaveCount(0);
  expect(errors).toEqual([]);
});
