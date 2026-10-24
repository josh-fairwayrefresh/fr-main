import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function until(read, message = 'browser condition') {
  for (let i = 0; i < 200; i++) {
    const result = await read();
    if (result) return result;
    await pause(50);
  }
  throw new Error(`Timed out waiting for ${message}`);
}

export async function chromeSession(profile) {
  const chrome = spawn(process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  try {
    const port = await until(async () => {
      try { return Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
      catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
    }, 'Chrome debugging port');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const pending = new Map();
    let sequence = 0;
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data), entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.error) entry.reject(Object.assign(new Error(data.error.message), { code: data.error.code })); else entry.resolve(data.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    return {
      send,
      evaluate: async expression => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      },
      close: async () => { socket.close(); if (chrome.exitCode === null) { chrome.kill(); await exited; } },
    };
  } catch (error) {
    if (chrome.exitCode === null) { chrome.kill(); await exited; }
    throw error;
  }
}
