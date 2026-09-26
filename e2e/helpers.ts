import { expect, type Page } from '@playwright/test';

/** Offline third parties (JMA live data, PR TIMES images) — the site must cope with both failing —
 *  and collect console errors. */
export async function open(page: Page, hash = '', opts: { theme?: 'light' | 'dark' } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // failed third-party requests are expected here (blocked on purpose)
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push(m.text());
  });
  await page.route(/bosai|jma\.go\.jp|prcdn\.freetls\.fastly\.net/, (r) => r.abort());
  await page.addInitScript((theme) => {
    try { localStorage.setItem('lang', 'ja'); if (theme) localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, opts.theme ?? 'light');
  await page.goto(`./${hash ? `#${hash}` : ''}`);
  await expect(page.locator('main#main')).toBeVisible();
  // the map and its municipal layer are loaded lazily
  await page.waitForLoadState('networkidle');
  return errors;
}

export async function noHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, 'page wider than the viewport').toBeLessThanOrEqual(cw + 1);
}

type Box = { x: number; y: number; width: number; height: number };
export const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
