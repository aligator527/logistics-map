// Screenshot comparison of views whose data seldom changes (VISUAL=1, run in the Playwright Docker
// image so fonts and anti-aliasing match CI). Update the baselines after an intended change:
//   npm run visual:update
import { test, expect } from '@playwright/test';
import { open } from './helpers';

test.skip(!process.env.VISUAL, 'screenshot comparison runs in the Playwright container (VISUAL=1)');

const VIEWS = [
  ['flows', 't=flows'],
  ['local-flood', 't=local&lk=hz_flood'],
  ['reach-network', 't=local&lk=shift&io=net:dpl&ig=1'],
  ['zoning-saitama', 't=local&lk=zone&r=11&zn=1&dpl=0'],
] as const;

for (const [name, hash] of VIEWS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${name} ${theme}`, async ({ page }) => {
      await open(page, hash, { theme });
      if (hash.includes('ig=1')) await expect(page.locator('canvas.raster')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800); // zoom transition and canvas redraw
      await expect(page.locator('.mapcol')).toHaveScreenshot(`${name}-${theme}.png`, { maxDiffPixelRatio: 0.01, animations: 'disabled' });
    });
  }
}
