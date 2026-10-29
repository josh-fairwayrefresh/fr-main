import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('Inventory banner matches the approved responsive hierarchy without changing page ownership', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__inventory-banner')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__inventory-banner',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/inventoryBanner.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const go = query => page.goto(`${origin}/__inventory-banner?${query}`);
    await go('');
    await page.getByRole('button', { name: 'Export', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.inv-header-tools button').disabled);
    await page.locator('.inv-brand img').evaluate(image => image.decode());
    async function layout(width) {
      await page.setViewportSize({ width, height: 1100 });
      return page.locator('.inv-header').evaluate(header => {
        const box = element => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const find = selector => box(header.querySelector(selector));
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          count: document.querySelectorAll('.inv-header').length,
          logo: find('.inv-brand img'), nav: find('.inv-header-nav'), account: find('.inv-header-account'),
          identity: find('.inv-course-identity'), tools: find('.inv-header-tools'),
          controls: [...header.querySelectorAll('button,a,select')].map(box),
          topColor: getComputedStyle(header).borderTopColor,
          background: getComputedStyle(header).backgroundColor,
        };
      });
    }
    for (const width of [320, 375, 390, 430, 680, 740, 741, 768, 820, 900, 901, 1024, 1100, 1101, 1440, 1920]) {
      const state = await layout(width);
      assert.equal(state.overflow, false, `${width}: document overflow`);
      assert.equal(state.count, 1);
      assert.equal(state.topColor, 'rgb(178, 138, 50)');
      assert.equal(state.background, 'rgb(255, 255, 255)');
      for (const control of state.controls) {
        assert.ok(control.x >= 0 && control.right <= width + 1, `${width}: clipped control`);
        assert.ok(control.width >= 44 && control.height >= 44, `${width}: touch target`);
      }
      for (let i = 0; i < state.controls.length; i++) {
        for (const other of state.controls.slice(i + 1)) {
          const control = state.controls[i];
          assert.ok(Math.min(control.right, other.right) - Math.max(control.x, other.x) <= 1 ||
            Math.min(control.bottom, other.bottom) - Math.max(control.y, other.y) <= 1, `${width}: overlapping controls`);
        }
      }
      assert.ok(state.identity.y >= state.logo.bottom, `${width}: context below branding`);
      assert.ok(state.account.x >= state.logo.right, `${width}: account right of brand`);
      if (width <= 740) {
        assert.ok(state.nav.y >= state.logo.bottom);
        assert.equal(state.logo.width, 168);
      } else {
        assert.ok(state.nav.x >= state.logo.right);
        assert.equal(state.logo.width, width <= 900 ? 190 : 210);
      }
      if (width <= 900) assert.ok(state.tools.y >= state.identity.bottom, `${width}: tools separate row`);
      if (process.env.INVENTORY_BANNER_SCREENSHOT_DIR && [390, 768, 1024, 1440].includes(width)) {
        await page.locator('.inv-header').screenshot({ path: `${process.env.INVENTORY_BANNER_SCREENSHOT_DIR}/inventory-banner-${width}.png` });
      }
    }
    assert.equal(await page.locator('.inv-header [aria-current="page"]').innerText(), 'Inventory');
    assert.equal(await page.locator('.inv-header .inventory-session,.notification-setup').count(), 0, 'No duplicated operator or notification owner');
    assert.equal(await page.locator('.inv-daily-sales .inventory-session').count(), 1);
    assert.ok((await page.getByRole('link', { name: 'Cart Operations', exact: true }).getAttribute('href')).includes('customer_id=TEST&course_id=A'));
    await page.getByRole('button', { name: 'Open Admin', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.inventoryBannerActions), ['admin', 'sign-out']);
    await page.getByLabel('Select course').selectOption('TEST/B');
    await page.locator('.inv-course-identity > strong').getByText('Other Course', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.inv-header-tools button').disabled);
    assert.ok((await page.getByRole('link', { name: 'Cart Operations', exact: true }).getAttribute('href')).includes('course_id=B'));
    assert.ok(page.url().includes('course_id=B'));
    assert.equal(await page.evaluate(() => window.inventoryBannerCalls.some(call => call.method !== 'GET')), false, 'Course selection performs no mutations');
    for (const query of ['long=1', 'single=1&ordinary=1']) {
      await go(query);
      await page.locator('.inv-brand img').waitFor();
      for (const width of [320, 375, 768, 901, 1024, 1440]) {
        const state = await layout(width);
        assert.equal(state.overflow, false, `${width}: ${query} overflow`);
        assert.ok(state.controls.every(box => box.x >= 0 && box.right <= width + 1));
      }
      if (query.includes('single')) {
        assert.equal(await page.getByLabel('Select course').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Open Admin', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).count(), 1);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
