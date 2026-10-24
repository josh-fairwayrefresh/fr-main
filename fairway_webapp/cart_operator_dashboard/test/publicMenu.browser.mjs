import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { chromeSession, until } from './browserHarness.mjs';

test('public menu retains legacy links, supports Course slugs and rejects stale refresh responses', { timeout: 60000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'fairway-public-menu-'));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    cacheDir: path.join(profile, 'vite-cache'), optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0 },
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
      course_name: 'Public Test Course', timezone: 'America/Los_Angeles',
      updated_at: '2026-10-24T10:00:00Z', products: [{
        product_id: 'one', name, category: 'Custom Category', state: 'on_cart',
        price: { amount_minor: 250, currency_code: 'USD' }, description: 'Saved description',
      }],
    });
    await send('Page.navigate', { url });
    await until(() => evaluate('globalThis.menuRequests?.length === 1'));
    assert.equal(await evaluate('menuRequests[0].url.endsWith("/api/v1/public/menus/unbranded-course")'), true);
    assert.equal(await evaluate('menuRequests[0].options.cache'), 'no-store');
    await evaluate(`menuRequests[0].finish(${JSON.stringify(menu('Original'))})`);
    await until(() => evaluate('document.querySelector(".pm-product strong")?.textContent === "Original"'));
    assert.match(await evaluate('document.body.textContent'), /Public Test Course/);
    assert.match(await evaluate('document.querySelector("#menu-last-updated").textContent'), /03:00 AM PDT|3:00 AM PDT/);
    assert.equal(await evaluate('document.querySelectorAll(".pm-course-logo").length'), 0, 'Unbranded Courses do not use another Course logo');
    await evaluate('dispatchEvent(new Event("focus"));dispatchEvent(new Event("focus"))');
    await until(() => evaluate('menuRequests.length === 3'));
    await evaluate(`menuRequests[2].finish(${JSON.stringify(menu('Newest'))});menuRequests[1].finish(${JSON.stringify(menu('Stale'))})`);
    await until(() => evaluate('document.querySelector(".pm-product strong")?.textContent === "Newest"'));
    assert.equal(await evaluate('menuRequests[1].options.signal.aborted'), true);
    await evaluate('dispatchEvent(new Event("focus"))');
    await evaluate(`menuRequests[3].finish(${JSON.stringify({ ...menu(''), products: [] })})`);
    await until(() => evaluate('document.body.textContent.includes("No items listed")'));
    assert.equal(await evaluate('document.querySelectorAll(".pm-product").length'), 0);
    await evaluate('dispatchEvent(new Event("focus"));menuRequests[4].finish({error:"offline",message:"Connectivity unavailable"})');
    await until(() => evaluate('document.querySelector("[role=alert]")?.textContent.includes("Connectivity unavailable")'));
    await send('Page.navigate', { url: `${url}?slug=monarchbay_tony_lema_course` });
    await until(() => evaluate('globalThis.menuRequests?.[0]?.url.endsWith("/api/v1/public/menus/monarch-bay")'));
    await evaluate(`menuRequests[0].finish(${JSON.stringify(menu('Legacy link'))})`);
    await until(() => evaluate('document.querySelector(".pm-product strong")?.textContent === "Legacy link"'));
    assert.equal(await evaluate('Boolean(document.querySelector(".pm-course-logo"))'), true);
  } finally {
    if (browser) await browser.close();
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
