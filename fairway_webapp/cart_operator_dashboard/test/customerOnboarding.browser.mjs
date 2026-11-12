import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

function luminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const rgb = (value) => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const INITIAL_PASSWORD = 'Initial-Secret-4821';
const RESET_PASSWORD = 'Replacement-Secret-9375';

test('Customer onboarding: readable Add course, creation-only operation type, and managed users', { timeout: 120000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__onboarding')) return next();
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__onboarding',
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/customerOnboarding.fixture.jsx"></script>'));
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
    const calls = (predicate) => page.evaluate(`onboardingCalls.filter(${predicate})`);
    await page.goto(origin + '/__onboarding');

    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const navigation = page.locator(width <= 700 ? '.a-mobile-nav' : '.a-sidebar nav');
      await navigation.getByRole('button', { name: 'Customers & Courses' }).click();
      const addCourse = page.getByRole('button', { name: 'Add course to Onboarding fixture Customer' });
      await addCourse.waitFor();
      assert.equal(await addCourse.innerText(), 'Add course');
      const colors = await addCourse.evaluate(element => {
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor };
      });
      assert.ok(contrast(rgb(colors.color), rgb(colors.background)) >= 4.5,
        `Add course label contrast at ${width}px: ${JSON.stringify(colors)}`);
      const box = await addCourse.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.height >= 38);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Add course to Onboarding fixture Customer' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByText('Onboarding fixture Customer', { exact: true }).waitFor();
    const cancel = modal.getByRole('button', { name: 'Cancel' });
    const cancelColors = await cancel.evaluate(element => [getComputedStyle(element).color, getComputedStyle(element).backgroundColor]);
    assert.ok(contrast(rgb(cancelColors[0]), rgb(cancelColors[1])) >= 4.5, 'modal Cancel is readable');
    const operation = modal.locator('label').filter({ hasText: /^Operation type/ }).locator('select');
    assert.deepEqual(await operation.locator('option').evaluateAll(options => options.map(option => [option.value, option.textContent])),
      [['cart', 'Cart service'], ['driving_range', 'Driving Range']]);
    assert.equal(await operation.inputValue(), 'cart');
    await operation.selectOption('driving_range');
    await modal.getByText(/start with service suspended/).waitFor();
    await modal.locator('label').filter({ hasText: /^Course name/ }).locator('input').fill('North Range');
    const timezone = modal.locator('label').filter({ hasText: /^Timezone/ }).locator('input');
    await timezone.fill('Pacific Time');
    await modal.getByRole('button', { name: 'Save' }).click();
    await modal.getByText('Timezone must be an IANA timezone name, for example America/Los_Angeles.').waitFor();
    assert.equal((await calls("call => call.method === 'POST' && call.path.endsWith('/courses')")).length, 0);
    await timezone.fill('America/Denver');
    await modal.getByRole('button', { name: 'Save' }).click();
    await page.getByText('North Range', { exact: true }).waitFor();
    assert.deepEqual((await calls("call => call.method === 'POST' && call.path.endsWith('/courses')"))[0].body, {
      course_name: 'North Range', timezone: 'America/Denver', course_location: '', comments: '', operation_kind: 'driving_range',
    });
    await page.getByText('Operation: Driving Range', { exact: true }).waitFor();

    await page.getByRole('button', { name: /North Range/ }).first().click();
    const editModal = page.getByRole('dialog');
    await editModal.getByText('Set when the Course was created; it cannot be changed.').waitFor();
    assert.equal(await editModal.locator('select').count(), 0, 'operation type is read-only when editing');
    await editModal.getByText('Driving Range', { exact: true }).waitFor();
    await editModal.getByRole('button', { name: 'Save' }).click();
    await editModal.waitFor({ state: 'detached' });
    const patch = (await calls("call => call.method === 'PATCH'"))[0];
    assert.equal(Object.hasOwn(patch.body, 'operation_kind'), false);

    await page.locator('.a-sidebar nav').getByRole('button', { name: 'User Management' }).click();
    await page.getByText('admin@fairwayrefresh.com', { exact: true }).first().waitFor();
    await page.getByText('This is your account. Another Admin must reset its password or change its status.').waitFor();
    await page.getByRole('button', { name: 'New user' }).click();
    const form = page.getByRole('form', { name: 'Create user' });
    await form.getByText('@fairwayrefresh.com', { exact: true }).waitFor();
    await form.locator('label').filter({ hasText: /^Username/ }).locator('input').fill(' Pro.Shop ');
    await form.locator('label').filter({ hasText: /^Initial password/ }).locator('input').fill(INITIAL_PASSWORD);
    await form.locator('label').filter({ hasText: /^Confirm password/ }).locator('input').fill('Mismatched-Secret-000');
    await form.locator('label').filter({ hasText: /^Customer/ }).locator('select').selectOption('CUST-TEST');
    await form.getByText('North Range (COURSE-101)').waitFor();
    await form.getByText('North Range (COURSE-101)').click();
    await form.getByRole('button', { name: 'Create user' }).click();
    await page.getByText('The password confirmation does not match.').waitFor();
    assert.equal((await calls("call => call.method === 'POST' && call.path === '/api/v1/admin/users'")).length, 0);
    await form.locator('label').filter({ hasText: /^Confirm password/ }).locator('input').fill(INITIAL_PASSWORD);
    await form.getByRole('button', { name: 'Create user' }).click();
    await page.getByText('Created pro.shop@fairwayrefresh.com. Share the initial password with the user through an approved channel.').waitFor();
    assert.deepEqual((await calls("call => call.method === 'POST' && call.path === '/api/v1/admin/users'"))[0].body, {
      username: 'pro.shop', password: INITIAL_PASSWORD, admin: false, customer_id: 'CUST-TEST', course_ids: ['COURSE-101'],
    });
    assert.equal(await page.evaluate(password => document.body.innerHTML.includes(password), INITIAL_PASSWORD), false);
    await page.locator('.a-user-editor h3', { hasText: 'pro.shop@fairwayrefresh.com' }).waitFor();

    const reset = page.getByRole('form', { name: 'Reset password' });
    await reset.locator('label').filter({ hasText: /^New password/ }).locator('input').fill(RESET_PASSWORD);
    await reset.locator('label').filter({ hasText: /^Confirm password/ }).locator('input').fill(RESET_PASSWORD);
    await reset.getByRole('button', { name: 'Reset password' }).click();
    await page.getByText('Password reset for pro.shop@fairwayrefresh.com. Existing sessions were signed out.').waitFor();
    assert.deepEqual((await calls("call => call.path === '/api/v1/admin/users/created-1/password'"))[0].body, { password: RESET_PASSWORD });

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Deactivate account' }).click();
    await page.getByText('pro.shop@fairwayrefresh.com was deactivated and signed out.').waitFor();
    await page.getByText('PROVISIONED · Deactivated').waitFor();
    await page.getByRole('button', { name: 'Reactivate account' }).click();
    await page.getByText('pro.shop@fairwayrefresh.com was reactivated.').waitFor();
    assert.deepEqual((await calls("call => call.path === '/api/v1/admin/users/created-1/status'")).map(call => call.body),
      [{ disabled: true }, { disabled: false }]);

    await page.getByRole('button', { name: 'New user' }).click();
    const duplicate = page.getByRole('form', { name: 'Create user' });
    await duplicate.locator('label').filter({ hasText: /^Username/ }).locator('input').fill('pro.shop');
    await duplicate.locator('label').filter({ hasText: /^Initial password/ }).locator('input').fill(INITIAL_PASSWORD);
    await duplicate.locator('label').filter({ hasText: /^Confirm password/ }).locator('input').fill(INITIAL_PASSWORD);
    await duplicate.locator('label').filter({ hasText: /Admin — global Admin/ }).locator('input').check();
    await duplicate.getByRole('button', { name: 'Create user' }).click();
    await page.getByText('An account with this username already exists.').waitFor();

    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no overflow at ${width}px`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
