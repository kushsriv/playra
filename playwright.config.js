// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// This environment ships a pre-installed Chromium and blocks `playwright
// install`, so point at it explicitly. In CI the browser is installed
// normally, so only override when the pre-installed one is present.
const fs = require('fs');
const LOCAL_CHROME = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(LOCAL_CHROME) ? { executablePath: LOCAL_CHROME } : {};

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8910',
    trace: 'on-first-retry',
    launchOptions,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python3 -m http.server 8910',
    url: 'http://127.0.0.1:8910/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
