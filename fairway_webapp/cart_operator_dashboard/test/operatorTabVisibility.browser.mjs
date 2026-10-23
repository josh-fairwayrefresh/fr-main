import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { createServer } from 'vite';

const categoryOwner = fileURLToPath(new URL('../../../fairway_backend/cloudrun_receiver/lib/service_categories.json', import.meta.url));
const categories = JSON.parse(await readFile(categoryOwner, 'utf8'));

for (const displayName of [categories.ON_PREMISE.display_name, 'Practice Area Review']) {
test(`rendered queue and category surfaces use the shared owner: ${displayName}`, { timeout: 60000 }, async () => {
  const candidates = process.env.BROWSER_BIN
    ? [process.env.BROWSER_BIN]
    : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  let browser;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      browser = candidate;
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  assert.ok(browser, 'Chrome/Chromium is required; set BROWSER_BIN to its executable');
  const profile = await mkdtemp(path.join(tmpdir(), 'fairway-tab-test-'));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    plugins: [{
      name: 'review-category-owner',
      enforce: 'pre',
      load(id) {
        if (id !== categoryOwner) return null;
        return JSON.stringify({
          ...categories,
          ON_PREMISE: { ...categories.ON_PREMISE, display_name: displayName },
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__tab-test', async (_request, response, next) => {
    try {
      const html = await server.transformIndexHtml('/__tab-test', '<!doctype html><div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="/test/operatorTabVisibility.fixture.jsx"></script>');
      response.setHeader('Content-Type', 'text/html');
      response.end(html);
    } catch (error) {
      next(error);
    }
  });
  try {
    await server.listen();
    const { port } = server.httpServer.address();
    const { stdout } = await promisify(execFile)(browser, [
      '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--dump-dom', '--virtual-time-budget=10000',
      `http://127.0.0.1:${port}/__tab-test?category=${encodeURIComponent(displayName)}`,
    ], { timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    assert.match(stdout, /<pre id="result">PASS<\/pre>/, stdout);
  } finally {
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
}
