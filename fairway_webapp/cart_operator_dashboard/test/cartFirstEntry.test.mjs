import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('a sign-in completed on /inventory redirects to Cart Operations using the shared session, not a new login', () => {
  // The fresh-sign-in marker is set before both sign-in actions so the
  // auth-state handler can distinguish "a sign-in just completed here" from
  // "an already authenticated session is continuing a direct or Cart-banner
  // Inventory visit" (which must keep landing directly on Inventory).
  assert.match(mainSource, /FRESH_SIGN_IN_STORAGE_KEY/);
  assert.match(mainSource, /window\.sessionStorage\.setItem\(FRESH_SIGN_IN_STORAGE_KEY, '1'\)/);
  assert.match(mainSource, /shouldRedirectFreshSignInToCartOperations\(entryMode\)/);
  assert.match(mainSource, /window\.location\.assign\('\/'\)/);
  // The redirect must be gated on both the fresh-sign-in marker and the
  // architectural rule, not unconditionally applied to every sign-in.
  assert.match(mainSource, /if \(freshSignIn && shouldRedirectFreshSignInToCartOperations\(entryMode\)\)/);
});

test('the marker is consumed (removed) on every auth-state transition, including sign-out, so it cannot leak into a later load', () => {
  assert.match(mainSource, /window\.sessionStorage\.removeItem\(FRESH_SIGN_IN_STORAGE_KEY\)/);
  const signedOutBranch = mainSource.slice(
    mainSource.indexOf('if (!nextUser) {'),
    mainSource.indexOf('if (!nextUser) {') + 400
  );
  assert.match(signedOutBranch, /window\.sessionStorage\.removeItem\(FRESH_SIGN_IN_STORAGE_KEY\)/);
});

test('main.jsx still renders InventoryApp for an authorized Inventory entry (no regression to the existing route)', () => {
  assert.match(mainSource, /entry === 'inventory'/);
  assert.match(mainSource, /<InventoryApp /);
});
