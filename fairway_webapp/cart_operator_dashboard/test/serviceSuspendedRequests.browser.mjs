import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

test('service-suspended requests render red, clear durably, and remain in history', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__service-suspended') &&
        request.url !== '/' && !request.url.startsWith('/?')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__service-suspended',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/serviceSuspendedRequests.fixture.jsx"></script>'));
    } catch (error) {
      next(error);
    }
  });

  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    await page.goto(`${origin}/__service-suspended?customer_id=CUST-0001&course_id=COURSE-0001`);
    await page.getByRole('heading', { name: 'Hole 3', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Complete service', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Cancel request', exact: true }).count(), 1);
    assert.equal(await page.locator('.op-priority.rejected').count(), 0);

    const course = page.getByLabel('Select course');
    for (const width of [375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await course.selectOption('CUST-0001/COURSE-0003');
      await page.getByText('Request Rejected — Service Suspended', { exact: true }).waitFor();
      assert.equal(await page.locator('.op-priority.rejected').count(), 1);
      assert.equal(await page.locator('.op-priority.rejected').evaluate(
        (element) => getComputedStyle(element).borderColor,
      ), 'rgb(215, 162, 155)');
      assert.equal(await page.locator('.op-rejection-label').evaluate(
        (element) => getComputedStyle(element).color,
      ), 'rgb(165, 46, 38)');
      await page.getByRole('heading', { name: 'Hole 7', exact: true }).waitFor();
      assert.match(await page.locator('.op-time small').innerText(), /^Received /);
      assert.equal(await page.getByRole('button', { name: 'Clear Rejected Request', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Complete service', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Cancel request', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.getByRole('button', { name: 'Clear Rejected Request', exact: true }).click();
    await page.getByRole('heading', { name: 'No active requests', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.requestActions.map(({ action }) => action)), ['clear-rejected']);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.locator('.op-history-view .op-outcome.rejected').getByText('Service Suspended', { exact: true }).waitFor();
    await page.reload();
    await course.waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'No active requests', exact: true }).waitFor();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.locator('.op-history-view .op-outcome.rejected').getByText('Service Suspended', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
