import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

test('QR Yes and No end on persistent confirmations with a blocked-safe close action', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  const submissions = [];
  const createResults = [503, 200];
  let createdRequests = 0;
  server.middlewares.use(async (request, response, next) => {
    if (request.url !== '/__bay-confirmation') return next();
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url,
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/bayConfirmation.fixture.jsx"></script>'));
  });

  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 375, height: 900 }, hasTouch: true });
    await context.addInitScript(() => {
      window.closeAttempts = 0;
      window.close = () => { window.closeAttempts += 1; };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/mock-api/api/v1/public/bays/test-bay-id', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ bay_number: 9, bay_side: 'B', course_name: 'TEST Driving Range', available: true }),
    }));
    await page.route('**/mock-api/api/v1/public/bays/test-bay-id/requests', async (route) => {
      const request = route.request();
      submissions.push(request.postDataJSON());
      const status = createResults.shift();
      if (status === 200) createdRequests += 1;
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(status === 200 ? { status: 'accepted' } : { error: 'Temporary request failure.' }),
      });
    });

    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    await page.goto(`${origin}/__bay-confirmation`);
    await page.getByRole('heading', { name: 'Bay 9B', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Would you like a server to come and take your order?', exact: true }).waitFor();
    await page.getByRole('button', { name: 'No', exact: true }).tap();
    await page.getByRole('heading', { name: 'No service request was sent.', exact: true }).waitFor();
    const noClose = page.getByRole('button', { name: 'Close Window', exact: true });
    await noClose.waitFor();
    assert.equal(submissions.length, 0, 'No must not submit a request');
    for (const width of [375, 430]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No confirmation overflows at ${width}px`);
      const box = await noClose.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
    }
    await noClose.tap();
    assert.equal(await page.evaluate(() => window.closeAttempts), 1);
    await page.getByRole('heading', { name: 'No service request was sent.', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Reload bay page', exact: true }).count(), 0);

    await page.reload();
    await page.getByRole('button', { name: 'Yes', exact: true }).tap();
    await page.getByRole('button', { name: 'Retry request', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Thank you!', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Close Window', exact: true }).count(), 0);
    assert.match(await page.getByRole('alert').innerText(), /Your request has not been confirmed/);
    assert.equal(createdRequests, 0, 'A failed response must not be presented as a created request');

    await page.getByRole('button', { name: 'Retry request', exact: true }).tap();
    await page.getByRole('heading', { name: 'Thank you!', exact: true }).waitFor();
    await page.getByText('A server will visit your bay shortly.', { exact: true }).waitFor();
    const yesClose = page.getByRole('button', { name: 'Close Window', exact: true });
    await yesClose.waitFor();
    assert.equal(createdRequests, 1, 'Only the successful response represents a created request');
    assert.equal(submissions.length, 2);
    assert.equal(submissions[0].operation_id, submissions[1].operation_id, 'Retry must preserve the original submission identity');
    for (const width of [375, 430]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Yes confirmation overflows at ${width}px`);
      const box = await yesClose.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
    }
    const confirmationUrl = page.url();
    await yesClose.tap();
    assert.equal(await page.evaluate(() => window.closeAttempts), 1);
    await page.getByRole('heading', { name: 'Thank you!', exact: true }).waitFor();
    assert.equal(page.url(), confirmationUrl, 'Blocked close must not redirect or reload');
    assert.equal(await page.getByRole('button', { name: 'Reload bay page', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
