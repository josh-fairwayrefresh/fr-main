import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';

test('QR bay page stays white and usable across appearance settings, viewport sizes and states', {
  timeout: 60000,
  skip: process.env.FAIRWAY_QR_FIXTURE ? false : 'requires the private synthetic sandbox fixture',
}, async () => {
  const fixture = JSON.parse(await readFile(process.env.FAIRWAY_QR_FIXTURE, 'utf8'));
  assert.equal(fixture.projectId, 'fairway-refresh-sandbox-qr1');
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ colorScheme, hasTouch: true });
      try {
        const page = await context.newPage();
        let releaseModule;
        const moduleReady = new Promise((resolve) => { releaseModule = resolve; });
        await page.route('**/assets/BayRequestApp-*.js', async (route) => {
          await moduleReady;
          await route.continue();
        });
        await page.goto(`https://${fixture.projectId}.web.app/range/${fixture.bays[0].id}`, { waitUntil: 'domcontentloaded' });
        await page.getByText('Loading bay…', { exact: true }).waitFor();
        assert.equal(await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
        releaseModule();
        await page.getByRole('heading', { name: 'Bay 1A', exact: true }).waitFor();
        for (const width of [375, 430, 768, 1024]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.deepEqual(await page.evaluate(() => ({
            root: getComputedStyle(document.documentElement).backgroundColor,
            body: getComputedStyle(document.body).backgroundColor,
            main: getComputedStyle(document.querySelector('.bay-page')).backgroundColor,
            scheme: getComputedStyle(document.documentElement).colorScheme,
            overflow: document.documentElement.scrollWidth > innerWidth,
          })), {
            root: 'rgb(255, 255, 255)', body: 'rgb(255, 255, 255)', main: 'rgb(255, 255, 255)',
            scheme: 'light', overflow: false,
          });
        }
        await page.getByRole('button', { name: 'No', exact: true }).tap();
        await page.getByRole('heading', { name: 'No service request was sent.', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Close Window', exact: true }).waitFor();
        // Stub submissions so appearance checks cannot create server records.
        await page.route('**/api/v1/public/bays/*/requests', (route) => route.fulfill({
          status: 200, contentType: 'application/json', body: '{"status":"accepted"}',
        }));
        await page.reload();
        await page.getByRole('button', { name: 'Yes', exact: true }).tap();
        await page.getByRole('heading', { name: 'Thank you!', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Close Window', exact: true }).waitFor();
        assert.equal(await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
        await page.unroute('**/api/v1/public/bays/*/requests');
        for (const response of [
          { status: 200, body: { bay_number: 1, course_name: 'TEST Driving Range', available: false }, text: 'Server requests are currently unavailable.' },
          { status: 404, body: { error: 'Bay unavailable for appearance check.' }, text: 'Bay unavailable for appearance check.' },
        ]) {
          await page.route('**/api/v1/public/bays/*', (route) => route.fulfill({
            status: response.status, contentType: 'application/json', body: JSON.stringify(response.body),
          }));
          await page.reload();
          await page.getByText(response.text, { exact: true }).waitFor();
          assert.equal(await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
          await page.unroute('**/api/v1/public/bays/*');
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});
