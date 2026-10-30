import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('notification setup recovers subscriptions, reports failures, and runs on Refresh', { timeout: 90000 }, async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  const registrations = [];
  const attempts = new Map();
  server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/__notifications') {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml(url.pathname,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/notificationSetup.fixture.jsx"></script>'));
      return;
    }
    if (url.pathname.endsWith('/api/v1/operator/push-subscriptions') && request.method === 'POST') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      registrations.push({ authorization: request.headers.authorization, ...body });
      const key = `${body.customer_id}/${body.course_id}`;
      const count = (attempts.get(key) || 0) + 1;
      attempts.set(key, count);
      if (body.course_id === 'retry-course' && count === 1) {
        response.statusCode = 503;
        response.end('Registration service temporarily unavailable');
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    next();
  });

  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const context = await browser.newContext();

    async function openPage({
      courses = ['course-default'],
      enabled = courses,
      permission = 'granted',
      permissionOnRequest = 'granted',
      endpoint = '',
      requireGesture = false,
      unsupported = false,
      apiBaseUrl = '',
      abortRegistration = false,
    } = {}) {
      const page = await context.newPage();
      const courseData = courses.map((courseId) => ({
        customer_id: `customer-${courseId}`,
        course_id: courseId,
        course_name: `Course ${courseId}`,
      }));
      const config = {
        courses: courseData,
        notification_preferences: Object.fromEntries(courseData.map((course) => [
          `${course.customer_id}/${course.course_id}`,
          enabled.includes(course.course_id),
        ])),
        push: { vapid_public_key: Buffer.from(new Uint8Array(65).fill(1)).toString('base64url') },
        apiBaseUrl,
      };
      await page.addInitScript(({ config, permission, permissionOnRequest, endpoint, requireGesture, unsupported }) => {
        const state = { permission, permissionOnRequest, requireGesture, endpoint, userGesture: false, subscribeCalls: 0, getSubscriptionCalls: 0, permissionCalls: 0 };
        const makeSubscription = (value) => ({
          toJSON: () => ({ endpoint: value, expirationTime: null, keys: { p256dh: 'public-key', auth: 'auth-key' } }),
        });
        state.subscription = endpoint ? makeSubscription(endpoint) : null;
        window.__notificationMock = state;
        window.__notificationConfig = config;
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
        const registration = { pushManager: {
          getSubscription: async () => {
            state.getSubscriptionCalls += 1;
            return state.subscription;
          },
          subscribe: async () => {
            state.subscribeCalls += 1;
            if (state.requireGesture && !state.userGesture) throw new DOMException('User gesture required', 'NotAllowedError');
            state.subscription = makeSubscription('https://push.example/generated-subscription');
            return state.subscription;
          },
        } };
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: {
            register: async () => registration,
            ready: Promise.resolve(registration),
          },
        });
        Object.defineProperty(window, 'PushManager', { configurable: true, value: unsupported ? undefined : class PushManager {} });
        Object.defineProperty(window, 'Notification', {
          configurable: true,
          value: {
            get permission() { return state.permission; },
            requestPermission: async () => {
              state.permissionCalls += 1;
              state.permission = state.permissionOnRequest;
              return state.permission;
            },
          },
        });
        document.addEventListener('click', () => { state.userGesture = true; }, true);
      }, { config, permission, permissionOnRequest, endpoint, requireGesture, unsupported });
      if (abortRegistration) {
        await page.route('**/api/v1/operator/push-subscriptions', (route) => route.abort());
      }
      await page.goto(`${origin}/__notifications`);
      return page;
    }

    async function waitForPosts(courseId, count) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (registrations.filter((entry) => entry.course_id === courseId).length >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.fail(`Timed out waiting for ${count} registrations for ${courseId}`);
    }

    const existing = await openPage({
      courses: ['existing-course', 'another-course', 'disabled-course'],
      enabled: ['existing-course', 'another-course'],
      endpoint: 'https://push.example/existing-subscription',
    });
    await existing.getByText('Course existing-course: Preference enabled; subscription registered.').waitFor();
    await existing.getByText('Course another-course: Preference enabled; subscription registered.').waitFor();
    assert.equal(await existing.getByRole('checkbox').nth(0).isChecked(), true);
    assert.equal(await existing.getByRole('checkbox').nth(2).isChecked(), false);
    assert.equal(await existing.evaluate(() => window.__notificationMock.subscribeCalls), 0);
    assert.deepEqual(registrations.filter((entry) => ['existing-course', 'another-course'].includes(entry.course_id)).map((entry) => [
      entry.customer_id, entry.course_id, entry.subscription.endpoint, entry.authorization,
    ]), [
      ['customer-existing-course', 'existing-course', 'https://push.example/existing-subscription', 'Bearer notification-test-token'],
      ['customer-another-course', 'another-course', 'https://push.example/existing-subscription', 'Bearer notification-test-token'],
    ]);
    assert.equal(await existing.getByRole('button', { name: 'Restore Notifications' }).count(), 0);
    await existing.close();

    const automatic = await openPage({ courses: ['automatic-course'] });
    await automatic.getByText('Course automatic-course: Preference enabled; subscription registered.').waitFor();
    assert.equal(await automatic.evaluate(() => window.__notificationMock.subscribeCalls), 1);
    assert.equal(registrations.find((entry) => entry.course_id === 'automatic-course').subscription.endpoint,
      'https://push.example/generated-subscription');
    await automatic.close();

    const gesture = await openPage({ courses: ['gesture-course'], requireGesture: true });
    await gesture.getByRole('alert').getByText(/requires a tap/i).waitFor();
    await gesture.getByRole('button', { name: 'Restore Notifications' }).click();
    await gesture.getByText('Course gesture-course: Preference enabled; subscription registered.').waitFor();
    assert.equal(await gesture.evaluate(() => window.__notificationMock.subscribeCalls), 2);
    await gesture.close();

    const defaultPermission = await openPage({ courses: ['permission-course'], permission: 'default' });
    await defaultPermission.getByRole('alert').getByText(/Tap Restore Notifications/i).waitFor();
    assert.equal(await defaultPermission.evaluate(() => window.__notificationMock.subscribeCalls), 0);
    await defaultPermission.getByRole('button', { name: 'Restore Notifications' }).click();
    await defaultPermission.getByText('Course permission-course: Preference enabled; subscription registered.').waitFor();
    assert.equal(await defaultPermission.evaluate(() => window.__notificationMock.permissionCalls), 1);
    await defaultPermission.close();

    const denied = await openPage({ courses: ['denied-course'], permission: 'denied' });
    await denied.getByRole('alert').getByText(/blocked/i).waitFor();
    assert.equal(await denied.getByRole('checkbox').isChecked(), true);
    assert.match(await denied.getByText(/Course denied-course:/).innerText(), /needs notification restoration/);
    assert.equal(await denied.getByRole('button', { name: 'Restore Notifications' }).count(), 1);
    await denied.close();

    const unsupportedPage = await openPage({ courses: ['unsupported-course'], unsupported: true });
    await unsupportedPage.getByRole('alert').getByText(/unavailable on this browser/i).waitFor();
    assert.equal(await unsupportedPage.getByRole('button', { name: 'Restore Notifications' }).count(), 1);
    await unsupportedPage.close();

    const networkFailure = await openPage({ courses: ['network-course'], abortRegistration: true });
    await networkFailure.getByRole('alert').getByText(/retry/i).waitFor();
    assert.match(await networkFailure.getByText(/Course network-course:/).innerText(), /needs attention/);
    await networkFailure.unroute('**/api/v1/operator/push-subscriptions');
    await networkFailure.getByRole('button', { name: 'Restore Notifications' }).click();
    await networkFailure.getByText('Course network-course: Preference enabled; subscription registered.').waitFor();
    await networkFailure.close();

    const backendFailure = await openPage({ courses: ['retry-course'] });
    await backendFailure.getByRole('alert').getByText(/temporarily unavailable/i).waitFor();
    assert.match(await backendFailure.getByText(/Course retry-course:/).innerText(), /needs attention/);
    await backendFailure.getByRole('button', { name: 'Restore Notifications' }).click();
    await backendFailure.getByText('Course retry-course: Preference enabled; subscription registered.').waitFor();
    await backendFailure.close();

    const refresh = await openPage({ courses: ['refresh-course'], endpoint: 'https://push.example/refresh-subscription' });
    await refresh.getByText('Course refresh-course: Preference enabled; subscription registered.').waitFor();
    await waitForPosts('refresh-course', 1);
    const originalUrl = refresh.url();
    await Promise.all([
      refresh.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      refresh.getByRole('button', { name: 'Refresh App' }).click(),
    ]);
    await refresh.getByText('Course refresh-course: Preference enabled; subscription registered.').waitFor();
    await waitForPosts('refresh-course', 2);
    assert.equal(refresh.url(), originalUrl);
    await refresh.close();
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
