// End-to-end checks of the built site (npm run e2e). CI runs them on every push; the daily
// site check runs e2e/live.spec.ts against the published GitHub Pages site.
import { defineConfig, devices } from '@playwright/test';

const live = !!process.env.LIVE_URL;

/** E2E_PORT: when 4173 is taken by another project's preview server */
const port = Number(process.env.E2E_PORT ?? 4173);
export default defineConfig({
  testDir: 'e2e',
  testMatch: live ? '**/live.spec.ts' : '**/*.spec.ts',
  testIgnore: live ? undefined : '**/live.spec.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: live ? process.env.LIVE_URL : `http://localhost:${port}/`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    // blocked routes must apply to every request (a service worker would fetch on its own)
    serviceWorkers: live ? 'allow' : 'block',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: live ? undefined : {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
