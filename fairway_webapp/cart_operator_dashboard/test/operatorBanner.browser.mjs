import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

test('one responsive Requests banner preserves the approved hierarchy and authorized controls', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__banner')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__banner',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/drivingRangeRelease.fixture.jsx"></script>'));
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
    await page.goto(origin + '/__banner?admin=1');
    await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
    await page.locator('.op-brand img').evaluate(image => image.decode());
    for (const width of [320, 375, 390, 430, 620, 621, 740, 741, 768, 810, 820, 834, 900, 901, 1024, 1100, 1101, 1112, 1180, 1194, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1100 });
      const layout = await page.locator('.op-header').evaluate(header => {
        const box = element => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const find = selector => box(header.querySelector(selector));
        const controls = [...header.querySelectorAll('button,a,select')];
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          brand: find('.op-brand'), nav: find('nav'), inventory: find('.op-inventory'),
          account: find('.op-header-account'), identity: find('.op-course-identity'),
          selectors: find('.op-context-selectors'), service: find('.op-service-controls'),
          controls: controls.map(box), count: document.querySelectorAll('.op-header').length,
          topColor: getComputedStyle(header).borderTopColor,
        };
      });
      assert.equal(layout.overflow, false, `${width}: document overflow`);
      assert.equal(layout.count, 1, 'one banner at every viewport');
      assert.equal(layout.topColor, 'rgb(178, 138, 50)', 'approved gold brand accent');
      for (const box of layout.controls) {
        assert.ok(box.x >= 0 && box.right <= width + 1, `${width}: clipped control ${JSON.stringify(box)}`);
        assert.ok(box.width >= 44 && box.height >= 44, `${width}: minimum touch target ${JSON.stringify(box)}`);
      }
      for (let i = 0; i < layout.controls.length; i++) {
        for (const other of layout.controls.slice(i + 1)) {
          const box = layout.controls[i];
          const overlapX = Math.min(box.right, other.right) - Math.max(box.x, other.x);
          const overlapY = Math.min(box.bottom, other.bottom) - Math.max(box.y, other.y);
          assert.ok(overlapX <= 1 || overlapY <= 1, `${width}: overlapping banner controls`);
        }
      }
      assert.ok(layout.identity.y > layout.brand.y, 'context stays below brand/navigation');
      if (width <= 740) {
        assert.ok(layout.nav.y >= layout.brand.bottom, `${width}: phone navigation row`);
        assert.equal(layout.inventory.y, layout.nav.y + 1, `${width}: Inventory shares navigation row`);
        assert.ok(layout.selectors.y >= layout.identity.bottom, `${width}: phone context stacks`);
        assert.ok(layout.service.y >= layout.selectors.bottom, `${width}: separated service row`);
      } else {
        assert.ok(layout.nav.x > layout.brand.x, `${width}: primary navigation follows brand`);
        assert.ok(layout.inventory.x > layout.nav.x, `${width}: Inventory precedes account actions`);
        assert.ok(layout.account.x > layout.inventory.x, `${width}: account group on right`);
        assert.ok(layout.selectors.x > layout.identity.x, `${width}: scope follows course identity`);
      }
      await page.getByRole('button', { name: 'History', exact: true }).click();
      await page.getByRole('heading', { name: 'Performance & outcomes' }).waitFor();
      await page.getByRole('button', { name: 'Requests', exact: true }).click();
      await page.getByRole('button', { name: 'Complete service', exact: true }).waitFor();
      if (process.env.BANNER_SCREENSHOT_DIR && [390, 1024, 1440].includes(width)) {
        await page.locator('.op-header').screenshot({ path: `${process.env.BANNER_SCREENSHOT_DIR}/banner-${width}.png` });
      }
    }
    await page.locator('.op-course-identity').evaluate(element => {
      element.querySelector('.op-current-course > span').textContent = 'A very long authorized Customer display name at a golf club';
      element.querySelector('.op-current-course > strong').textContent = 'A very long championship Course name with multiple words';
      element.querySelector('.inventory-session strong').textContent = 'A very long selected operator name';
    });
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: long names`);
    }
    await page.getByLabel('Select course').selectOption('CUST-0001/COURSE-0003');
    assert.equal(await page.locator('.op-inventory,.inventory-session').count(), 0, 'Range has no inventory or operator controls');
    await page.goto(origin + '/__banner?admin=1&groups=1');
    for (const width of [320, 375, 768, 901, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.getByRole('group', { name: 'Amenity Areas service' }).waitFor();
      assert.equal(await page.getByRole('group', { name: 'On-course service' }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: independent service groups`);
    }
    await page.goto(origin + '/__banner');
    assert.equal(await page.getByLabel('Select customer').count(), 0, 'ordinary users have no Customer selector');
    assert.equal(await page.getByRole('button', { name: 'Open Admin', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
