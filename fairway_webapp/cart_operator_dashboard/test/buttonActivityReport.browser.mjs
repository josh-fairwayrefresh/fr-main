import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('Admin Reports filters existing Customer/Courses, generates/downloads, rejects stale results and shows errors across phone/iPad/desktop', { timeout: 90000 }, async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__button-report')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__button-report',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/buttonActivityReport.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__button-report`);
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    const customer = page.getByLabel('Customer', { exact: true }), course = page.getByLabel('Course', { exact: true });
    await customer.selectOption('CUST-0001');
    assert.deepEqual(await course.locator('option').allTextContents(), ['Select Course', 'Cart Course', 'Driving Range']);
    await course.selectOption('COURSE-0003');
    await customer.selectOption('CUST-0002');
    assert.equal(await course.inputValue(), '');
    assert.deepEqual(await course.locator('option').allTextContents(), ['Select Course', 'Placeholder Course']);
    await course.selectOption('COURSE-0002');
    await page.getByLabel('Start date').fill('2026-10-17');
    await page.getByLabel('End date').fill('2026-10-28');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByRole('button', { name: 'Download PDF', exact: true }).waitFor();
    const generation = await page.evaluate(() => reportCalls.find(call => call.method === 'POST'));
    assert.deepEqual(generation.body, { customer_id: 'CUST-0002', course_id: 'COURSE-0002', start_date: '2026-10-17', end_date: '2026-10-28' });
    assert.equal(generation.authorization, 'Bearer isolated-admin');
    for (const width of [375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('button', { name: 'Download PDF', exact: true }).scrollIntoViewIfNeeded();
      const box = await page.getByRole('button', { name: 'Download PDF', exact: true }).boundingBox();
      assert.ok(box.width >= 100 && box.x >= 0 && box.x + box.width <= width);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'button-activity-CUST-0002-COURSE-0002-2026-10-17-2026-10-28.pdf');
      assert.equal(await readFile(await download.path(), 'utf8'), '%PDF-1.3\nisolated-browser-download-fixture\n');
    }
    assert.equal(await page.evaluate(() => reportCalls.filter(call => call.method === 'POST').length), 1);
    await page.evaluate(() => { reportHold = true; });
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.waitForFunction(() => reportPending.length === 1);
    await customer.selectOption('CUST-0001');
    await page.evaluate(() => { reportHold = false; releaseReports(); });
    assert.equal(await page.getByRole('button', { name: 'Download PDF', exact: true }).count(), 0);
    await course.selectOption('COURSE-0001');
    await page.evaluate(() => { reportFailure = 'Cloud Logging read failed. No report was generated.'; });
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /Cloud Logging read failed/);
    assert.equal(await page.getByRole('button', { name: 'Download PDF', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    assert.ok((await page.evaluate(() => reportCalls)).every(call => call.method === 'GET' || call.path === '/api/v1/admin/reports/button-activity'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
