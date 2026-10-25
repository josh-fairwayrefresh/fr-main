import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';

test('isolated deployed QR golfer and shared Course operator flows', { timeout: 180000 }, async () => {
  assert.ok(process.env.FAIRWAY_QR_FIXTURE, 'FAIRWAY_QR_FIXTURE must identify private synthetic fixture credentials');
  const fixture = JSON.parse(await readFile(process.env.FAIRWAY_QR_FIXTURE, 'utf8'));
  assert.equal(fixture.projectId, 'fairway-refresh-sandbox-qr1', 'This acceptance runner must not target other projects');
  const origin = `https://${fixture.projectId}.web.app`;
  const profile = await mkdtemp(path.join(tmpdir(), 'fairway-qr-browser-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, viewport: { width: 375, height: 900 }, hasTouch: true,
  });
  const page = await context.newPage();
  const publicPage = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${origin}/?customer_id=${fixture.customer_id}&course_id=${fixture.range_course_id}`);
    await page.getByLabel('Email', { exact: true }).fill(fixture.email);
    await page.getByLabel('Password', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Select course').waitFor();
    await page.getByRole('heading', { name: 'No active requests' }).waitFor();
    assert.equal(await page.getByLabel('Select course').inputValue(), `${fixture.customer_id}/${fixture.range_course_id}`);
    assert.equal(await page.locator('.op-inventory').count(), 0);
    assert.equal(await page.locator('.op-performance').count(), 0);
    for (const width of [375, 430, 768, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `operator overflow at ${width}`);
    }
    await page.getByLabel('Select course').selectOption(`${fixture.customer_id}/${fixture.cart_course_id}`);
    await page.locator('.op-inventory').waitFor();
    assert.equal(await page.locator('.op-performance').count(), 1);
    await page.getByLabel('Select course').selectOption(`${fixture.customer_id}/${fixture.range_course_id}`);
    await publicPage.goto(`${origin}/range/${fixture.bays[2].id}`);
    await publicPage.getByRole('heading', { name: 'Bay 3', exact: true }).waitFor();
    await publicPage.getByRole('button', { name: 'No', exact: true }).tap();
    await publicPage.getByText('No request was sent.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'No active requests' }).count(), 1);
    await publicPage.reload();
    for (const width of [375, 430, 768]) {
      await publicPage.setViewportSize({ width, height: 900 });
      assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `golfer overflow at ${width}`);
      const yes = await publicPage.getByRole('button', { name: 'Yes', exact: true }).boundingBox();
      assert.ok(yes.width >= 44 && yes.height >= 44);
    }
    await publicPage.getByRole('button', { name: 'Yes', exact: true }).tap();
    await publicPage.getByText('Your request has been received.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Bay 3', exact: true }).waitFor();
    const requestId = (await page.locator('.op-priority').getAttribute('id')).replace('request-', '');
    await page.goto(`${origin}/requests/${requestId}?customer_id=${fixture.customer_id}&course_id=${fixture.range_course_id}`);
    await page.getByRole('heading', { name: 'Bay 3', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Complete service', exact: true }).click();
    await page.getByRole('heading', { name: 'No active requests' }).waitFor();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByRole('heading', { name: 'Request outcomes' }).waitFor();
    assert.equal(await page.locator('.op-metrics').count(), 0);
    await page.locator('.op-history-row').filter({ hasText: 'Bay 3' }).first().waitFor();
    await page.getByRole('button', { name: 'Requests', exact: true }).click();
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Suspend Service for TEST Driving Range', exact: true }).click();
    await page.getByText('Service OFF', { exact: true }).waitFor();
    await publicPage.reload();
    await publicPage.getByText('Server requests are currently unavailable.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Resume Service for TEST Driving Range', exact: true }).click();
    await page.getByText('Service ON', { exact: true }).waitFor();
    await publicPage.reload();
    await publicPage.getByRole('button', { name: 'Yes', exact: true }).tap();
    await page.getByRole('heading', { name: 'Bay 3', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cancel request', exact: true }).tap();
    await page.getByRole('heading', { name: 'No active requests' }).waitFor();
    let lost = false;
    await publicPage.route('**/api/v1/public/bays/*/requests', async (route) => {
      if (!lost) {
        lost = true;
        await route.fetch();
        await route.abort('connectionreset');
      } else await route.continue();
    });
    await publicPage.reload();
    await publicPage.getByRole('button', { name: 'Yes', exact: true }).tap();
    await publicPage.getByRole('button', { name: 'Retry request', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Bay 3', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Complete service', exact: true }).click();
    await page.getByRole('heading', { name: 'No active requests' }).waitFor();
    await publicPage.reload();
    await publicPage.getByRole('button', { name: 'Retry request', exact: true }).tap();
    await publicPage.getByText('Your request has been received.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'No active requests' }).count(), 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ deployedUI: true, golferYesNo: true, completeCancel: true,
      courseSwitch: true, deepLink: true, rangeHistoryNoMetrics: true, suspendResume: true,
      widths: [375, 430, 768, 1024], noOverflow: true, realTouchInput: true,
      lostResponseReloadAndRetryAfterCompletion: true }));
    const push = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { available: false };
      return { available: true, permission: Notification.permission, installed: matchMedia('(display-mode: standalone)').matches };
    });
    console.log('Browser notification capability: '+JSON.stringify(push));
  } catch (error) {
    console.error('Rendered state at failure:', await page.locator('main').innerText());
    console.error('Browser runtime errors:', errors);
    throw error;
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
