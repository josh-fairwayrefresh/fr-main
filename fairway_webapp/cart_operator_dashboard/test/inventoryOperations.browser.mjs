import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { createServer } from 'vite';

test('rendered inventory staff, sales retries, audit and shift close', { timeout: 60000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'fairway-inventory-test-'));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false, appType: 'custom', cacheDir: path.join(profile, 'vite-cache'),
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'exceljs'] },
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__inventory-test', async (_request, response, next) => {
    try {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__inventory-test', '<!doctype html><div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="/test/inventoryOperations.fixture.jsx"></script>'));
    } catch (error) { next(error); }
  });
  try {
    await server.listen();
    const { port } = server.httpServer.address();
    const { stdout } = await promisify(execFile)(process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--dump-dom', '--virtual-time-budget=15000',
      `http://127.0.0.1:${port}/__inventory-test`,
    ], { timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    const result = stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    assert.equal(result, 'PASS', result || stdout.slice(-2000));
  } finally {
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
