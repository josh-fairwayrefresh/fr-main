import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { chromeSession, until } from './browserHarness.mjs';

test('Inventory menu viewer opens and closes on iPhone and iPad sizes without losing screen state', { timeout: 120000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'fairway-inventory-menu-viewer-'));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    cacheDir: path.join(profile, 'vite-cache'), optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__menu-viewer-test', async (_req, res, next) => {
    try {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/__menu-viewer-test', '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/inventoryPointer.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  server.middlewares.use('/cartmenus/pointer-course', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html lang="en"><body><main id="menu-fixture">Existing golfer menu</main></body></html>');
  });

  let browser;
  try {
    await server.listen();
    browser = await chromeSession(profile);
    const { send, evaluate } = browser;
    const url = `http://127.0.0.1:${server.httpServer.address().port}/__menu-viewer-test`;
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await send('Page.navigate', { url });
    await until(() => evaluate('Boolean(document.querySelector(".inv-menu-link") && document.querySelector(".inv-category-filter"))'), 'loaded Inventory fixture');

    await evaluate(`(()=>{const button=[...document.querySelectorAll('.inv-category-filter')].find(item=>item.textContent.includes('Drinks'));button.click();})()`);
    const fixtureId = await evaluate('globalThis.pointerFixtureId');
    await evaluate('window.scrollTo(0, Math.min(300, document.documentElement.scrollHeight - innerHeight))');

    for (const viewport of [
      { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
      { width: 834, height: 1194, deviceScaleFactor: 2, mobile: true },
    ]) {
      await send('Emulation.setDeviceMetricsOverride', viewport);
      const scrollBefore = await evaluate('window.scrollY');
      await evaluate(`document.querySelector('.inv-menu-link').click()`);
      await until(() => evaluate(`Boolean(document.querySelector('.inv-menu-viewer iframe')?.contentDocument?.querySelector('#menu-fixture'))`), 'golfer menu loaded in viewer');

      const viewer = await evaluate(`(()=>{
        const dialog=document.querySelector('.inv-menu-viewer');
        const close=dialog.querySelector('[aria-label="Close golfer-view menu and return to Inventory"]');
        const bounds=element=>{const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom};};
        return {
          src:dialog.querySelector('iframe').getAttribute('src'),
          title:dialog.querySelector('iframe').title,
          body:dialog.querySelector('iframe').contentDocument.body.innerText,
          dialog:dialog.getAttribute('aria-modal'),
          close:bounds(close),
          activeClose:document.activeElement===close,
          inventoryInert:document.querySelector('.inv-main').inert,
          headerInert:document.querySelector('.inv-header').inert,
          viewport:{width:innerWidth,height:innerHeight},
        };
      })()`);
      assert.equal(viewer.src, '/cartmenus/pointer-course');
      assert.equal(viewer.title, 'Golfer-View Menu');
      assert.equal(viewer.body, 'Existing golfer menu');
      assert.equal(viewer.dialog, 'true');
      assert.equal(viewer.activeClose, true);
      assert.equal(viewer.inventoryInert, true);
      assert.equal(viewer.headerInert, true);
      assert.deepEqual(viewer.close, {
        x: viewer.viewport.width - 68,
        y: 12,
        width: 56,
        height: 56,
        right: viewer.viewport.width - 12,
        bottom: 68,
      });

      await evaluate(`document.querySelector('.inv-menu-viewer-close').click()`);
      await until(() => evaluate('!document.querySelector(".inv-menu-viewer")'), 'closed menu viewer');
      assert.equal(await evaluate('window.scrollY'), scrollBefore, 'Inventory scroll position is preserved');
      assert.equal(await evaluate('globalThis.pointerFixtureId'), fixtureId, 'Inventory component and operator session remain mounted');
      assert.equal(await evaluate(`[...document.querySelectorAll('.inv-category-filter')].find(item=>item.textContent.includes('Drinks')).getAttribute('aria-pressed')`), 'true', 'Selected Inventory category is preserved');
      assert.equal(await evaluate('document.querySelector(".inv-main").inert'), false);
      assert.equal(await evaluate('document.activeElement === document.querySelector(".inv-menu-link")'), true, 'Focus returns to the menu control');
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
