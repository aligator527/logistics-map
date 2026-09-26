// End-to-end checks of the built site (npm run e2e). CI runs them on every push; the daily
// site check runs e2e/live.spec.ts against the published GitHub Pages site.
import { defineConfig, devices } from '@playwright/test';

const live = !!process.env.LIVE_URL;

export default defineConfig({
  testDir: 'e2e',
  testMatch: live ? 'live.spec.ts' : /^(?!live).*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: live ? process.env.LIVE_URL : 'http://localhost:4173/',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: live ? undefined : {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
