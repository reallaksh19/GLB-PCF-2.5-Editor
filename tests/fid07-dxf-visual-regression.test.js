import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve('.');
const DXF_FIXTURE = path.join(ROOT, 'tests/fixtures/dxf/fid07-visual-fixture.dxf');
const ARTIFACT_DIR = path.join(ROOT, 'reports/fid07');

async function findFileInput(page) {
  const selectors = [
    'input[type="file"][accept*=".dxf"]',
    'input[type="file"][accept*="dxf"]',
    'input[type="file"]',
  ];
  for (const selector of selectors) {
    const input = page.locator(selector).first();
    if (await input.count()) return input;
  }
  throw new Error('No file input found for DXF import');
}

test('FID-07 DXF import produces screenshot artifact', async ({ page }) => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  expect(fs.existsSync(DXF_FIXTURE)).toBeTruthy();

  const consoleLines = [];
  page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleLines.push(`[pageerror] ${err.message}`));

  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'networkidle' });
  const fileInput = await findFileInput(page);
  await fileInput.setInputFiles(DXF_FIXTURE);

  await page.waitForTimeout(2500);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('DXF_PARSE_FAIL');
  expect(bodyText).not.toContain('CEG_BUILD_WARN');

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'fid07-dxf-import.png'),
    fullPage: true,
  });

  fs.writeFileSync(path.join(ARTIFACT_DIR, 'fid07-console.log'), consoleLines.join('\n'), 'utf8');
});
