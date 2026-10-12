import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryRequest, publicMenuRequest } from '../src/lib/inventoryApi.mjs';

test('inventory requests send Firebase identity and JSON mutation bodies', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ product_id: 'p1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await inventoryRequest({ getIdToken: async () => 'firebase-token' }, 'https://admin.test', '/api/v1/inventory/courses/CUST-1/COURSE-1/products', {
      method: 'POST',
      body: { name: 'Lager' },
    });
    assert.equal(result.product_id, 'p1');
    assert.equal(request.url, 'https://admin.test/api/v1/inventory/courses/CUST-1/COURSE-1/products');
    assert.equal(request.options.headers.Authorization, 'Bearer firebase-token');
    assert.deepEqual(JSON.parse(request.options.body), { name: 'Lager' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public menu requests are unauthenticated and encode the configured API slug', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ version: 3 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await publicMenuRequest('https://admin.test', 'monarch bay');
    assert.equal(result.version, 3);
    assert.equal(request.url, 'https://admin.test/api/v1/public/menus/monarch%20bay');
    assert.equal(request.options.headers.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API errors retain status and structured details for UI retry states', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'denied', message: 'Course access required' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(
      inventoryRequest({ getIdToken: async () => 'firebase-token' }, 'https://admin.test', '/api/v1/inventory/bootstrap'),
      (error) => error.status === 403 && error.message === 'Course access required' && error.details.error === 'denied',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});