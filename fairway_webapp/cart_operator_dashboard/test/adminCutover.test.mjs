import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeCourseCutover,
  preflightCourseCutover,
} from '../src/admin/adminApi.js';

test('Admin cutover tooling uses an authenticated read-only preflight and exact-target idempotent mutation', async () => {
  const originalFetch = globalThis.fetch;
  const token = 'synthetic-admin-token-must-not-be-displayed';
  const calls = [];
  const responses = [
    {
      customer_id: 'customer one',
      course_id: 'course/one',
      dry_run: true,
      already_initialized: false,
      migration_baseline: 'active',
      removes_legacy_schedule: true,
      service_state: { status: 'ready', active: true, generation: 0 },
    },
    {
      customer_id: 'customer one',
      course_id: 'course/one',
      dry_run: false,
      already_initialized: true,
      service_state: { status: 'ready', active: true, generation: 0 },
    },
  ];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const user = { getIdToken: async () => token };
    const preflight = await preflightCourseCutover(
      user, 'https://admin.sandbox.example', 'customer one', 'course/one'
    );
    assert.equal(preflight.dry_run, true);
    assert.equal(preflight.migration_baseline, 'active');
    assert.equal(calls[0].url, 'https://admin.sandbox.example/api/v1/admin/customers/customer%20one/courses/course%2Fone/service-cutover');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { dry_run: true });
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);

    const repeated = await executeCourseCutover(
      user, 'https://admin.sandbox.example', 'customer one', 'course/one'
    );
    assert.equal(repeated.already_initialized, true);
    assert.equal(calls[1].url, calls[0].url);
    assert.deepEqual(JSON.parse(calls[1].options.body), {});
    assert.equal(calls[1].options.headers.Authorization, `Bearer ${token}`);
    assert.equal(JSON.stringify([preflight, repeated]).includes(token), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Admin cutover tooling rejects a response for another Course', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    customer_id: 'other-customer',
    course_id: 'other-course',
    dry_run: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    await assert.rejects(
      preflightCourseCutover(
        { getIdToken: async () => 'synthetic-secret' },
        'https://admin.sandbox.example',
        'customer',
        'course'
      ),
      /did not match the explicitly selected Course/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Admin cutover tooling rejects a malformed preflight state', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    customer_id: 'customer',
    course_id: 'course',
    dry_run: true,
    already_initialized: false,
    migration_baseline: 'active',
    removes_legacy_schedule: true,
    service_state: { status: 'ready', active: true, generation: -1 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    await assert.rejects(
      preflightCourseCutover(
        { getIdToken: async () => 'synthetic-secret' },
        'https://admin.sandbox.example',
        'customer',
        'course'
      ),
      /valid authoritative service state/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
