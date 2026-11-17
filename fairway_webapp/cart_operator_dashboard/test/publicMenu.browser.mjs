import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { chromeSession, until } from './browserHarness.mjs';

test('public menu retains links, starts all categories collapsed and loads only on open or manual reload', { timeout: 60000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'fairway-public-menu-'));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    cacheDir: path.join(profile, 'vite-cache'), optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__missing-customer-logo.png', (_request, response) => {
    response.statusCode = 404;
    response.end();
  });
  server.middlewares.use('/__public-test', async (_request, response, next) => {
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__public-test', '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/publicMenu.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    browser = await chromeSession(profile);
    const { send, evaluate } = browser;
    const url = `http://127.0.0.1:${server.httpServer.address().port}/__public-test`;
    const menu = name => ({
      name: 'Public Test Menu', customer_name: 'Public Test Course', title: 'Today’s Menu', timezone: 'America/Los_Angeles',
      updated_at: '2026-10-24T10:00:00Z', products: [{
        product_id: 'one', name, category: 'Custom Category', state: 'on_cart',
        price: { amount_minor: 250, currency_code: 'USD' }, description: 'Saved description',
      }, {
        product_id: 'two', name: 'Canned drink', category: 'Canned Cocktails', state: 'on_cart',
        price: { amount_minor: 500, currency_code: 'USD' },
      }],
    });
    await send('Page.navigate', { url });
    await until(() => evaluate('globalThis.menuRequests?.length === 1'));
    assert.equal(await evaluate('menuRequests[0].url.endsWith("/api/v1/public/menus/unbranded-course")'), true);
    assert.equal(await evaluate('menuRequests[0].options.cache'), 'no-store');
    await evaluate(`menuRequests[0].finish(${JSON.stringify(menu('Original'))})`);
    await until(() => evaluate('document.querySelectorAll("button[aria-expanded]").length === 2'));
    assert.deepEqual(await evaluate('[...document.querySelectorAll("button[aria-expanded]")].map(button=>button.getAttribute("aria-expanded"))'), ['false', 'false']);
    assert.equal(await evaluate('document.querySelectorAll(".pm-product").length'), 0);
    await evaluate('[...document.querySelectorAll("button[aria-expanded]")].find(button=>button.textContent.includes("Canned Cocktails")).click()');
    assert.equal(await evaluate('document.querySelector(".pm-product strong")?.textContent'), 'Canned drink');
    await evaluate('[...document.querySelectorAll("button[aria-expanded]")].find(button=>button.textContent.includes("Custom Category")).click()');
    assert.equal(await evaluate('document.querySelector(".pm-product strong")?.textContent'), 'Original');
    assert.match(await evaluate('document.body.textContent'), /Public Test Course/);
    assert.match(await evaluate('document.querySelector("#menu-last-updated").textContent'), /03:00 AM PDT|3:00 AM PDT/);
    assert.equal(await evaluate('document.querySelectorAll(".pm-pay").length'), 0, 'Only cart menus show the cart payment strip');
    assert.equal(await evaluate('document.querySelectorAll(".pm-fr-stack, .pm-tagline").length'), 0, 'Non-cart menus keep the horizontal Fairway Refresh logo');
    assert.match(await evaluate('document.querySelector(".pm-brand-lockup > img.pm-fairway-logo")?.src || ""'), /fairway-refresh-horizontal-transparent/);
    assert.equal(await evaluate('document.querySelectorAll(".pm-course-logo").length'), 0, 'Customers without a logo do not use another logo');
    assert.equal(await evaluate('document.querySelector(".pm-brand-lockup .pm-at")?.textContent'), 'AT', 'AT is part of every menu header');
    assert.equal(await evaluate('document.querySelector(".pm-brand-lockup .pm-customer-name")?.textContent'), 'Public Test Course', 'Customer name fills the logo slot');
    await evaluate('dispatchEvent(new Event("focus"));dispatchEvent(new Event("focus"))');
    await new Promise(resolve => setTimeout(resolve, 16000));
    assert.equal(await evaluate('menuRequests.length'), 1, 'No focus-triggered or interval fetch');
    await evaluate('globalThis.menuRequests = null');
    await send('Page.reload');
    await until(() => evaluate('globalThis.menuRequests?.length === 1'));
    await evaluate(`menuRequests[0].finish(${JSON.stringify(menu('Newest'))})`);
    await until(() => evaluate('document.querySelectorAll("button[aria-expanded]").length === 2'));
    assert.equal(await evaluate('document.querySelectorAll(".pm-product").length'), 0, 'Manual reload resets collapse state');
    await evaluate('[...document.querySelectorAll("button[aria-expanded]")].find(button=>button.textContent.includes("Custom Category")).click()');
    assert.equal(await evaluate('document.querySelector(".pm-product strong")?.textContent'), 'Newest');
    await evaluate('globalThis.menuRequests = null');
    await send('Page.reload');
    await until(() => evaluate('globalThis.menuRequests?.length === 1'));
    await evaluate(`menuRequests[0].finish(${JSON.stringify({ ...menu(''), products: [] })})`);
    await until(() => evaluate('document.body.textContent.includes("No items listed")'));
    assert.equal(await evaluate('document.querySelectorAll(".pm-product").length'), 0);
    await evaluate('globalThis.menuRequests = null');
    await send('Page.reload');
    await until(() => evaluate('globalThis.menuRequests?.length === 1'));
    await evaluate('menuRequests[0].finish({error:"offline",message:"Connectivity unavailable"})');
    await until(() => evaluate('document.querySelector("[role=alert]")?.textContent.includes("Connectivity unavailable")'));
    await evaluate('globalThis.menuRequests = null');
    await send('Page.navigate', { url: `${url}?slug=monarchbay_tony_lema_course` });
    await until(() => evaluate('globalThis.menuRequests?.[0]?.url.endsWith("/api/v1/public/menus/monarchbay_tony_lema_course")'));
    await evaluate(`menuRequests[0].finish(${JSON.stringify({ ...menu('Legacy link'), type: 'cart', branding: { logo_url: '/icons/logo-and-name-row-banner.jpg' } })})`);
    await until(() => evaluate('document.querySelectorAll("button[aria-expanded]").length === 2'));
    await evaluate('[...document.querySelectorAll("button[aria-expanded]")].find(button=>button.textContent.includes("Custom Category")).click()');
    await until(() => evaluate('document.querySelector(".pm-product strong")?.textContent === "Legacy link"'));
    assert.equal(await evaluate('document.querySelector(".pm-pay")?.textContent.trim()'), 'PAY AT THE CART ONLY', 'Cart menus show where to pay');
    assert.equal(await evaluate('document.querySelector(".pm-tagline")?.textContent'), 'Push Button. Stay Refreshed.', 'Cart menus use the stacked logo with tagline');
    assert.equal(await evaluate('document.querySelectorAll(".pm-heading, #menu-last-updated").length'), 0, 'Cart menus omit the Customer/title/last-updated heading');
    assert.equal(await evaluate('document.querySelector("h1")?.textContent'), 'Today’s Menu', 'Cart menus keep an accessible document heading');
    await until(() => evaluate('document.querySelector(".pm-course-logo")?.complete && document.querySelector(".pm-course-logo").naturalWidth > 0'));
    assert.equal(await evaluate('document.querySelector(".pm-course-logo").src'), `${new URL(url).origin}/icons/logo-and-name-row-banner.jpg`, 'Customer logo resolves against the menu API origin');
    assert.equal(await evaluate('document.querySelector(".pm-course-logo").alt'), 'Public Test Course');
    assert.equal(await evaluate('document.querySelectorAll(".pm-customer-name").length'), 0);
    for (const width of [320, 390, 900]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      const layout = await evaluate(`(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const lockup = box('.pm-brand-lockup'); const fairway = box('.pm-fr-stack'); const at = box('.pm-at'); const customer = box('.pm-course-logo');
        return { lockup: { left: lockup.left, right: lockup.right }, fairway: { left: fairway.left, right: fairway.right, mid: fairway.top + fairway.height / 2 },
          at: { left: at.left, right: at.right, mid: at.top + at.height / 2 }, customer: { left: customer.left, right: customer.right, width: customer.width, mid: customer.top + customer.height / 2 } };
      })()`);
      assert.ok(layout.fairway.left >= layout.lockup.left && layout.fairway.right <= layout.at.left, `${width}: Fairway Refresh logo leads`);
      assert.ok(layout.at.right <= layout.customer.left && layout.customer.right <= layout.lockup.right + 0.5, `${width}: Customer logo follows AT`);
      assert.ok(layout.customer.width > 0, `${width}: Customer logo visible`);
      if (width < 600) {
        const spans = await evaluate(`(() => {
          const sections = [...document.querySelectorAll('.pm-category-section')];
          const width = section => section.getBoundingClientRect().width;
          const first = width(sections.find(section => section.querySelector('.expanded')));
          const second = width(sections.find(section => !section.querySelector('.expanded')));
          const grid = document.querySelector('.pm-category-grid').getBoundingClientRect().width;
          return { first, second, grid };
        })()`);
        assert.ok(Math.abs(spans.first - spans.grid) < 1, `${width}: opened category spans the full row`);
        assert.ok(spans.second < spans.grid * 0.6, `${width}: closed categories keep the two-column grid`);
      }
      assert.ok(Math.abs(layout.fairway.mid - layout.at.mid) < 2 && Math.abs(layout.customer.mid - layout.at.mid) < 2, `${width}: header reads on one line`);
    }
    await send('Emulation.clearDeviceMetricsOverride');
    await evaluate('globalThis.menuRequests = null');
    await send('Page.reload');
    await until(() => evaluate('globalThis.menuRequests?.length === 1'));
    await evaluate(`menuRequests[0].finish(${JSON.stringify({ ...menu('Broken logo'), branding: { logo_url: '/__missing-customer-logo.png' } })})`);
    await until(() => evaluate('document.querySelector(".pm-brand-lockup .pm-customer-name")?.textContent === "Public Test Course"'));
    assert.equal(await evaluate('document.querySelectorAll(".pm-course-logo").length'), 0, 'Unloadable logo falls back to the Customer name');
    assert.equal(await evaluate('document.querySelector(".pm-brand-lockup .pm-at")?.textContent'), 'AT');
    await evaluate('globalThis.menuRequests = null');
    await send('Page.reload');
    await until(() => evaluate('globalThis.menuRequests?.length === 1'));
    await evaluate(`menuRequests[0].finish(${JSON.stringify({ ...menu('Foreign logo'), branding: { logo_url: '//example.invalid/logo.png' } })})`);
    await until(() => evaluate('document.querySelector(".pm-brand-lockup .pm-customer-name")?.textContent === "Public Test Course"'));
    assert.equal(await evaluate('document.querySelectorAll(".pm-course-logo").length'), 0, 'Only API-relative logo paths are rendered');
  } finally {
    if (browser) await browser.close();
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
