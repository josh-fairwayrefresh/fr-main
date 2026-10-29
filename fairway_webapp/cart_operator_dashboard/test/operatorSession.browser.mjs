import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

async function isolatedBrowser(run) {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use(async (request, response, next) => {
    if (!['/', '/inventory'].includes(request.url.split('?')[0])) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml(request.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/operatorSession.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const calls = [], sessions = new Map(), receipts = new Map(), held = [];
    let sequence = 0;
    const model = { calls, sessions, receipts, held, failStaff: false, holdReads: false,
      holdSelect: false, holdStock: false, holdClose: false, closeFailure: 0, loseClose: false, loseStock: false, closes: 0, sales: 0, audits: 0 };
    const answer = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await context.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const body = request.postDataJSON() || {}, method = request.method();
      calls.push({ path, method, body, query: url.search });
      if (path === '/api/v1/operator/dashboard') {
        return answer(route, { courses: [], reports: {} });
      }
      if (path.startsWith('/api/v1/requests/')) return answer(route, {});
      const match = /^\/api\/v1\/inventory\/courses\/([^/]+)\/([^/]+)(.*)$/.exec(path);
      assert.ok(match, `Unexpected API path: ${path}`);
      const [, customer, course, suffix] = match;
      const account = request.headers().authorization;
      const sessionKey = id => `${account}/${customer}/${course}/${id}`;
      const receiptKey = `${customer}/${course}/${body.operation_id}`;
      if (suffix === '/staff' && method === 'GET') return model.failStaff
        ? answer(route, { message: 'Isolated staff unavailable' }, 503)
        : answer(route, { staff: [{ staff_id: 'alice', name: 'Alice', active: true }, { staff_id: 'bob', name: 'Bob', active: true }] });
      if (suffix === '/shifts/session') {
        const result = structuredClone({ shift: sessions.get(sessionKey(url.searchParams.get('session_id'))) || null });
        if (model.holdReads) { held.push(() => answer(route, result)); return; }
        return answer(route, result);
      }
      if (method === 'POST' && receipts.has(receiptKey)) return answer(route, receipts.get(receiptKey));
      if (suffix === '/shifts/select') {
        const existing = sessions.get(sessionKey(body.session_id));
        if (existing?.has_activity && existing.staff_id !== body.staff_id)
          return answer(route, { message: 'Close the current shift first' }, 409);
        const shift = { shift_id: existing?.shift_id || `shift-${++sequence}`, staff_id: body.staff_id,
          staff_name: body.staff_id === 'alice' ? 'Alice' : 'Bob', has_activity: existing?.has_activity || false, status: 'active' };
        sessions.set(sessionKey(body.session_id), shift);
        const result = { shift: structuredClone(shift) };
        receipts.set(receiptKey, result);
        if (model.holdSelect) { held.push(() => answer(route, result)); return; }
        return answer(route, result);
      }
      if (suffix.endsWith('/close')) {
        if (model.closeFailure) return answer(route, { message: 'Isolated close rejected' }, model.closeFailure);
        const key = sessionKey(body.session_id), shift = sessions.get(key);
        assert.ok(shift && suffix.includes(shift.shift_id), 'Close must target its selected scoped shift');
        model.closes++;
        sessions.set(key, null);
        const result = { closed: true };
        receipts.set(receiptKey, result);
        if (model.holdClose) { held.push(() => answer(route, result)); return; }
        if (model.loseClose) { model.loseClose = false; return route.abort('failed'); }
        return answer(route, result);
      }
      if (suffix.endsWith('/stock')) {
        const shift = [...sessions.values()].find(item => item?.shift_id === body.shift_id);
        assert.ok(shift, 'Stock requires the selected shift');
        shift.has_activity = true;
        model.sales++;
        const result = { quantity: 9 };
        receipts.set(receiptKey, result);
        if (model.holdStock) { held.push(() => answer(route, result)); return; }
        if (model.loseStock) { model.loseStock = false; return route.abort('failed'); }
        return answer(route, result);
      }
      if (suffix === '/audits' && method === 'POST') {
        assert.equal(body.shift_id, undefined);
        model.audits++;
        const result = { audit_id: 'isolated-audit' };
        receipts.set(receiptKey, result);
        return answer(route, result);
      }
      if (suffix === '') return answer(route, { customer_id: customer, course_id: course, inventory_revision: 0,
        products: [{ product_id: 'water', name: 'Water', category_id: 'drinks', category_name: 'Drinks', state: 'on_cart', quantity: 10,
          price: { amount_minor: 200, currency_code: 'USD' } }],
        categories: [{ category_id: 'drinks', name: 'Drinks', subcategories: [] }], daily_sales: { total_units: 0, products: [] } });
      throw new Error(`Unexpected isolated request ${method} ${path}`);
    });
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    await run({ page, context, model, origin });
    assert.deepEqual(errors, []);
    assert.ok(calls.every(call => !call.path.includes('notification-preferences') && !call.path.includes('push-subscriptions')));
  } finally {
    await browser?.close();
    await server.close();
  }
}

const closeButton = page => page.getByRole('button', { name: /Close out.*Enter final sales/ });
async function waitForHeld(model, count) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (model.held.length === count) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(model.held.length, count, 'Expected isolated response barrier was not reached');
}
async function releaseRead(page, release) {
  const response = page.waitForResponse(response => response.url().includes('/shifts/session'));
  await release();
  await (await response).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function expectOperator(page, name) {
  await page.waitForFunction(expected => document.querySelector('.inventory-session > span > strong')?.textContent === expected, name);
}
async function selectOperator(page, name = 'alice') {
  await page.getByRole('button', { name: /^(Select|Change) operator$/ }).click();
  await page.getByLabel('Staff name').selectOption(name);
  await page.getByRole('button', { name: 'Confirm operator', exact: true }).click();
  await expectOperator(page, name === 'alice' ? 'Alice' : 'Bob');
}
async function closeOperator(page, amount) {
  await closeButton(page).click();
  await page.getByLabel('Total sales ($)').fill(amount);
  await page.getByRole('button', { name: 'Submit shift total' }).click();
  await page.getByRole('button', { name: 'Confirm close out' }).click();
}
async function stored(page, course = 'TEST-A', customer = 'TEST-C') {
  return page.evaluate(({ course, customer }) => JSON.parse(sessionStorage.getItem(
    `inventory-session:session-test-user:${customer}:${course}`)), { course, customer });
}
async function cart(page) {
  await page.getByRole('link', { name: 'Cart Operations', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/');
}
async function inventory(page) {
  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/inventory');
}

test('real Requests/Inventory links and reload share the existing UUID, draft and pre-activity closeout', { timeout: 90000 }, async () => {
  await isolatedBrowser(async ({ page, model, origin }) => {
    await page.goto(origin);
    await expectOperator(page, 'Not selected');
    await selectOperator(page);
    const initial = await stored(page);
    assert.ok(initial.session_id);
    assert.equal(initial.shift.has_activity, false);
    await closeButton(page).click();
    await page.getByLabel('Total sales ($)').fill('12.30');
    await page.getByRole('button', { name: 'Submit shift total' }).click();
    assert.match(await page.getByRole('dialog').textContent(), /\$12\.30/);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.getByLabel('Total sales ($)').inputValue(), '12.30');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => {
      const key = 'inventory-session:session-test-user:TEST-C:TEST-A';
      const legacy = JSON.parse(sessionStorage.getItem(key));
      delete legacy.revision;
      sessionStorage.setItem(key, JSON.stringify(legacy));
    });
    model.holdReads = true;
    await inventory(page);
    await expectOperator(page, 'Alice');
    assert.equal((await stored(page)).session_id, initial.session_id);
    assert.equal((await stored(page)).shift.shift_id, initial.shift.shift_id);
    await waitForHeld(model, 1);
    model.holdReads = false;
    await releaseRead(page, model.held.shift());
    await page.reload();
    await expectOperator(page, 'Alice');
    await closeButton(page).click();
    assert.equal(await page.getByLabel('Total sales ($)').inputValue(), '12.30');
    await page.getByRole('button', { name: 'Submit shift total' }).click();
    model.holdClose = true;
    await page.getByRole('button', { name: 'Confirm close out' }).click();
    await waitForHeld(model, 1);
    assert.equal(await page.getByRole('link', { name: 'Cart Operations', exact: true }).count(), 0);
    assert.equal(await page.locator('.inv-cart-link').getAttribute('href'), null);
    assert.equal(await page.getByLabel('Select course').isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).isDisabled(), true);
    model.holdClose = false;
    await model.held.shift()();
    await expectOperator(page, 'Not selected');
    await cart(page);
    await expectOperator(page, 'Not selected');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.goBack();
    await expectOperator(page, 'Not selected');
    await page.goForward();
    await expectOperator(page, 'Not selected');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(model.closes, 1);
    assert.equal((await stored(page)).session_id, initial.session_id);
    assert.equal((await stored(page)).close_amount, '');
    assert.deepEqual((await stored(page)).pending, {});
    await inventory(page);
    await selectOperator(page, 'bob');
    await cart(page);
    await expectOperator(page, 'Bob');
    await page.reload();
    await expectOperator(page, 'Bob');
    await selectOperator(page, 'alice');
    assert.equal((await stored(page)).shift.shift_id === initial.shift.shift_id, false);
    for (const width of [375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const box = await closeButton(page).boundingBox();
      assert.ok(box.width > 0 && box.x >= 0 && box.x + box.width <= width);
    }
    await inventory(page);
    for (const width of [375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await closeButton(page).scrollIntoViewIfNeeded();
      const box = await closeButton(page).boundingBox();
      assert.ok(box.width > 0 && box.x >= 0 && box.x + box.width <= width);
    }
  });
});

test('failed and lost close responses preserve exact draft and operation identity across real navigation', { timeout: 90000 }, async () => {
  await isolatedBrowser(async ({ page, model, origin }) => {
    await page.goto(origin);
    await expectOperator(page, 'Not selected');
    await selectOperator(page);
    model.closeFailure = 409;
    await closeOperator(page, '19.9');
    await page.getByRole('alert').filter({ hasText: 'Isolated close rejected' }).waitFor();
    const failed = await stored(page);
    assert.equal(failed.close_amount, '19.9');
    assert.equal(Object.keys(failed.pending).length, 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await inventory(page);
    await expectOperator(page, 'Alice');
    await page.getByLabel('Total sales ($)').waitFor();
    assert.equal(await page.getByLabel('Total sales ($)').inputValue(), '19.9');
    model.closeFailure = 0;
    model.loseClose = true;
    await page.getByRole('button', { name: 'Submit shift total' }).click();
    await page.getByRole('button', { name: 'Confirm close out' }).click();
    await page.getByRole('alert').filter({ hasText: 'not confirmed' }).waitFor();
    assert.deepEqual((await stored(page)).pending, failed.pending);
    assert.equal(model.closes, 1);
    await page.reload();
    await expectOperator(page, 'Alice');
    await page.getByLabel('Total sales ($)').waitFor();
    assert.equal(await page.getByLabel('Total sales ($)').inputValue(), '19.9');
    await page.getByRole('button', { name: 'Submit shift total' }).click();
    await page.getByRole('button', { name: 'Confirm close out' }).click();
    await expectOperator(page, 'Not selected');
    assert.equal(model.closes, 1);
    const closeCalls = model.calls.filter(call => call.path.endsWith('/close'));
    assert.equal(closeCalls.length, 3);
    assert.equal(new Set(closeCalls.map(call => call.body.operation_id)).size, 1);
    assert.ok(closeCalls.every(call => call.body.amount_minor === 1990));
    await cart(page);
    await page.reload();
    await expectOperator(page, 'Not selected');
    assert.equal(await page.getByRole('dialog').count(), 0);
  });
});

test('Course/account isolation and notification destinations never copy operators; requests and audits do not need a shift', { timeout: 90000 }, async () => {
  await isolatedBrowser(async ({ page, context, model, origin }) => {
    model.failStaff = true;
    await page.goto(origin);
    await page.getByRole('alert').filter({ hasText: 'Isolated staff unavailable' }).waitFor();
    await page.getByRole('button', { name: 'Complete service', exact: true }).click();
    await page.getByRole('button', { name: 'Submitted', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'Isolated staff unavailable' }).waitFor();
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await page.getByRole('button', { name: 'Submitted', exact: true }).waitFor();
    assert.equal(model.calls.filter(call => call.path.startsWith('/api/v1/requests/')).length, 2);
    assert.ok(model.calls.every(call => call.method === 'GET' || call.path.startsWith('/api/v1/requests/')));
    model.failStaff = false;
    await page.reload();
    await expectOperator(page, 'Not selected');
    await selectOperator(page);
    const first = await stored(page);
    model.failStaff = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('alert').filter({ hasText: 'Isolated staff unavailable' }).waitFor();
    await expectOperator(page, 'Alice');
    assert.equal(await closeButton(page).isEnabled(), true);
    model.failStaff = false;
    await page.getByLabel('Select course').selectOption('TEST-C/TEST-B');
    await expectOperator(page, 'Not selected');
    await selectOperator(page, 'bob');
    const second = await stored(page, 'TEST-B');
    await page.getByLabel('Select course').selectOption('TEST-C/TEST-A');
    await expectOperator(page, 'Alice');
    assert.equal((await stored(page)).session_id, first.session_id);
    await page.getByLabel('Select customer').selectOption('TEST-D');
    await expectOperator(page, 'Not selected');
    await page.goto(`${origin}/?customer_id=TEST-C&course_id=TEST-B&request_id=request-TEST-B`);
    await expectOperator(page, 'Bob');
    assert.equal((await stored(page, 'TEST-B')).session_id, second.session_id);
    await page.getByLabel('Select course').selectOption('TEST-C/TEST-R');
    assert.equal(await page.locator('.inventory-session').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Inventory', exact: true }).count(), 0);
    assert.equal(await stored(page, 'TEST-R'), null);
    await page.goto(`${origin}/inventory?customer_id=TEST-C&course_id=TEST-A`);
    await expectOperator(page, 'Alice');
    await closeOperator(page, '0.00');
    await expectOperator(page, 'Not selected');
    await page.getByRole('button', { name: 'Confirm Inventory Audit', exact: true }).click();
    await page.getByRole('dialog').getByRole('combobox').selectOption('alice');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirm audit', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(model.audits, 1);
    assert.equal((await stored(page)).shift, null);
    await page.goto(`${origin}/?other-account=1`);
    await expectOperator(page, 'Not selected');
    assert.equal((await stored(page, 'TEST-B')).shift.staff_name, 'Bob');
    const otherWindow = await context.newPage();
    await otherWindow.goto(`${origin}/?customer_id=TEST-C&course_id=TEST-B`);
    await expectOperator(otherWindow, 'Not selected');
    assert.notEqual((await stored(otherWindow, 'TEST-B')).session_id, second.session_id);
    assert.equal(model.closes, 1);
  });
});

test('delayed reads and callbacks cannot resurrect closed shifts or overwrite newer pending operations and drafts', { timeout: 90000 }, async () => {
  await isolatedBrowser(async ({ page, model, origin }) => {
    await page.goto(`${origin}/?probe=1`);
    await expectOperator(page, 'Not selected');
    model.holdReads = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitForHeld(model, 1);
    await selectOperator(page);
    await releaseRead(page, model.held.shift());
    await expectOperator(page, 'Alice');
    model.holdReads = false;
    await closeOperator(page, '0.00');
    await expectOperator(page, 'Not selected');
    model.holdSelect = true;
    await page.getByRole('button', { name: 'Select operator', exact: true }).click();
    await page.getByLabel('Staff name').selectOption('alice');
    await page.getByRole('button', { name: 'Confirm operator', exact: true }).click();
    await waitForHeld(model, 1);
    const original = await stored(page);
    await page.evaluate(() => window.remountSession());
    await page.getByRole('button', { name: 'Resolve last submission' }).click();
    await expectOperator(page, 'Alice');
    model.holdSelect = false;
    model.holdReads = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitForHeld(model, 2);
    await closeOperator(page, '0.00');
    await expectOperator(page, 'Not selected');
    await releaseRead(page, model.held.pop());
    await expectOperator(page, 'Not selected');
    assert.equal(await page.getByRole('dialog').count(), 0);
    model.holdReads = false;
    await selectOperator(page, 'bob');
    model.holdStock = true;
    await page.evaluate(() => {
      window.stockOutcome = null;
      window.sessionActions.request('/products/water/stock', { kind: 'sale', units: 1 })
        .then(() => { window.stockOutcome = 'confirmed'; }, error => { window.stockOutcome = error.message; });
    });
    await waitForHeld(model, 2);
    await page.evaluate(() => window.sessionActions.saveCloseDraft('34.50'));
    await model.held.pop()();
    await page.waitForFunction(() => window.stockOutcome !== null);
    assert.equal(await page.evaluate(() => window.stockOutcome), 'confirmed');
    assert.equal((await stored(page)).close_amount, '34.50');
    model.holdStock = false;
    model.loseStock = true;
    const failure = await page.evaluate(async () => {
      window.sessionActions.saveCloseDraft('23.40');
      try { await window.sessionActions.request('/products/water/stock', { kind: 'sale', units: 1 }); }
      catch (error) { return error.message; }
    });
    assert.match(failure, /not confirmed/);
    const pending = await stored(page);
    assert.equal(Object.keys(pending.pending).length, 1);
    assert.notDeepEqual(pending.pending, original.pending);
    await model.held.shift()();
    await page.waitForFunction(revision => {
      const session = JSON.parse(sessionStorage.getItem('inventory-session:session-test-user:TEST-C:TEST-A'));
      return session.revision > revision;
    }, pending.revision);
    const after = await stored(page);
    assert.deepEqual(after.pending, pending.pending);
    assert.equal(after.close_amount, '23.40');
    assert.equal(after.shift.staff_name, 'Bob');
    await page.getByRole('button', { name: 'Resolve last submission' }).click();
    await page.waitForFunction(() => !window.sessionActions.unresolved);
    assert.equal((await stored(page)).shift.has_activity, true);
    assert.equal(model.sales, 2);
    assert.equal(await page.getByRole('button', { name: 'Change operator' }).count(), 0);
    await closeButton(page).click();
    assert.equal(await page.getByLabel('Total sales ($)').inputValue(), '23.40');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.reload();
    await expectOperator(page, 'Bob');
    assert.equal((await stored(page)).shift.has_activity, true);
    assert.equal((await stored(page)).close_amount, '23.40');
  });
});
