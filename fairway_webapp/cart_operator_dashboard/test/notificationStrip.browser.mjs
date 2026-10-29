import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

test('approved notification strip layouts and existing preference lifecycle remain accessible', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    appType: 'custom', server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (!request.url.startsWith('/__notifications')) return next();
    try {
      const fixture = request.url.includes('application=1') ? 'drivingRangeRelease' : 'notificationStrip';
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__notifications',
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/${fixture}.fixture.jsx"></script>`));
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
    const go = query => page.goto(`${origin}/__notifications?${query}`);
    await go('');
    await page.getByLabel('Tony Lema Course', { exact: true }).waitFor();
    for (const width of [320, 375, 390, 430, 620, 740, 741, 768, 820, 1024, 1180, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1100 });
      const layout = await page.locator('.notification-setup').evaluate(section => {
        const heading = section.querySelector('.notification-heading').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          height: section.getBoundingClientRect().height,
          background: getComputedStyle(section).backgroundColor,
          headingY: heading.y,
          choices: [...section.querySelectorAll('label')].map(label => {
            const box = label.getBoundingClientRect(), input = label.querySelector('input').getBoundingClientRect();
            return { x: box.x, right: box.right, y: box.y, height: box.height, checkboxRight: input.right, labelFirst: label.firstElementChild.tagName === 'SPAN' };
          }),
        };
      });
      assert.equal(layout.overflow, false, `${width}: overflow`);
      assert.equal(layout.background, 'rgb(245, 248, 241)');
      for (const choice of layout.choices) {
        assert.ok(choice.height >= 44 && choice.x >= 0 && choice.right <= width, `${width}: target/clipping`);
        assert.equal(choice.labelFirst, true);
        assert.ok(choice.checkboxRight <= choice.right);
      }
      if (width > 740) {
        assert.equal(layout.height, 56, `${width}: approved single line`);
        assert.equal(layout.choices[0].y, layout.choices[1].y);
      } else {
        assert.equal(layout.height, 146, `${width}: approved phone stack`);
        assert.ok(layout.choices[0].y > layout.headingY);
        assert.ok(layout.choices[1].y >= layout.choices[0].y + 44);
        assert.equal(layout.choices[0].checkboxRight, layout.choices[1].checkboxRight);
      }
      if (process.env.NOTIFICATION_SCREENSHOT_DIR && [390, 768, 1024, 1440].includes(width)) {
        await page.locator('.notification-setup').screenshot({ path: `${process.env.NOTIFICATION_SCREENSHOT_DIR}/notifications-${width}.png` });
      }
    }
    const range = page.getByLabel('Driving Range', { exact: true });
    await range.click();
    await page.waitForFunction(() => window.notificationPending.length === 2);
    assert.equal(await range.isChecked(), true);
    assert.deepEqual(await page.evaluate(() => window.notificationPending), [true, false]);
    assert.ok(await page.evaluate(() => window.notificationCalls.some(call => call.path?.endsWith('/push-subscriptions') && call.body.course_id === 'B')));
    await range.click();
    await page.waitForFunction(() => window.notificationPending.length === 4);
    assert.equal(await range.isChecked(), false);
    await page.evaluate(() => { window.notificationFailure = true; });
    await range.click();
    await page.getByRole('alert').getByText('Synthetic preference failure').waitFor();
    assert.equal(await range.isChecked(), false);
    await page.evaluate(() => { window.notificationFailure = false; });
    await range.click();
    await page.waitForFunction(() => window.notificationPending.length === 8);
    assert.equal(await page.getByRole('alert').count(), 0, 'successful retry clears error');
    for (const query of ['unsupported=1', 'uninstalled=1', 'unconfigured=1']) {
      await go(query);
      await page.getByLabel('Driving Range', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Driving Range', { exact: true }).isDisabled(), true);
      assert.equal(await page.locator('.notification-guidance').isVisible(), false);
      await page.locator('.notification-course-options label').nth(1).focus();
      assert.equal(await page.locator('.notification-guidance').isVisible(), true);
      await page.locator('.notification-course-options label').nth(1).evaluate(label => label.blur());
      assert.equal(await page.locator('.notification-guidance').isVisible(), false);
      await page.getByLabel('Tony Lema Course', { exact: true }).click();
      await page.waitForFunction(() => window.notificationPending.length === 2);
      assert.equal(await page.getByLabel('Tony Lema Course', { exact: true }).isChecked(), false, 'existing preference can still be disabled');
    }
    for (const permission of ['denied', 'default']) {
      await go(`permission=${permission}`);
      await page.getByLabel('Driving Range', { exact: true }).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByLabel('Driving Range', { exact: true }).isChecked(), false);
      assert.equal(await page.evaluate(() => window.notificationCalls.some(call => call.path?.endsWith('/notification-preferences'))), false);
    }
    await go('long=1');
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.locator('label').first().waitFor();
      assert.equal(await page.locator('input').count(), 7);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: long/additional Courses`);
    }
    await go('application=1');
    await page.locator('.op-header').waitFor();
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(await page.locator('.notification-setup').count(), 1);
      assert.equal(await page.locator('.op-notifications').evaluate(element => getComputedStyle(element).position), 'static');
      assert.ok(await page.evaluate(() => document.querySelector('.notification-setup').getBoundingClientRect().top >= document.querySelector('.op-header').getBoundingClientRect().bottom));
    }
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
