import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('aligned Admin shell retains Reports, OTA and HQ Maintenance deployment controls', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__alignment')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__alignment',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/productionAlignment.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const page = await browser.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/__alignment');
    await page.getByText('FRB-9001', { exact: true }).waitFor();
    for (const width of [375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      const navigation = page.locator(width <= 700 ? '.a-mobile-nav' : '.a-sidebar nav');
      assert.equal(await navigation.getByRole('button').count(), 7);
      await navigation.getByRole('button', { name: 'Reports', exact: true }).click();
      await page.getByRole('heading', { name: 'Cart Request Performance Report', exact: true }).waitFor();
      await navigation.getByRole('button', { name: 'Firmware OTA', exact: true }).click();
      await page.getByText('Approved Firmware Updates', { exact: true }).waitFor();
      await page.getByText('America/Los_Angeles', { exact: false }).first().waitFor();
      assert.equal(await page.locator('.a-ota-review').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      for (const button of await navigation.getByRole('button').all()) {
        const box = await button.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1);
      }
    }
    await page.locator('.a-sidebar nav').getByRole('button', { name: 'Overview / Fleet' }).click();
    await page.getByText('FRB-9001', { exact: true }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByText('Headquarters-held; no active deployment', { exact: true }).waitFor();
    const customer = drawer.locator('label').filter({ hasText: /^Customer/ }).locator('select');
    const course = drawer.locator('label').filter({ hasText: /^Course/ }).locator('select');
    assert.equal(await customer.inputValue(), '');
    assert.equal(await drawer.getByRole('button', { name: 'Save assignment', exact: true }).count(), 0);
    await customer.selectOption('CUST-TEST');
    await course.selectOption('COURSE-TEST');
    const serviceGroup = drawer.locator('label').filter({ hasText: /^Service group/ }).locator('select');
    const groups = await serviceGroup.locator('option').evaluateAll(options => options.map(option => option.value));
    const selectedGroup = groups.find(group => group !== 'on_course');
    assert.ok(selectedGroup);
    await serviceGroup.selectOption(selectedGroup);
    page.once('dialog', dialog => dialog.accept());
    await drawer.locator('label').filter({ hasText: /^Lifecycle state/ }).locator('select').selectOption('deployed');
    await page.waitForFunction(() => alignmentCalls.some(call => call.method === 'PATCH'));
    assert.deepEqual(await page.evaluate(() => alignmentCalls.find(call => call.method === 'PATCH').body), {
      state: 'deployed', customer_id: 'CUST-TEST', course_id: 'COURSE-TEST',
      location: { type: 'hole', hole: 1 }, service_group: selectedGroup,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
