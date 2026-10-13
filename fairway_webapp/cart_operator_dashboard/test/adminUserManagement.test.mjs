import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const userManagementSource = await readFile(
  new URL('../src/admin/AdminUserManagement.jsx', import.meta.url),
  'utf8'
);

test('User Management loads the complete backend directory whenever the section opens', () => {
  assert.match(userManagementSource, /useEffect\(\(\) => \{ void loadUsers\(\); \}, \[user, apiBaseUrl\]\)/);
  assert.match(userManagementSource, /adminRequest\(user, apiBaseUrl, '\/api\/v1\/admin\/users'\)/);
  assert.match(userManagementSource, /!result\.complete \|\| result\.next_page_token/);
  assert.match(userManagementSource, /loadState === 'ready' && users\.map/);
  assert.doesNotMatch(userManagementSource, /Load more users/);
});

test('User Management presents each reconciliation state and access summary', () => {
  for (const status of [
    'PROVISIONED',
    'NOT PROVISIONED',
    'CONFIGURATION ERROR',
    'ORPHANED RECORD',
  ]) {
    assert.ok(userManagementSource.includes(status), `Missing presentation for ${status}`);
  }
  assert.match(userManagementSource, /authorizationSummary/);
  assert.match(userManagementSource, /All courses/);
  assert.match(userManagementSource, /Global Admin/);
});

test('User Management offers retry and does not present failed loads as an empty directory', () => {
  assert.match(userManagementSource, /loadState === 'error'/);
  assert.match(userManagementSource, /Retry loading users/);
  assert.match(userManagementSource, /loadState === 'ready' && users\.length === 0/);
  assert.match(userManagementSource, /Unable to retrieve the complete user directory/);
});

test('successful explicit access save refreshes the unified directory', () => {
  assert.match(userManagementSource, /method: 'PUT'/);
  assert.match(userManagementSource, /if \(await loadUsers\(\)\)/);
  assert.match(userManagementSource, /Authorization settings saved and directory refreshed/);
});
