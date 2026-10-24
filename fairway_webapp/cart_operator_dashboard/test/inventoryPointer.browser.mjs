import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { chromeSession, pause, until } from './browserHarness.mjs';

test('trusted mouse and touch dragging returns stock, resumes staff selection, scrolls and confirms loading', { timeout: 120000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'fairway-inventory-pointer-'));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    cacheDir: path.join(profile, 'vite-cache'), optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__pointer-test', async (_req, res, next) => {
    try {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/__pointer-test', '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/inventoryPointer.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  let browser;
  try {
    await server.listen();
    browser = await chromeSession(profile);
    const { send, evaluate } = browser;
    const url = `http://127.0.0.1:${server.httpServer.address().port}/__pointer-test`;
    const state = () => evaluate('JSON.parse(localStorage.getItem("pointer-data"))');
    const writes = async () => (await state())?.writes || [];
    const bounds = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const button = text => `[aria-label="${text}"]`;
    async function navigate(method, params = {}) {
      const prior = await evaluate('globalThis.pointerFixtureId');
      await send(method, params);
      await until(async () => {
        try {
          return await evaluate(`globalThis.pointerFixtureId && globalThis.pointerFixtureId !== ${JSON.stringify(prior) || 'null'} && Boolean(document.querySelector("[aria-label='Move Pointer Water']"))`);
        } catch (error) {
          if (error.code === -32000 && /navigated|Execution context was destroyed|Cannot find context/.test(error.message)) return false;
          throw error;
        }
      }, 'new inventory document');
    }
    async function key(key, code, virtual) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtual });
      if (key === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', unmodifiedText: '\r', key, code, windowsVirtualKeyCode: virtual });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtual });
    }
    async function click(selector) {
      await until(() => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e && !e.disabled;})()`), `enabled ${selector}`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
      const p = await bounds(selector);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
    }
    await navigate('Page.navigate', { url });
    for (const width of [1440, 1024, 768, 430, 375]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1024, deviceScaleFactor: 1, mobile: false });
      await pause(50);
      const layout = await evaluate(`(()=>{
        const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const actions=document.querySelector('.inv-catalog-actions');
        const panel=document.querySelector('.inv-daily-sales');
        const admin=document.querySelector('[aria-label="Open Admin"]');
        return {
          title:box(document.querySelector('.inv-title')),panel:box(panel),
          actionBoxes:[...actions.querySelectorAll('button,a')].map(box),
          actionNames:[...actions.querySelectorAll('button,a')].map(e=>e.textContent),
          publicLink:(()=>{const a=document.querySelector('.inv-audit-action a'),audit=document.querySelector('.inventory-session-actions .inv-secondary');return {href:a?.getAttribute('href'),target:a?.target,text:a?.textContent,font:getComputedStyle(a).fontFamily===getComputedStyle(audit).fontFamily&&getComputedStyle(a).fontSize===getComputedStyle(audit).fontSize};})(),
          compactTotal:panel.querySelector('.inv-sales-total').textContent,
          detailedTally:Boolean(panel.querySelector('ul')),
          aboveFilters:actions.nextElementSibling.classList.contains('inv-filter-row'),
          auditInPanel:Boolean(panel.querySelector('.inventory-session-actions .inv-secondary')),
          auditBelowClose:(()=>{const buttons=panel.querySelectorAll('.inventory-session-actions > button');return buttons[0].getBoundingClientRect().bottom<=buttons[1].getBoundingClientRect().top;})(),
          exportInBanner:[...document.querySelectorAll('.inv-header button')].some(e=>e.textContent==='Export'),
          exportHelp:Boolean(document.querySelector('#inv-export-help')),
          adminIcon:Boolean(admin?.querySelector('svg')) && !admin.textContent,
          logo:box(document.querySelector('.inv-brand img')),
          operatorInPanel:Boolean(panel.querySelector('.inventory-session')),
          headerActions:[...document.querySelectorAll('.inv-header button,.inv-header .inv-cart-link,.inv-course-picker select')].map(box),
          targets:[...document.querySelectorAll('.inv-catalog-actions button,.inv-audit-action .inv-secondary,.inv-category-filters button,.inv-header button,.inv-course-picker select,.inventory-session button')].map(box),
          overflow:document.documentElement.scrollWidth>innerWidth
        };
      })()`);
      assert.equal(layout.overflow, false, `${width}px: no document overflow`);
      assert.equal(layout.aboveFilters, true);
      assert.equal(layout.auditInPanel, true);
      assert.equal(layout.auditBelowClose, true);
      assert.equal(layout.exportInBanner, true);
      assert.equal(layout.exportHelp, false);
      assert.equal(layout.adminIcon, true);
      assert.equal(layout.operatorInPanel, true);
      assert.deepEqual(layout.actionNames, ['Add Category', '+ Add Product']);
      assert.deepEqual(layout.publicLink, { href: '/cartmenus/pointer-course', target: '_blank', text: 'Golfer-View Menu', font: true });
      assert.equal(layout.compactTotal, 'Sales Today0 units sold');
      assert.equal(layout.detailedTally, false);
      assert.equal(layout.logo.width, width <= 380 ? 90 : width <= 680 ? 108 : 156, 'Logo is 150% of its previous displayed width');
      assert.equal(layout.logo.height, width <= 680 ? 72 : 96);
      for (const box of layout.targets) {
        assert.ok(box.height >= 44 && box.width >= 44, `${width}px: controls retain finger-sized targets`);
        assert.ok(box.x >= 0 && box.right <= width, `${width}px: controls not clipped`);
      }
      if (width >= 768) {
        assert.ok(layout.headerActions.every(b=>Math.abs(b.y - layout.headerActions[0].y) < 1), `${width}px: banner actions have no orphaned sign-out row: ${JSON.stringify(layout.headerActions)}`);
        assert.ok(layout.panel.x >= layout.title.right, `${width}px: Sales Today beside title`);
        assert.ok(layout.panel.y < layout.title.bottom && layout.title.y < layout.panel.bottom);
        assert.ok(layout.actionBoxes.every(b=>b.y === layout.actionBoxes[0].y), `${width}px: catalog actions share one row`);
      } else {
        assert.ok(layout.panel.y >= layout.title.bottom, `${width}px: title and sales wrap cleanly`);
      }
    }
    await click('[aria-label="Open Admin"]');
    assert.equal(await evaluate('globalThis.openedAdmin'), true, 'Accessible shield still opens Admin');
    for (const [pointerType, width] of [['mouse', 1024], ['touch', 768], ['touch', 375]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: pointerType === 'touch' });
      await send('Emulation.setTouchEmulationEnabled', { enabled: pointerType === 'touch', maxTouchPoints: 5 });
      await navigate('Page.navigate', { url });
      await evaluate('localStorage.clear();sessionStorage.clear()');
      await navigate('Page.reload');
      async function down(p) {
        if (pointerType === 'touch') await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1, radiusX: 5, radiusY: 5 }] });
        else await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
      }
      async function move(p) {
        if (pointerType === 'touch') await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 1, radiusX: 5, radiusY: 5 }] });
        else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, button: 'left', buttons: 1 });
      }
      async function up(p) {
        if (pointerType === 'touch') await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
      }
      async function drag(targetState, source = button('Move Pointer Water'), horizontal = false) {
        const beforeWrites = (await writes()).length;
        await evaluate(`document.querySelector(${JSON.stringify(source)}).scrollIntoView({block:'center'})`);
        await pause(50);
        const start = await bounds(source);
        await down(start);
        await move({ x: start.x + 15, y: start.y + 4 });
        const targetSelector = `[data-inventory-drop="${targetState}"] > header`;
        let target = horizontal ? { x: (await bounds(targetSelector)).x, y: start.y } : await bounds(targetSelector);
        if (target.y > 850 || target.y < 40) {
          const edge = { x: start.x, y: target.y > 850 ? 890 : 10 };
          await move(edge);
          await until(async () => { target = await bounds(targetSelector); return target.y > 80 && target.y < 820; }, 'drag edge scrolling');
        }
        await move(target);
        await until(async () => {
          if (await evaluate(`document.querySelector('[data-inventory-drop="${targetState}"]').classList.contains('drag-over')`)) return true;
          target = horizontal ? { x: (await bounds(targetSelector)).x, y: start.y } : await bounds(targetSelector);
          await move(target);
          return false;
        }, `${pointerType} first-gesture ${targetState} drop target`);
        assert.equal((await writes()).length, beforeWrites, 'Dragging alone never writes');
        await up(target);
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        await drag('sold_out', button('Move Pointer Water'), width > 680);
        await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Confirm remaining sale"'), 'first-attempt remaining sale confirmation');
        assert.ok(await evaluate('document.querySelector(".inv-dialog").textContent.includes("Confirm that you sold the remaining 5 units of Pointer Water.")'));
        assert.equal((await writes()).length, 0);
        assert.equal((await state())?.shift || null, null, 'No shift activity before Confirm');
        await click('.inv-dialog footer button[type="button"]');
        await until(() => evaluate('!document.querySelector("#inv-stock-title")'), 'cancel closes confirmation');
        assert.equal((await writes()).length, 0, 'Cancel preserves stock and sales');
      }
      await drag('in_inventory');
      await until(() => evaluate('Boolean(document.querySelector("#inventory-session-title"))'), 'staff prompt after drop');
      assert.equal((await writes()).length, 0);
      await evaluate(`(()=>{const select=document.querySelector('.inventory-session-overlay select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'operator');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await pause(50);
      await click('.inventory-session-overlay button[type="submit"]');
      await until(async () => {
        const error = await evaluate('document.querySelector("[role=alert]")?.textContent');
        if (error) throw new Error(error);
        return (await writes()).length === 1;
      }, 'resumed return');
      let data = await state();
      assert.equal(data.products[0].quantity, 5);
      assert.equal(data.products[0].state, 'in_inventory');
      assert.equal(await evaluate('Boolean(document.querySelector(".inv-notice"))'), false, 'Routine success creates no commentary box');
      assert.ok(await evaluate('document.querySelector(".inv-daily-sales .inventory-session").textContent.includes("Pointer Operator")'), 'Selected operator stays clear in Sales Today');
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".inv-daily-sales .inventory-close-out > span")].map(e=>e.textContent)'), ['Close out', 'Enter final sales'], 'Prominent stacked close-out stays inside panel');
      assert.equal(data.writes[0].quantity, undefined);
      assert.equal(data.writes[0].shift_id, 'pointer-shift');
      await navigate('Page.reload');
      await until(() => evaluate('document.querySelector("[aria-label=\'Pointer Water state\']")?.value==="in_inventory"'), 'persistent restaurant state');
      await drag('on_cart');
      await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Load onto cart"'), 'load confirmation');
      assert.equal((await writes()).length, 1);
      await click('.inv-dialog footer button[type="submit"]');
      await until(async () => (await writes()).length === 2, 'confirmed loading');
      await until(() => evaluate('!document.querySelector("#inv-stock-title")'), 'loading dialog closed');
      data = await state();
      assert.equal(data.products[0].quantity, 5);
      assert.equal(data.products[0].state, 'on_cart');
      const evidence = await evaluate('globalThis.pointerEvidence');
      assert.ok(evidence.some(e => e.trusted && e.pointerType === pointerType && e.type === 'pointerdown'), `${pointerType} input must be browser-trusted`);
      assert.ok(evidence.every(e => e.trusted), 'No synthetic pointer events');
      // A child action remains a click, not a move.
      await click(button('Edit quantity for Pointer Water'));
      await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Adjust quantity"'), 'interactive tile child');
      assert.equal((await writes()).length, 2);
      await click('.inv-dialog footer button[type="button"]');
      await evaluate('document.querySelector("[aria-label=\'Move Pointer Water\']").scrollIntoView({block:"center"})');
      const cancelStart = await bounds(button('Move Pointer Water'));
      await down(cancelStart); await move({ x: cancelStart.x + 20, y: cancelStart.y });
      await key('Escape', 'Escape', 27);
      assert.equal(await evaluate('Boolean(document.querySelector(".inv-drag-preview"))'), false, 'Escape clears active gesture');
      await up(cancelStart);
      assert.equal(await evaluate('Boolean(document.querySelector(".inv-move-here"))'), false, 'Release after cancellation must not pick the handle again');
      assert.equal((await writes()).length, 2, 'Cancelled drag must not mutate');
      await down(cancelStart); await move({ x: 2, y: 200 }); await up({ x: 2, y: 200 });
      assert.equal((await writes()).length, 2, 'Dropping outside columns must not mutate');
      if (pointerType === 'touch') {
        await down(cancelStart); await move({ x: cancelStart.x + 20, y: cancelStart.y });
        await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        assert.equal(await evaluate('Boolean(document.querySelector(".inv-drag-preview"))'), false, 'Browser pointer cancellation clears gesture');
        const detail = '[aria-label="Pointer Water state"]';
        await evaluate(`document.querySelector(${JSON.stringify(detail)}).closest('article').scrollIntoView({block:'center'})`);
        const position = await bounds(detail);
        const beforeScroll = await evaluate('window.scrollY');
        const direction = beforeScroll > 100 ? 1 : -1;
        // A noninteractive card edge keeps ordinary touch scrolling, rather than initiating a drag.
        const x = await evaluate(`document.querySelector(${JSON.stringify(detail)}).closest('article').getBoundingClientRect().right - 3`);
        await down({ x, y: position.y });
        for (let delta = 20; delta <= 100; delta += 20) { await move({ x, y: position.y + direction * delta }); await pause(20); }
        await up({ x, y: position.y + direction * 100 });
        await pause(100);
        assert.ok(Math.abs(await evaluate('window.scrollY') - beforeScroll) > 10, 'Touch scrolling works outside grip');
        assert.equal((await writes()).length, 2, 'Touch scrolling does not move stock');
      }
      if (pointerType === 'mouse') {
        await evaluate(`(()=>{const e=document.querySelector('[aria-label="Move Pointer Water"]').closest('article').querySelector('.inv-product-price');const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);})()`);
        await drag('sold_out', '.inv-product-tile:has([aria-label="Move Pointer Water"]) .inv-product-price');
        // Selected noninteractive text must not invoke competing native HTML dragging.
        await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Confirm remaining sale"'), 'non-grip mouse drop after text selection');
        await click('.inv-dialog footer button[type="button"]');
      }
      await pause(550);
      await evaluate('document.querySelector("[aria-label=\'Move Pointer Water\']").focus()');
      await key('Enter', 'Enter', 13);
      await until(() => evaluate('Boolean(document.querySelector(".inv-move-here"))'), 'keyboard picks product');
      await evaluate(`document.querySelector('[data-inventory-drop="sold_out"] .inv-move-here').focus()`);
      await key('Enter', 'Enter', 13);
      await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Confirm remaining sale"'), 'keyboard Sold Out uses same confirmation');
      await click('.inv-dialog footer button[type="button"]');
      const selectState = value => evaluate(`(()=>{const select=document.querySelector('[aria-label="Pointer Water state"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(value)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await selectState('sold_out');
      await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Confirm remaining sale"'), 'selector uses same confirmation');
      // Another session changes the confirmed count; the old 5-unit confirmation must never submit a new amount.
      await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('pointer-data'));data.products[0].quantity=7;data.products[0].stock_revision++;data.revision++;localStorage.setItem('pointer-data',JSON.stringify(data));})()`);
      await click('.inv-dialog footer button[type="submit"]');
      await until(() => evaluate('Boolean(document.querySelector(".inv-dialog [role=alert]"))'), 'stale confirmation rejected');
      assert.equal((await writes()).length, 2);
      assert.equal(await evaluate('document.querySelector(".inv-dialog button[type=submit]").disabled'), true);
      await click('.inv-dialog > form > button');
      await until(() => evaluate('document.querySelector(".inv-dialog").textContent.includes("remaining 7 units")'), 'explicit refreshed confirmation');
      assert.equal((await writes()).length, 2, 'Refresh does not sell');
      await evaluate('globalThis.loseRemainingResponse=true');
      await click('.inv-dialog footer button[type="submit"]');
      await until(() => evaluate('document.querySelector(".inv-dialog [role=alert]")?.textContent.includes("not confirmed")'), 'lost response retains intended sale');
      assert.equal((await writes()).length, 3);
      await click('.inv-dialog footer button[type="submit"]');
      await until(() => evaluate('!document.querySelector("#inv-stock-title")'), 'retry confirms exactly one remaining sale');
      data = await state();
      assert.equal(data.products[0].quantity, 0);
      assert.equal(data.products[0].state, 'sold_out');
      assert.equal(data.sales, 7);
      assert.equal(data.writes.length, 3);
      assert.equal(data.writes[2].kind, 'sale');
      assert.equal(data.writes[2].units, 7);
      assert.equal(data.writes[2].expected_stock_revision, 3);
      assert.ok(await evaluate('document.querySelector(".inv-daily-sales").textContent.includes("7 units sold")'));
      await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('pointer-data'));data.products[0].state='on_cart';data.products[0].stock_revision++;data.revision++;localStorage.setItem('pointer-data',JSON.stringify(data));window.dispatchEvent(new Event('inventory-updated'));})()`);
      await until(() => evaluate('document.querySelector("[aria-label=\'Pointer Water state\']")?.value==="on_cart"'), 'legacy zero On Cart view');
      await selectState('sold_out');
      await until(async () => (await writes()).length === 4, 'zero-stock availability change');
      assert.equal(await evaluate('Boolean(document.querySelector("#inv-stock-title"))'), false, 'Zero stock needs no sale confirmation');
      assert.equal((await writes())[3].kind, 'availability');
      assert.equal((await state()).sales, 7, 'No zero-unit sale');
      await drag('on_cart');
      await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Load onto cart"'));
      await click('.inv-dialog footer button[type="submit"]');
      await until(async () => (await writes()).length === 5);
      await until(() => evaluate('!document.querySelector("#inv-stock-title")'));
      await drag('in_inventory');
      await until(async () => (await writes()).length === 6);
      await until(() => evaluate('!document.querySelector("[aria-label=\'Pointer Water state\']").disabled'));
      await drag('sold_out');
      await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Confirm remaining sale"'), 'restaurant drag opens same confirmation on first attempt');
      assert.ok(await evaluate('document.querySelector(".inv-dialog").textContent.includes("remaining 1 units")'));
      await click('.inv-dialog footer button[type="button"]');
      assert.equal((await writes()).length, 6, 'Restaurant Cancel changes nothing');
      await pause(550);
      await evaluate('document.querySelector("[aria-label=\'Move Pointer Water\']").focus()');
      await key('Enter', 'Enter', 13);
      await until(() => evaluate('Boolean(document.querySelector(".inv-move-here"))'));
      await evaluate('document.querySelector(\'[data-inventory-drop="sold_out"] .inv-move-here\').focus()');
      await key('Enter', 'Enter', 13);
      await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Confirm remaining sale"'), 'restaurant keyboard confirmation');
      await click('.inv-dialog footer button[type="button"]');
      await selectState('sold_out');
      await until(() => evaluate('document.querySelector("#inv-stock-title")?.textContent==="Confirm remaining sale"'), 'restaurant selector confirmation');
      await evaluate('globalThis.loseRemainingResponse=true');
      await click('.inv-dialog footer button[type="submit"]');
      await until(() => evaluate('document.querySelector(".inv-dialog [role=alert]")?.textContent.includes("not confirmed")'));
      await click('.inv-dialog footer button[type="submit"]');
      await until(() => evaluate('!document.querySelector("#inv-stock-title")'));
      data = await state();
      assert.equal(data.writes.length, 7);
      assert.equal(data.sales, 8);
      assert.equal(data.products[0].quantity, 0);
      assert.equal(data.products[0].state, 'sold_out');
      assert.equal(data.writes[6].state, 'sold_out');
      assert.equal(data.writes[6].kind, 'sale');
      await click('.inventory-session-actions .inv-secondary');
      await until(() => evaluate('Boolean(document.querySelector("#inv-audit-title"))'));
      assert.ok(await evaluate('document.querySelector(".inv-dialog").textContent.includes("Record your cart inventory at the start and end of a shift.")'));
      assert.equal(await evaluate('document.querySelector(".inv-dialog").textContent.includes("Pointer Water")'), false, 'Sold Out is absent from audit backcheck');
      await evaluate(`(()=>{const s=document.querySelector('.inv-dialog select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'operator');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await click('.inv-dialog input[type="checkbox"]');
      await click('.inv-dialog footer button[type="submit"]');
      await until(() => evaluate('!document.querySelector("#inv-audit-title")'));
      assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'), false, 'Audit completion leaves no follow-on prompt');
      assert.equal((await state()).audits[0].length, 5);
      await click('.inventory-close-out');
      await evaluate(`(()=>{const input=document.querySelector('.inventory-session-overlay input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.00');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click('.inventory-session-overlay button[type="submit"]');
      await until(() => evaluate('!document.querySelector("[role=dialog]")'));
      await pause(150);
      assert.ok(await evaluate('document.querySelector(".inventory-session").textContent.includes("Not selected")'));
      assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'), false, 'Successful close remains idle');
      await click(button('Edit quantity for Pointer Water'));
      await click('.inv-dialog footer button[type="submit"]');
      await until(() => evaluate('document.querySelector("#inventory-session-title")?.textContent==="Select operator"'), 'Only next attributed action prompts for a name');
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'No horizontal overflow');
    }
  } finally {
    await browser?.close();
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
