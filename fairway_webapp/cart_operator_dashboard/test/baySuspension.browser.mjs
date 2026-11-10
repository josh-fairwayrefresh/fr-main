import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const SUSPENDED_MESSAGE = 'Sorry, we are outside of service hours. You may close this window.';

test('suspended QR page is message-only; active and indeterminate states are safe', {
  timeout: 90000,
}, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (request.url !== '/__bay-suspension') return next();
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url,
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/baySuspension.fixture.jsx"></script>'));
  });

  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 375, height: 900 } });
    try {
      const page = await context.newPage();
      const errors = [];
      let submissions = 0;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/mock-api/api/v1/public/bays/test-bay-id', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bay_number: 9, bay_side: 'B', course_name: 'TEST Driving Range', available: true,
        }),
      }));
      await page.route('**/mock-api/api/v1/public/bays/test-bay-id/requests', (route) => {
        submissions += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"accepted"}' });
      });

      const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
      await page.goto(`${origin}/__bay-suspension`);
      await page.getByRole('heading', {
        name: 'Would you like a server to come and take your order?', exact: true,
      }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Bay 9B', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Yes', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'No', exact: true }).count(), 1);
      assert.equal(submissions, 0);

      await page.evaluate(() => sessionStorage.setItem(
        'fairway.bay.submission.test-bay-id', 'preserved-pending-operation',
      ));
      await page.unroute('**/mock-api/api/v1/public/bays/test-bay-id');
      await page.route('**/mock-api/api/v1/public/bays/test-bay-id', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bay_number: 9, bay_side: 'B', course_name: 'TEST Driving Range', available: false,
        }),
      }));
      await page.reload();
      await page.getByRole('status').getByText(SUSPENDED_MESSAGE, { exact: true }).waitFor();
      assert.equal(await page.locator('main').innerText(), SUSPENDED_MESSAGE);
      assert.equal(await page.locator('main').locator('> *').count(), 1);
      assert.equal(await page.getByRole('button').count(), 0);
      assert.equal(await page.getByRole('link').count(), 0);
      assert.equal(submissions, 0);
      assert.equal(await page.evaluate(() => sessionStorage.getItem(
        'fairway.bay.submission.test-bay-id',
      )), 'preserved-pending-operation');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

      await page.unroute('**/mock-api/api/v1/public/bays/test-bay-id');
      await page.route('**/mock-api/api/v1/public/bays/test-bay-id', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ bay_number: 9, course_name: 'TEST Driving Range' }),
      }));
      await page.reload();
      await page.getByRole('alert').getByText(
        'Unable to verify Driving Range service availability.', { exact: true },
      ).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Yes', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Retry request', exact: true }).count(), 0);

      await page.unroute('**/mock-api/api/v1/public/bays/test-bay-id');
      await page.route('**/mock-api/api/v1/public/bays/test-bay-id', (route) => route.abort('failed'));
      await page.reload();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Yes', exact: true }).count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
