import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

test('authorized Customer/service context, deep links, stale reads and mutation locks', { timeout: 90000 }, async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__customer-context') && !request.url.startsWith('/requests/')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__customer-context',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/drivingRangeRelease.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.text().includes('same key')) errors.push(message.text()); });
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const customer = page.getByLabel('Select customer');
    const service = page.getByLabel('Select course');
    const release = () => page.evaluate(() => { heldPaths = []; releaseResponses(); });
    const waitForHeld = () => page.waitForFunction(() => pendingResponses.length > 0);
    await page.goto(origin + '/requests/range-request?admin=1&customer_id=CUST-0001&course_id=COURSE-0003');
    await page.getByRole('heading', { name: 'Bay 9A', exact: true }).waitFor();
    assert.equal(await service.inputValue(), 'CUST-0001/COURSE-0003');
    assert.ok(page.url().includes('/requests/range-request'));
    assert.deepEqual(await customer.locator('option').allTextContents(), ['Synthetic Monarch', 'Placeholder Hills']);
    assert.deepEqual(await service.locator('option').allTextContents(), ['Cart service', 'Driving range service']);
    for (const width of [375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await customer.selectOption('CUST-0002');
      await page.getByRole('heading', { name: 'Placeholder marker', exact: true }).waitFor();
      assert.deepEqual(await service.locator('option').allTextContents(), ['Cart service']);
      assert.equal(await service.inputValue(), 'CUST-0002/COURSE-0002');
      assert.equal(new URL(page.url()).search, '?customer_id=CUST-0002&course_id=COURSE-0002');
      assert.ok((await page.locator('.op-inventory').getAttribute('href')).includes('CUST-0002'));
      assert.equal(await page.getByRole('heading', { name: 'Bay 9A', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await customer.selectOption('CUST-0001');
      await service.selectOption('CUST-0001/COURSE-0003');
      await page.getByRole('heading', { name: 'Bay 9A', exact: true }).waitFor();
      assert.equal(await page.locator('.op-inventory,.op-performance,.inventory-session').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    assert.equal(await page.evaluate(() => releaseCalls.some(call => call.method !== 'GET')), false);
    assert.deepEqual(errors, []);
    assert.equal(await page.getByRole('checkbox', { name: 'Driving Range', exact: true }).isChecked(), false);
    assert.equal(await page.getByRole('checkbox', { name: 'Tony Lema', exact: true }).isChecked(), true);

    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.locator('.op-history-view').getByText('Driving Range history', { exact: true }).waitFor();
    await page.evaluate(() => { heldPaths = ['/dashboard']; });
    await customer.selectOption('CUST-0002');
    await waitForHeld();
    assert.equal(await page.locator('.op-history-view').getByText('Driving Range history', { exact: true }).count(), 0);
    assert.equal(await page.locator('.op-layout').count(), 1);
    assert.equal(await page.locator('.op-recent').getByText('Driving Range history', { exact: true }).count(), 0);
    await customer.selectOption('CUST-0001');
    await service.selectOption('CUST-0001/COURSE-0003');
    await release();
    await page.locator('.op-history-view').getByText('Driving Range history', { exact: true }).waitFor();
    assert.equal(await page.getByText('Test Links 18 history', { exact: true }).count(), 0);

    await page.getByRole('button', { name: 'Requests', exact: true }).click();
    page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => { heldPaths = ['/resume']; });
    await page.getByRole('button', { name: 'Resume Service for Driving Range', exact: true }).click();
    await waitForHeld();
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.locator('.app-refresh [role="alert"]').getByText(/Wait for the request, service or notification update/).waitFor();
    assert.equal(await customer.isDisabled(), true);
    assert.equal(await service.isDisabled(), true);
    await page.evaluate(() => {
      history.pushState(null, '', '/?customer_id=CUST-0002&course_id=COURSE-0002');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    assert.equal(await service.inputValue(), 'CUST-0001/COURSE-0003');
    assert.equal(new URL(page.url()).searchParams.get('course_id'), 'COURSE-0003');
    await release();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Select customer"]').disabled);

    await page.getByRole('button', { name: 'Complete service', exact: true }).click();
    await waitForHeld();
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.locator('.app-refresh [role="alert"]').getByText(/Wait for the request, service or notification update/).waitFor();
    assert.equal(await customer.isDisabled(), true);
    assert.equal(await service.isDisabled(), true);
    await release();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Select customer"]').disabled);

    await service.selectOption('CUST-0001/COURSE-0001');
    await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Select operator|Change operator|Close out/ }).count(), 0);
    assert.equal(await page.evaluate(() => releaseCalls.some(call => call.path.endsWith('/shifts/select'))), false);

    await page.evaluate(() => { heldPaths = ['/notification-preferences']; });
    await page.getByRole('checkbox', { name: 'Tony Lema', exact: true }).click();
    await waitForHeld();
    await page.getByRole('checkbox', { name: 'Test Links 18', exact: true }).click();
    await page.waitForFunction(() => pendingResponses.length === 2);
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.locator('.app-refresh [role="alert"]').getByText(/Wait for the request, service or notification update/).waitFor();
    await page.evaluate(() => pendingResponses.shift()());
    await page.waitForFunction(() => [...document.querySelectorAll('input[type="checkbox"]')]
      .find(input => input.closest('label')?.textContent === 'Tony Lema')?.checked === false);
    assert.equal(await customer.isDisabled(), true);
    assert.equal(await service.isDisabled(), true);
    await release();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Select customer"]').disabled);

    await page.goto(origin + '/requests/placeholder-request?admin=1&customer_id=CUST-0002&course_id=COURSE-0002');
    await page.getByRole('heading', { name: 'Placeholder marker', exact: true }).waitFor();
    assert.equal(await customer.inputValue(), 'CUST-0002');
    await page.goto(origin + '/__customer-context?customer_id=CUST-0002&course_id=COURSE-0002');
    await service.waitFor();
    assert.equal(await customer.count(), 0);
    assert.equal(await service.inputValue(), 'CUST-0001/COURSE-0001');
    assert.deepEqual(await service.locator('option').allTextContents(), ['Cart service', 'Driving range service']);
    assert.equal(await page.getByRole('heading', { name: 'Placeholder marker', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => releaseCalls.some(call => call.path.includes('CUST-0002') || call.search?.includes('COURSE-0002'))), false);
    await page.goto(origin + '/requests/range-request?customer_id=CUST-0001&course_id=COURSE-0003');
    await page.getByRole('heading', { name: 'Bay 9A', exact: true }).waitFor();
    assert.equal(await customer.count(), 0);
    assert.equal(await service.inputValue(), 'CUST-0001/COURSE-0003');
    assert.equal(await page.evaluate(() => releaseCalls.some(call => call.method !== 'GET')), false);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
