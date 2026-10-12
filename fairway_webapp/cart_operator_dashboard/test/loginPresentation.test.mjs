import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const loginSource = mainSource.slice(
  mainSource.indexOf('function LoginScreen'),
  mainSource.indexOf('function EntryStatus')
);

test('logged-out entry uses the responsive application surface and preserves sign-in paths', () => {
  assert.match(loginSource, /className="auth-page"/);
  assert.match(loginSource, /logo-and-name-row-banner\.jpg/);
  assert.doesNotMatch(loginSource, /phone-shell|login-shell/);
  assert.match(loginSource, /onSubmit=\{handleEmailSubmit\}/);
  assert.match(loginSource, /onClick=\{onGoogleSignIn\}/);
  assert.match(styles, /\.auth-layout/);
  assert.match(styles, /@media \(max-width: 850px\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});

test('standard Cart login is the single customer-facing sign-in experience (no separate Inventory login)', () => {
  assert.doesNotMatch(loginSource, /isInventoryEntry/);
  assert.doesNotMatch(loginSource, /Inventory staff|Inventory Staff Login|Set or reset password/);
  assert.doesNotMatch(mainSource, /sendPasswordResetEmail/);
  assert.match(loginSource, /isAdminEntry \? 'Administration access' : 'Cart access'/);
  assert.match(loginSource, /isAdminEntry\s*\n?\s*\?\s*<a className="mode-entry-link" href="\/">Cart Login<\/a>\s*\n?\s*:\s*<a className="mode-entry-link" href="\/admin">Admin Login<\/a>/);
  assert.match(loginSource, /CUSTOMER COURSE ACCESS/);
  assert.match(loginSource, /Authorized Fairway Refresh personnel only/);
  assert.doesNotMatch(loginSource, /href="\/inventory">Inventory Staff Login/);
});