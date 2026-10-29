import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('manual standalone refresh retrieves a new release, preserves storage and fails safely', { timeout: 60000 }, async () => {
  const config = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url)));
  assert.deepEqual(config.hosting.headers, [
    { source: '**', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public,max-age=31536000,immutable' }] },
  ]);
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sw, /addEventListener\(['"]fetch|caches\./);
  let release = 'one', failure = false, hold, probes = 0;
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false, appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use(async (request, response, next) => {
    if (request.url.startsWith('/assets/release-')) {
      response.setHeader('Cache-Control', config.hosting.headers[1].headers[0].value);
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`window.assetRelease=${JSON.stringify(request.url.match(/release-(one|two)/)[1])}`);
      return;
    }
    if (!request.url.startsWith('/__refresh')) return next();
    try {
      probes++;
      if (hold) { const barrier = hold; hold = null; await barrier; }
      response.setHeader('Cache-Control', config.hosting.headers[0].headers[0].value);
      response.setHeader('Content-Type', 'text/html');
      if (failure) { response.statusCode = 503; response.end('Unavailable'); return; }
      response.end(await server.transformIndexHtml('/__refresh',
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="release" content="${release}"><div id="root"></div><script src="/assets/release-${release}.js"></script><script type="module" src="/test/appRefresh.fixture.jsx"></script>`));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const context = await browser.newContext();
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await context.addCookies([{ name: 'synthetic-auth', value: 'retained', url: origin }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/__refresh?customer_id=C&course_id=A#requests');
    await page.getByRole('heading', { name: 'Release one' }).waitFor();
    assert.equal(await page.evaluate(() => window.assetRelease), 'one');
    const url = page.url();
    const record = JSON.stringify({ session_id: 'same-uuid', shift: { shift_id: 'still-open', staff_name: 'Alice' }, pending: {}, close_amount: '012.30' });
    await page.evaluate(record => {
      sessionStorage.setItem('inventory-session:refresh-test:C:A', record);
      localStorage.setItem('notification-preferences', '{"C/A":true}');
    }, record);
    release = 'two';
    await page.waitForTimeout(100);
    assert.equal(await page.getByRole('heading', { name: 'Release one' }).count(), 1, 'no automatic reload');
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.getByRole('heading', { name: 'Release two' }).waitFor();
    assert.equal(await page.evaluate(() => window.assetRelease), 'two', 'new entry loads the new fingerprinted asset');
    assert.equal(page.url(), url);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('inventory-session:refresh-test:C:A')), record);
    assert.equal(await page.evaluate(() => localStorage.getItem('notification-preferences')), '{"C/A":true}');
    assert.equal((await context.cookies()).find(cookie => cookie.name === 'synthetic-auth').value, 'retained');
    assert.equal(await page.evaluate(() => navigator.standalone), true);
    const count = probes;
    await page.evaluate(() => { window.refreshGuard = 'Finish your unsaved edits first.'; });
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.getByRole('alert').getByText(/unsaved edits/).waitFor();
    assert.equal(probes, count);
    await page.evaluate(() => { window.refreshGuard = ''; });
    let unblock;
    hold = new Promise(resolve => { unblock = resolve; });
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.getByRole('button', { name: 'Checking...' }).waitFor();
    await page.evaluate(() => { window.refreshGuard = 'A submission started during the check.'; });
    unblock();
    await page.getByRole('alert').getByText(/submission started/).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Release two' }).count(), 1);
    await page.evaluate(() => {
      window.refreshGuard = '';
      sessionStorage.setItem('inventory-session:refresh-test:C:B', JSON.stringify({
        session_id: 'other-course', pending: { '["POST","/products",{}]': 'pending-id' },
      }));
    });
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.getByRole('alert').getByText(/unconfirmed Inventory submission/).waitFor();
    await page.evaluate(() => sessionStorage.setItem('inventory-session:refresh-test:C:B', '{corrupt'));
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /App not refreshed/);
    await page.evaluate(() => sessionStorage.removeItem('inventory-session:refresh-test:C:B'));
    failure = true;
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.getByRole('alert').getByText(/Unable to retrieve/).waitFor();
    assert.equal(page.url(), url);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('inventory-session:refresh-test:C:A')), record);
    failure = false;
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Refresh App', exact: true }).click();
    await page.getByRole('alert').getByText(/App not refreshed/).waitFor();
    await context.setOffline(false);
    assert.equal(await page.getByRole('heading', { name: 'Release two' }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
