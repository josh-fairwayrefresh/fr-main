import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

test('integrated service selector preserves Cart surfaces and hides Range inventory/session/KPIs at phone and iPad widths', { timeout: 60000 }, async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use('/__range-release', async (_request, response, next) => {
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__range-release',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/drivingRangeRelease.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__range-release`);
    const selector = page.getByLabel('Select course');
    await selector.waitFor();
    assert.deepEqual(await selector.locator('option').allTextContents(), ['Cart service', 'Driving range service']);
    for (const width of [375, 430, 768, 1024]) {
      await page.setViewportSize({ width, height: 1100 });
      await selector.selectOption('CUST-0001/COURSE-0001');
      await page.getByRole('heading', { name: 'Hole 7', exact: true }).waitFor();
      assert.equal(await page.locator('.op-inventory').count(), 1);
      assert.equal(await page.locator('.op-performance').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await selector.selectOption('CUST-0001/COURSE-0003');
      await page.getByRole('heading', { name: 'Bay 9A', exact: true }).waitFor();
      assert.equal(await page.locator('.op-inventory, .op-performance, .inventory-session').count(), 0);
      assert.equal(await page.evaluate(() => releaseCalls.some(call => call.path.includes('/inventory/courses/CUST-0001/COURSE-0003'))), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('button', { name: 'History', exact: true }).click();
      await page.getByRole('heading', { name: 'Request outcomes' }).waitFor();
      assert.equal(await page.locator('.op-metrics').count(), 0);
      await page.getByRole('button', { name: 'Requests', exact: true }).click();
    }
    assert.equal(await page.evaluate(() => releaseCalls.some(call => call.method !== 'GET')), false);
  } finally { await browser?.close(); await server.close(); }
});
