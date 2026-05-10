import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.test.js'],
  timeout: 30000,

  expect: {
    timeout: 5000,
  },

  fullyParallel: false,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // package.json runs Playwright from inside /tests.
    // Therefore ".." is the repository root.
    command: 'npx serve .. -p 3000 --no-clipboard',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
