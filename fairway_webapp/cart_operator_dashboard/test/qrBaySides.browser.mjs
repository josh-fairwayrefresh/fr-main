import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';

test('deployed sandbox shows independent A/B requests, deep links and terminal outcomes', { timeout: 120000 }, async () => {
  const fixture = JSON.parse(await readFile(process.env.FAIRWAY_QR_FIXTURE, 'utf8'));
  assert.equal(fixture.projectId, 'fairway-refresh-sandbox-qr1');
  const origin = `https://${fixture.projectId}.web.app`;
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 375, height: 1000 }, hasTouch: true });
  try {
    const operator = await context.newPage();
    operator.on('dialog', (dialog) => dialog.accept());
    await operator.goto(`${origin}/?customer_id=${fixture.customer_id}&course_id=${fixture.range_course_id}`);
    await operator.getByLabel('Select course').waitFor();
    await operator.locator('.op-priority, .op-empty').first().waitFor();
    const pendingTestSides = await operator.getByRole('button', { name: /^Select request Bay 26[AB]$/ }).count() +
      await operator.locator('.op-priority').getByRole('heading', { name: /^Bay 26[AB]$/ }).count();
    const initialCount = Number(await operator.locator('.op-queue-total b').innerText()) - pendingTestSides;
    const bays = fixture.bays.filter((bay) => bay.bay_number === 26);
    const pages = [];
    for (const bay of bays) {
      const page = await context.newPage();
      pages.push(page);
      await page.goto(`${origin}/range/${bay.id}`);
      await page.getByRole('heading', { name: `Bay 26${bay.bay_side}`, exact: true }).waitFor();
      assert.equal(await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
      await page.getByRole('button', { name: 'No', exact: true }).tap();
      await page.getByText('No request was sent.', { exact: true }).waitFor();
      await page.reload();
      await page.getByRole('button', { name: 'Yes', exact: true }).tap();
      await page.getByText('Your request has been received.', { exact: true }).waitFor();
    }
    for (let index = 0; index < bays.length; index++) {
      const statuses = await pages[index].evaluate(async ({ bayId }) => Promise.all(
        Array.from({ length: 4 }, async () => {
          const response = await fetch(`https://fairway-button-receiver-sandbox-125189268671.us-central1.run.app/api/v1/public/bays/${bayId}/requests`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation_id: crypto.randomUUID() }),
          });
          return response.status;
        })), { bayId: bays[index].id });
      assert.deepEqual(statuses, [200, 200, 200, 200]);
    }
    const twoAdded = String(initialCount + 2);
    await operator.locator('.op-queue-total b').filter({ hasText: new RegExp(`^${twoAdded}$`) }).waitFor();
    for (const [side, action] of [['A', 'Complete service'], ['B', 'Cancel request']]) {
      const heading = operator.locator('.op-priority').getByRole('heading', { name: `Bay 26${side}`, exact: true });
      if (!(await heading.count())) {
        await operator.getByRole('button', { name: `Select request Bay 26${side}`, exact: true }).tap();
      }
      await heading.waitFor();
      const requestId = (await operator.locator('.op-priority').getAttribute('id')).replace('request-', '');
      await operator.goto(`${origin}/requests/${requestId}?customer_id=${fixture.customer_id}&course_id=${fixture.range_course_id}`);
      await operator.locator('.op-priority').getByRole('heading', { name: `Bay 26${side}`, exact: true }).waitFor();
      await operator.getByRole('button', { name: action, exact: true }).tap();
      await operator.locator('.op-priority').getByRole('heading', { name: `Bay 26${side}`, exact: true }).waitFor({ state: 'detached' });
    }
    await operator.locator('.op-queue-total b').filter({ hasText: new RegExp(`^${initialCount}$`) }).waitFor();
    await operator.getByRole('button', { name: 'History', exact: true }).tap();
    for (const side of ['A', 'B']) {
      await operator.locator('.op-history-row').filter({ hasText: `Bay 26${side}` }).first().waitFor();
    }
    assert.equal(await operator.locator('.op-metrics').count(), 0);
    assert.equal(await operator.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log('Both sides created one request despite repeats; A Complete/B Cancel, exact-side deep links and History passed; original queue count restored.');
  } finally {
    await context.close();
    await browser.close();
  }
});
