import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['fid07-dxf-visual-regression.test.js'],
  timeout: 60000,
  use: {
    headless: true,
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npx serve . -p 3000 --no-clipboard',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
