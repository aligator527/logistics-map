// App icons for the web manifest (public/icon-*.png) rendered from the logo with Playwright.
//   node scripts/build-icons.mjs
import { chromium } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// same drawing as public/favicon.svg; the maskable one keeps the logo inside the 80% safe zone
const logo = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="${pad ? 0 : 7}" fill="#0168b0"/>
  <g transform="translate(16 16) scale(${pad ? 0.72 : 1}) translate(-16 -16)"><path d="M7 22V13l9-5 9 5v9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><rect x="12" y="16" width="8" height="6" fill="#f2a900"/></g></svg>`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${logo(pad).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: resolve(root, 'public', name), omitBackground: true });
  console.log(name);
}
await browser.close();
