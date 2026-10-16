import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'firefox',
        launchOptions: { firefoxUserPrefs: { 'browser.tabs.remote.autostart': false } },
      },
    },
  ],
  webServer: {
    command: 'node ../server/dist/index.js',
    url: 'http://localhost:8080/api/health',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
