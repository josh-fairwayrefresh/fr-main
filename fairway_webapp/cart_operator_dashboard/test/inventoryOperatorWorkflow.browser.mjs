import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const key = (course = 'A', customer = 'TEST-C') => `inventory-session:workflow-test:${customer}:${course}`;
const staff = ['Alice', 'Bob'].map(name => ({ staff_id: name.toLowerCase(), name, active: true, role: 'cart_operator' }));

async function fixture(run) {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use(async (request, response, next) => {
    if (!['/', '/inventory', '/admin'].includes(request.url.split('?')[0]) && !request.url.startsWith('/requests/')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/', '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/inventoryOperatorWorkflow.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  const state = { sessions: new Map(), receipts: new Map(), calls: [], errors: [], closes: 0,
    failRead: false, failStaff: false, rejectClose: false, loseClose: false, hold: null, shiftSequence: 0 };
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const context = await browser.newContext();
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const body = request.postDataJSON() || {}, method = request.method(), path = url.pathname;
      state.calls.push({ path, method, body, search: url.search });
      const send = (json, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
      const match = path.match(/\/inventory\/courses\/([^/]+)\/([^/]+)(.*)/);
      if (path.endsWith('/fleet')) return send({ customers: [], devices: [] });
      if (path.endsWith('/dashboard')) return send({ courses: [], reports: { daily: { summary: {}, history: [] } } });
      if (/\/requests\/.+\/(complete|cancel)$/.test(path)) return send({ ok: true });
      if (!match) throw new Error(`Unexpected isolated API ${method} ${path}`);
      const [, customer, course, suffix] = match;
      const sessionKey = id => `${customer}/${course}/${id}`;
      if (suffix === '/staff') return state.failStaff ? send({ message: 'Synthetic staff unavailable' }, 503) : send({ staff });
      if (suffix === '/shifts/session') {
        if (state.failRead) return send({ message: 'Synthetic shift read unavailable' }, 503);
        const snapshot = structuredClone(state.sessions.get(sessionKey(url.searchParams.get('session_id'))) || null);
        if (state.hold) {
          const hold = state.hold;
          state.hold = null;
          hold.started();
          await hold.barrier;
        }
        return send({ shift: snapshot });
      }
      if (state.receipts.has(body.operation_id)) return send(state.receipts.get(body.operation_id));
      if (suffix === '/shifts/select') {
        const person = staff.find(person => person.staff_id === body.staff_id);
        const shift = { shift_id: `shift-${++state.shiftSequence}`, staff_id: person.staff_id,
          staff_name: person.name, has_activity: false, status: 'active' };
        state.sessions.set(sessionKey(body.session_id), shift);
        const result = { shift };
        state.receipts.set(body.operation_id, result);
        return send(result);
      }
      if (suffix.endsWith('/close')) {
        if (state.rejectClose) return send({ message: 'Synthetic close rejected' }, 409);
        state.sessions.delete(sessionKey(body.session_id));
        state.closes++;
        const result = { closed: true };
        state.receipts.set(body.operation_id, result);
        if (state.loseClose) { state.loseClose = false; return route.abort('failed'); }
        return send(result);
      }
      if (suffix === '/audits') return send({ audits: [] });
      if (!suffix) return send({ customer_id: customer, course_id: course, timezone: 'America/Los_Angeles',
        categories: [], products: [], inventory_revision: 0, daily_sales: { total_units: 0, products: [] } });
      throw new Error(`Unexpected isolated API ${method} ${path}`);
    });
    const page = await context.newPage();
    page.on('pageerror', error => state.errors.push(error.message));
    const go = path => page.goto(origin + path);
    const stored = (course = 'A', customer = 'TEST-C') => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), key(course, customer));
    await run({ page, state, go, stored, origin });
    assert.deepEqual(state.errors, []);
  } finally { await browser?.close(); await server.close(); }
}

async function select(page, name = 'Alice') {
  await page.getByRole('button', { name: /^(Select operator|Change operator)$/ }).click();
  await page.getByLabel('Staff name').selectOption(name.toLowerCase());
  await page.getByRole('button', { name: 'Confirm operator', exact: true }).click();
  await page.locator('.inventory-session > span').getByText(name, { exact: true }).waitFor();
}

async function close(page, amount = '12.30') {
  await page.getByRole('button', { name: 'Close out Enter final sales' }).click();
  await page.getByLabel('Total sales ($)').fill(amount);
  await page.getByRole('button', { name: 'Submit shift total' }).click();
  await page.getByRole('button', { name: 'Confirm close out' }).click();
}

test('Inventory owns selection/change/close; real links and reload preserve one scoped identity', { timeout: 90000 }, async () => fixture(async ({ page, go, stored, state }) => {
  await go('/inventory?customer_id=TEST-C&course_id=A');
  await select(page);
  const sessionId = (await stored()).session_id;
  await select(page, 'Bob');
  await page.getByRole('link', { name: 'Cart Operations', exact: true }).click();
  await page.locator('.inventory-session').getByText('Bob', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Select operator|Change operator|Close out|Resolve last submission/ }).count(), 0);
  const directoryReads = state.calls.filter(call => call.path.endsWith('/staff')).length;
  await page.reload();
  await page.locator('.inventory-session').getByText('Bob', { exact: true }).waitFor();
  assert.equal(state.calls.filter(call => call.path.endsWith('/staff')).length, directoryReads, 'Requests never needs staff loading');
  assert.equal((await stored()).session_id, sessionId);
  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Close out Enter final sales' }).click();
  await page.getByLabel('Total sales ($)').fill('012.30');
  await page.getByRole('button', { name: 'Submit shift total' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByLabel('Total sales ($)').inputValue(), '012.30');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Close out Enter final sales' }).click();
  assert.equal(await page.getByLabel('Total sales ($)').inputValue(), '012.30');
  await page.getByRole('button', { name: 'Submit shift total' }).click();
  await page.getByRole('button', { name: 'Confirm close out' }).click();
  await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Cart Operations', exact: true }).click();
  await page.reload();
  await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(state.closes, 1);
}));

test('all account sign-out surfaces check every scoped shift; no shift permits normal sign-out', { timeout: 90000 }, async () => fixture(async ({ page, go, state }) => {
  await go('/');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForFunction(() => window.testSignOuts === 1);
  await go('/inventory?customer_id=TEST-C&course_id=A');
  await select(page);
  for (const path of ['/?customer_id=TEST-C&course_id=B', '/inventory?customer_id=TEST-C&course_id=B',
    '/?customer_id=TEST-C&course_id=R', '/admin']) {
    await go(path);
    await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Before signing out' });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => window.testSignOuts), 0);
    assert.match(await dialog.innerText(), /Close your open shift/);
    assert.equal(await dialog.getByRole('link', { name: 'Go to Inventory' }).getAttribute('href'), '/inventory?customer_id=TEST-C&course_id=A');
    if (path === '/?customer_id=TEST-C&course_id=B') {
      for (const width of [375, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
        assert.ok((await dialog.getByRole('link', { name: 'Go to Inventory' }).boundingBox()).height >= 44);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    }
    await dialog.getByRole('button', { name: 'Stay signed in' }).click();
  }
  await go('/inventory?customer_id=TEST-C&course_id=A');
  await close(page, '0');
  await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForFunction(() => window.testSignOuts === 1);
  assert.equal(state.closes, 1, 'Sign out never closes a shift itself');
}));

test('unselected or failed operator reads do not gate requests; failures cannot bypass sign-out', { timeout: 90000 }, async () => fixture(async ({ page, go, state }) => {
  await go('/');
  await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('inventory-session:')).length), 0,
    'Requests creates no independent operator identity');
  await page.getByRole('button', { name: 'Complete service', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await page.getByRole('heading', { name: 'Test button two', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(state.calls.filter(call => /\/requests\/.+\/(complete|cancel)$/.test(call.path)).length, 2);
  await go('/inventory?customer_id=TEST-C&course_id=A');
  await select(page);
  state.failRead = true;
  state.failStaff = true;
  await page.getByRole('link', { name: 'Cart Operations', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Synthetic shift read unavailable' }).waitFor();
  await page.getByRole('button', { name: 'Complete service', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Unable to sign out safely' }).waitFor();
  assert.equal(await page.evaluate(() => window.testSignOuts), 0);
  await page.getByRole('button', { name: 'Stay signed in' }).click();
  state.failRead = false;
  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Synthetic staff unavailable' }).waitFor();
  await close(page, '0');
  await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
  await page.evaluate(key => {
    const record = JSON.parse(sessionStorage.getItem(key));
    record.pending = { 'invalid operation': 'preserve-for-recovery' };
    sessionStorage.setItem(key, JSON.stringify(record));
  }, key());
  await go('/');
  await page.getByRole('alert').filter({ hasText: 'Unable to read inventory session' }).waitFor();
  await page.getByRole('button', { name: 'Complete service', exact: true }).click();
  await page.getByRole('heading', { name: 'Test button one', exact: true }).waitFor({ state: 'hidden' });
}));

test('rejected/lost close preserves exact draft and receipt through navigation, then resolves once', { timeout: 90000 }, async () => fixture(async ({ page, go, state, stored }) => {
  await go('/inventory?customer_id=TEST-C&course_id=A');
  await select(page);
  state.rejectClose = true;
  await close(page, '012.30');
  await page.getByRole('alert').filter({ hasText: 'Synthetic close rejected' }).waitFor();
  const failed = await stored(), pending = Object.entries(failed.pending)[0];
  assert.equal(failed.close_amount, '012.30');
  assert.equal(failed.shift.staff_name, 'Alice');
  state.rejectClose = false;
  state.loseClose = true;
  await page.getByRole('button', { name: 'Confirm close out' }).click();
  await page.getByRole('alert').filter({ hasText: 'not confirmed' }).waitFor();
  assert.equal(state.closes, 1);
  await go('/?customer_id=TEST-C&course_id=A');
  await page.locator('.inventory-session').getByText('Alice', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'unconfirmed inventory submission' }).waitFor();
  await page.getByRole('link', { name: 'Go to Inventory' }).click();
  await page.getByLabel('Total sales ($)').waitFor();
  assert.equal(await page.getByLabel('Total sales ($)').inputValue(), '012.30');
  assert.deepEqual(Object.entries((await stored()).pending)[0], pending);
  await page.getByRole('button', { name: 'Submit shift total' }).click();
  await page.getByRole('button', { name: 'Confirm close out' }).click();
  await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
  assert.equal(state.closes, 1);
  assert.deepEqual((await stored()).pending, {});
}));

test('delayed active read cannot restore closed identity or erase a newer closeout draft', { timeout: 90000 }, async () => fixture(async ({ page, go, state, stored }) => {
  await go('/inventory?customer_id=TEST-C&course_id=A');
  await select(page);
  let release, started;
  const received = new Promise(resolve => { started = resolve; });
  state.hold = { started, barrier: new Promise(resolve => { release = resolve; }) };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await received;
  await close(page, '0');
  await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
  release();
  await page.waitForLoadState('networkidle');
  assert.equal((await stored()).shift, null);
  await select(page, 'Bob');
  let releaseDraft, startedDraft;
  const draftRead = new Promise(resolve => { startedDraft = resolve; });
  state.hold = { started: startedDraft, barrier: new Promise(resolve => { releaseDraft = resolve; }) };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await draftRead;
  await page.getByRole('button', { name: 'Close out Enter final sales' }).click();
  await page.getByLabel('Total sales ($)').fill('018.10');
  releaseDraft();
  await page.waitForLoadState('networkidle');
  assert.equal((await stored()).close_amount, '018.10');
  assert.equal((await stored()).shift.staff_name, 'Bob');
}));

test('Course/Customer navigation and notification deep links never copy an operator; legacy UUID survives restoration', { timeout: 90000 }, async () => fixture(async ({ page, go, stored, state }) => {
  await go('/inventory?customer_id=TEST-C&course_id=A');
  await select(page);
  const first = await stored();
  await page.getByLabel('Select course').selectOption('TEST-C/B');
  await select(page, 'Bob');
  assert.notEqual((await stored('B')).session_id, first.session_id);
  await page.getByRole('link', { name: 'Cart Operations', exact: true }).click();
  await page.locator('.inventory-session').getByText('Bob', { exact: true }).waitFor();
  await page.getByLabel('Select course').selectOption('TEST-C/A');
  await page.locator('.inventory-session').getByText('Alice', { exact: true }).waitFor();
  await page.getByLabel('Select customer').selectOption('TEST-D');
  await page.locator('.inventory-session').getByText('Not selected', { exact: true }).waitFor();
  assert.equal(await stored('A', 'TEST-D'), null);
  await page.evaluate(key => {
    const record = JSON.parse(sessionStorage.getItem(key));
    delete record.revision;
    sessionStorage.setItem(key, JSON.stringify(record));
  }, key());
  await go('/requests/one?customer_id=TEST-C&course_id=A');
  await page.locator('.inventory-session').getByText('Alice', { exact: true }).waitFor();
  assert.equal((await stored()).session_id, first.session_id);
  for (const width of [375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.getByLabel('Select course').selectOption('TEST-C/R');
  assert.equal(await page.locator('.inventory-session').count(), 0);
  assert.equal(await stored('R'), null);
  assert.equal(state.calls.some(call => call.path.includes('/inventory/courses/TEST-C/R')), false);
}));

test('sign-out verifies server state, rejects malformed storage and cannot race a changed session', { timeout: 90000 }, async () => fixture(async ({ page, go, state, stored }) => {
  await go('/inventory?customer_id=TEST-C&course_id=A');
  await select(page);
  await go('/admin');
  await page.evaluate(key => {
    const record = JSON.parse(sessionStorage.getItem(key));
    record.shift = null;
    sessionStorage.setItem(key, JSON.stringify(record));
  }, key());
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await page.getByRole('alert').filter({ hasText: 'Close your open shift' }).waitFor();
  assert.equal(await page.evaluate(() => window.testSignOuts), 0, 'Unselected local cache is not proof of server closure');
  await page.getByRole('button', { name: 'Stay signed in' }).click();
  state.sessions.clear();
  let release, started;
  const received = new Promise(resolve => { started = resolve; });
  state.hold = { started, barrier: new Promise(resolve => { release = resolve; }) };
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await received;
  await page.evaluate(key => {
    const record = JSON.parse(sessionStorage.getItem(key));
    record.close_amount = '14.00';
    sessionStorage.setItem(key, JSON.stringify(record));
  }, key());
  release();
  await page.getByRole('alert').filter({ hasText: 'changed while checking sign-out' }).waitFor();
  assert.equal(await page.evaluate(() => window.testSignOuts), 0);
  assert.equal((await stored()).close_amount, '14.00');
  await page.getByRole('button', { name: 'Stay signed in' }).click();
  let releaseCancelled, startedCancelled;
  const cancelledRead = new Promise(resolve => { startedCancelled = resolve; });
  state.hold = { started: startedCancelled, barrier: new Promise(resolve => { releaseCancelled = resolve; }) };
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await cancelledRead;
  await page.getByRole('button', { name: 'Stay signed in' }).click();
  releaseCancelled();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.evaluate(() => window.testSignOuts), 0, 'Cancelled status check cannot sign out later');
  await page.evaluate(key => sessionStorage.setItem(key, '{invalid'), key());
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await page.getByRole('alert').filter({ hasText: 'Unable to sign out safely' }).waitFor();
  assert.equal(await page.evaluate(() => window.testSignOuts), 0);
}));

test('authentication wiring exposes only one guarded SDK sign-out call', async () => {
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.equal((main.match(/signOut\(auth\)/g) || []).length, 1);
  assert.match(main, /<AccountSignOutProvider getUser=.*onSignOut=\{\(\) => signOut\(auth\)\}/);
  assert.equal((main.match(/onSignOut=\{requestSignOut\}/g) || []).length, 3);
  assert.match(main, /function EntryStatus[\s\S]*?const requestSignOut = useAccountSignOut\(\)/);
});
