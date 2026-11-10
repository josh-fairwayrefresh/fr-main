import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('one Refresh press reconciles subscriptions while preserving notification preferences', { timeout: 90000 }, async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  const registrations = [];
  const attempts = new Map();
  const preferenceWrites = [];
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
    if (url.pathname.endsWith('/api/v1/operator/notification-preferences') && request.method === 'PATCH') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      preferenceWrites.push(JSON.parse(raw));
      response.setHeader('Content-Type', 'application/json');
      response.end(raw);
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
        const persistenceKey = `notification-recovery:${config.courses.map((course) => course.course_id).join(',')}`;
        const saved = JSON.parse(localStorage.getItem(persistenceKey) || '{}');
        const state = {
          permission: saved.permission || permission,
          permissionOnRequest,
          requireGesture,
          endpoint,
          refreshHandlerStack: false,
          subscribeCalls: saved.subscribeCalls || 0,
          gestureSubscribeCalls: saved.gestureSubscribeCalls || 0,
          getSubscriptionCalls: 0,
          permissionCalls: saved.permissionCalls || 0,
        };
        const persist = () => localStorage.setItem(persistenceKey, JSON.stringify({
          permission: state.permission,
          endpoint: state.subscription?.toJSON().endpoint || '',
          subscribeCalls: state.subscribeCalls,
          gestureSubscribeCalls: state.gestureSubscribeCalls,
          permissionCalls: state.permissionCalls,
        }));
        const makeSubscription = (value) => ({
          toJSON: () => ({ endpoint: value, expirationTime: null, keys: { p256dh: 'public-key', auth: 'auth-key' } }),
        });
        state.subscription = saved.endpoint
          ? makeSubscription(saved.endpoint)
          : endpoint ? makeSubscription(endpoint) : null;
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
            if (state.refreshHandlerStack) state.gestureSubscribeCalls += 1;
            persist();
            if (state.requireGesture && !state.refreshHandlerStack) throw new DOMException('User gesture required', 'NotAllowedError');
            state.subscription = makeSubscription('https://push.example/generated-subscription');
            persist();
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
              if (!state.refreshHandlerStack) throw new DOMException('User gesture required', 'NotAllowedError');
              state.permission = state.permissionOnRequest;
              persist();
              return state.permission;
            },
          },
        });
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

    async function refreshOnce(page) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.getByRole('button', { name: 'Refresh App', exact: true }).click(),
      ]);
    }

    const existing = await openPage({
      courses: ['existing-course', 'another-course', 'disabled-course'],
      enabled: ['existing-course', 'another-course'],
      endpoint: 'https://push.example/existing-subscription',
    });
    await waitForPosts('existing-course', 1);
    await waitForPosts('another-course', 1);
    assert.equal(await existing.getByRole('checkbox').nth(0).isChecked(), true);
    assert.equal(await existing.getByRole('checkbox').nth(2).isChecked(), false);
    assert.equal(await existing.evaluate(() => window.__notificationMock.subscribeCalls), 0);
    const preferenceWritesBeforeRefresh = preferenceWrites.length;
    await refreshOnce(existing);
    await waitForPosts('existing-course', 2);
    await waitForPosts('another-course', 2);
    assert.equal(preferenceWrites.length, preferenceWritesBeforeRefresh);
    assert.equal(await existing.getByRole('checkbox').nth(0).isChecked(), true);
    assert.equal(await existing.getByRole('checkbox').nth(2).isChecked(), false);
    assert.equal(await existing.getByText(/subscription registered|notification restoration/i).count(), 0);
    assert.equal(await existing.getByRole('button', { name: /Restore Notifications/i }).count(), 0);
    assert.ok(registrations.filter((entry) => ['existing-course', 'another-course'].includes(entry.course_id))
      .every((entry) => entry.subscription.endpoint === 'https://push.example/existing-subscription'));
    assert.ok(registrations.filter((entry) => ['existing-course', 'another-course'].includes(entry.course_id))
      .every((entry) => entry.authorization === 'Bearer notification-test-token'));
    assert.equal(registrations.some((entry) => entry.course_id === 'disabled-course'), false);
    await existing.close();

    const automatic = await openPage({ courses: ['automatic-course'] });
    await waitForPosts('automatic-course', 1);
    assert.equal(await automatic.evaluate(() => window.__notificationMock.subscribeCalls), 1);
    assert.equal(registrations.find((entry) => entry.course_id === 'automatic-course').subscription.endpoint,
      'https://push.example/generated-subscription');
    await automatic.close();

    const gesture = await openPage({ courses: ['gesture-course'], requireGesture: true });
    await gesture.getByRole('alert').getByText(/Press Refresh App to retry/i).waitFor();
    assert.equal(await gesture.evaluate(() => window.__notificationMock.subscribeCalls), 1);
    await refreshOnce(gesture);
    assert.deepEqual(await gesture.evaluate(() => ({
      subscribeCalls: window.__notificationMock.subscribeCalls,
      endpoint: window.__notificationMock.subscription?.toJSON().endpoint || '',
      storage: localStorage.getItem('notification-recovery:gesture-course'),
    })), {
      subscribeCalls: 2,
      endpoint: 'https://push.example/generated-subscription',
      storage: JSON.stringify({
        permission: 'granted',
        endpoint: 'https://push.example/generated-subscription',
        subscribeCalls: 2,
        gestureSubscribeCalls: 1,
        permissionCalls: 0,
      }),
    });
    assert.equal(await gesture.evaluate(() => window.__notificationMock.gestureSubscribeCalls), 1);
    await waitForPosts('gesture-course', 2);
    assert.equal(await gesture.getByRole('button', { name: /Restore Notifications/i }).count(), 0);
    await gesture.close();

    const defaultPermission = await openPage({ courses: ['permission-course'], permission: 'default' });
    await defaultPermission.getByRole('alert').getByText(/Press Refresh App to allow notifications/i).waitFor();
    assert.equal(await defaultPermission.evaluate(() => window.__notificationMock.subscribeCalls), 0);
    await refreshOnce(defaultPermission);
    await waitForPosts('permission-course', 1);
    assert.equal(await defaultPermission.evaluate(() => window.__notificationMock.permissionCalls), 1);
    assert.equal(await defaultPermission.getByRole('checkbox').isChecked(), true);
    await defaultPermission.close();

    const denied = await openPage({
      courses: ['denied-course'],
      permission: 'denied',
      permissionOnRequest: 'denied',
    });
    await denied.getByRole('alert').getByText(/blocked/i).waitFor();
    assert.equal(await denied.getByRole('checkbox').isChecked(), true);
    assert.equal(await denied.getByRole('button', { name: /Restore Notifications/i }).count(), 0);
    await refreshOnce(denied);
    await denied.getByRole('alert').getByText(/blocked/i).waitFor();
    assert.equal(await denied.evaluate(() => window.__notificationMock.subscribeCalls), 0);
    await denied.close();

    const unsupportedPage = await openPage({ courses: ['unsupported-course'], unsupported: true });
    await unsupportedPage.getByRole('alert').getByText(/unavailable on this browser/i).waitFor();
    assert.equal(await unsupportedPage.getByRole('button', { name: /Restore Notifications/i }).count(), 0);
    await unsupportedPage.close();

    const networkFailure = await openPage({ courses: ['network-course'], abortRegistration: true });
    await networkFailure.getByRole('alert').getByText(/Press Refresh App to retry/i).waitFor();
    await networkFailure.unroute('**/api/v1/operator/push-subscriptions');
    await refreshOnce(networkFailure);
    await waitForPosts('network-course', 2);
    await networkFailure.close();

    const backendFailure = await openPage({ courses: ['retry-course'] });
    await backendFailure.getByRole('alert').getByText(/temporarily unavailable/i).waitFor();
    await refreshOnce(backendFailure);
    await waitForPosts('retry-course', 3);
    await backendFailure.close();

    const refresh = await openPage({ courses: ['refresh-course'], endpoint: 'https://push.example/refresh-subscription' });
    await waitForPosts('refresh-course', 1);
    const originalUrl = refresh.url();
    await refreshOnce(refresh);
    await waitForPosts('refresh-course', 2);
    assert.equal(refresh.url(), originalUrl);
    assert.equal(preferenceWrites.length, preferenceWritesBeforeRefresh);
    await refresh.close();
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
