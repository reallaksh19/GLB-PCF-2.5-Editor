import { test, expect } from '@playwright/test';

test('Slice 0 baseline: app shell loads from index.html', async ({ page }) => {
  const pageErrors = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/GLB-PCF-Editor/i);
  await expect(page.locator('#hifi-shell')).toBeVisible();
  await expect(page.locator('#hifi-topbar')).toBeVisible();
  await expect(page.locator('#hifi-panel-viewer')).toBeVisible();
  await expect(page.locator('#hifi-viewer-canvas')).toBeVisible();
  await expect(page.locator('#hifi-statusbar')).toBeVisible();

  // Allow immediate module boot errors to surface.
  await page.waitForTimeout(500);

  expect(pageErrors).toEqual([]);
});
