import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

test('admins can exclude and restore reports while operators see no reporting controls', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__request-reporting') && request.url !== '/' &&
        !request.url.startsWith('/?')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__request-reporting',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/requestReporting.fixture.jsx"></script>'));
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
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const context = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto(`${origin}/__request-reporting`);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.locator('.op-history-list').first().getByText('Bay 1A', { exact: true }).waitFor();
    for (const width of [375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.getByRole('button', { name: 'Exclude', exact: true }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    await page.getByRole('button', { name: 'Exclude', exact: true }).click();
    await page.locator('.op-history-list').first().getByText('Bay 1A', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.locator('.op-reporting-notice').innerText(), 'Bay 1A excluded from reporting.');
    await page.locator('.op-metrics > div').nth(0).locator('strong').getByText('0', { exact: true }).waitFor();
    assert.equal(await page.locator('.op-metrics > div').nth(1).locator('strong').innerText(), '2');

    await page.getByRole('button', { name: 'View excluded requests', exact: true }).click();
    await page.getByRole('heading', { name: 'Excluded Requests', exact: true }).waitFor();
    await page.locator('.op-excluded-content').getByText('Bay 1A', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Restore to Reporting', exact: true }).click();
    await page.locator('.op-history-list').first().getByText('Bay 1A', { exact: true }).waitFor();
    await page.locator('.op-metrics > div').nth(0).locator('strong').getByText('1', { exact: true }).waitFor();
    assert.equal(await page.locator('.op-metrics > div').nth(1).locator('strong').innerText(), '2');
    assert.equal(await page.getByRole('button', { name: 'Restore to Reporting', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(await page.evaluate(() => window.reportingActions.map(({ reporting_state }) => reporting_state)),
      ['excluded', 'active']);

    const operatorPage = await context.newPage();
    await operatorPage.goto(`${origin}/__request-reporting?operator`);
    await operatorPage.getByRole('button', { name: 'History', exact: true }).click();
    await operatorPage.locator('.op-history-list').first().getByText('Bay 1A', { exact: true }).waitFor();
    assert.equal(await operatorPage.getByRole('button', { name: 'Exclude', exact: true }).count(), 0);
    assert.equal(await operatorPage.getByRole('button', { name: 'View excluded requests', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
