import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

test('inventory CSV creates a real browser download with the reported filename and contents', { timeout: 45000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'fairway-inventory-download-'));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    cacheDir: path.join(profile, 'vite-cache'), server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__download-test', async (_req, res, next) => {
    try {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/__download-test', `<button id="export">Export</button><script type="module">
        import { downloadBlob } from '/src/admin/adminApi.js';
        import { inventoryViewCsv } from '/src/lib/inventoryExport.mjs';
        const csv = inventoryViewCsv({
          course: {customer_id:'C',course_id:'U'}, category:'Drinks', subcategory:'all', operator:'Test operator',
          products:[{name:'Water',category_name:'Drinks',state:'on_cart',quantity:4}], archivedProducts:[],
          inventory:{timezone:'America/Los_Angeles',customer_name:'Test Customer',course_name:'Test Course',
            inventory_revision:3, products:[], daily_sales:{local_date:'2026-10-23',total_units:2,products:[{name:'Water',units:2}]}},
          exportedAt:new Date('2026-10-24T01:00:00Z')
        });
        document.querySelector('#export').onclick = () => downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'inventory-C-U-view.csv');
        globalThis.ready = true;
      </script>`));
    } catch (error) { next(error); }
  });
  let chrome;
  let socket;
  let sequence = 0;
  const pending = new Map();
  const pause = () => new Promise(resolve => setTimeout(resolve, 50));
  async function until(read) {
    for (let i = 0; i < 300; i++) { const result = await read(); if (result) return result; await pause(); }
    throw new Error('Timed out waiting for browser download');
  }
  try {
    await server.listen();
    chrome = spawn(process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: 'ignore' });
    chrome.on('error', error => { for (const entry of pending.values()) entry.reject(error); });
    const port = await until(async () => {
      try { return Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
      catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
    });
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.error) entry.reject(new Error(JSON.stringify(data.error))); else entry.resolve(data.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/__download-test` });
    await until(async () => (await send('Runtime.evaluate', { expression: 'globalThis.ready === true' })).result.value);
    await send('Runtime.evaluate', { expression: 'document.querySelector("#export").click()' });
    await until(async () => (await readdir(profile)).includes('inventory-C-U-view.csv'));
    const csv = await readFile(path.join(profile, 'inventory-C-U-view.csv'), 'utf8');
    assert.ok(csv.includes('FILTERED VIEW - NOT THE COMPLETE INVENTORY'));
    assert.ok(csv.includes('"Water","Drinks","","On Cart","4"'));
    assert.ok(csv.includes('"Total units sold","2"'));
    assert.ok(csv.includes('Test operator'));
    assert.ok(csv.includes('10/23/2026 6:00 PM PDT'));
  } finally {
    socket?.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill(); await exited;
    }
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
