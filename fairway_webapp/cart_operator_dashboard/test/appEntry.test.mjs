import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_MODE,
  authorizationRequirements,
  destinationForLocation,
  modeForPath,
  resolveEntry,
  shouldRedirectFreshSignInToCartOperations,
} from '../src/lib/appEntry.mjs';

test('Internal Admin enters Admin without a customer course assignment', () => {
  const mode = modeForPath('/admin');
  assert.deepEqual(authorizationRequirements(mode), {
    adminClaim: true,
    customerCourseAssignment: false,
    publicReadOnly: false,
  });
  assert.equal(resolveEntry({
    mode,
    authenticated: true,
    claimsReady: true,
    isAdmin: true,
    operatorState: 'not_requested',
  }), 'admin');
});

test('Customer course assignment grants Cart access but cannot enter Admin', () => {
  assert.deepEqual(authorizationRequirements(APP_MODE.OPERATOR), {
    adminClaim: false,
    customerCourseAssignment: true,
    publicReadOnly: false,
  });
  assert.equal(resolveEntry({
    mode: APP_MODE.OPERATOR,
    authenticated: true,
    claimsReady: true,
    isAdmin: false,
    operatorState: 'authorized',
  }), 'operator');
  assert.equal(resolveEntry({
    mode: APP_MODE.ADMIN,
    authenticated: true,
    claimsReady: true,
    isAdmin: false,
    operatorState: 'not_requested',
  }), 'denied');
});

test('Internal Admin and customer course assignment remain separate access checks', () => {
  assert.equal(resolveEntry({
    mode: APP_MODE.ADMIN,
    authenticated: true,
    claimsReady: true,
    isAdmin: true,
    operatorState: 'not_requested',
  }), 'admin');
  assert.equal(resolveEntry({
    mode: APP_MODE.OPERATOR,
    authenticated: true,
    claimsReady: true,
    isAdmin: true,
    operatorState: 'authorized',
  }), 'operator');
});

test('Cart authorization resolves independently while shared Admin status is still loading', () => {
  assert.equal(resolveEntry({
    mode: APP_MODE.OPERATOR,
    authenticated: true,
    claimsReady: false,
    isAdmin: false,
    operatorState: 'authorized',
  }), 'operator');
  assert.equal(resolveEntry({
    mode: APP_MODE.ADMIN,
    authenticated: true,
    claimsReady: true,
    isAdmin: true,
    operatorState: 'not_requested',
  }), 'admin');
});

test('Authenticated account with neither role is denied in both modes', () => {
  assert.equal(resolveEntry({
    mode: APP_MODE.ADMIN,
    authenticated: true,
    claimsReady: true,
    isAdmin: false,
    operatorState: 'not_requested',
  }), 'denied');
  assert.equal(resolveEntry({
    mode: APP_MODE.OPERATOR,
    authenticated: true,
    claimsReady: true,
    isAdmin: false,
    operatorState: 'denied',
  }), 'denied');
});

test('Logged-out Admin entry retains /admin through authentication', () => {
  const location = { pathname: '/admin', search: '?from=login', hash: '' };
  assert.equal(modeForPath(location.pathname), APP_MODE.ADMIN);
  assert.equal(destinationForLocation(location), '/admin?from=login');
  assert.equal(resolveEntry({
    mode: APP_MODE.ADMIN,
    authenticated: false,
    claimsReady: false,
    isAdmin: false,
    operatorState: 'not_requested',
  }), 'login');
});

test('Logged-out operator deep link retains its request destination', () => {
  const location = {
    pathname: '/requests/request-123',
    search: '?course=COURSE-0001',
    hash: '',
  };
  assert.equal(modeForPath(location.pathname), APP_MODE.OPERATOR);
  assert.equal(
    destinationForLocation(location),
    '/requests/request-123?course=COURSE-0001'
  );
});

test('Inventory entry requires the same customer course assignment as Cart', () => {
  const mode = modeForPath('/inventory');
  assert.equal(mode, APP_MODE.INVENTORY);
  assert.deepEqual(authorizationRequirements(mode), {
    adminClaim: false,
    customerCourseAssignment: true,
    publicReadOnly: false,
  });
  assert.equal(resolveEntry({
    mode,
    authenticated: true,
    claimsReady: false,
    isAdmin: false,
    operatorState: 'not_requested',
    inventoryState: 'authorized',
  }), 'inventory');
  assert.equal(resolveEntry({
    mode,
    authenticated: true,
    claimsReady: true,
    isAdmin: false,
    operatorState: 'not_requested',
    inventoryState: 'denied',
  }), 'denied');
});

test('Cart Operations and Inventory share one standard login; no second sign-in is required between them', () => {
  // Both customer-facing routes present the identical logged-out 'login' state
  // (not a mode-specific auth screen), and once the shared Firebase session is
  // authenticated, each route resolves directly to its own feature without
  // requiring any further authentication step.
  for (const path of ['/', '/inventory']) {
    const mode = modeForPath(path);
    assert.equal(resolveEntry({
      mode,
      authenticated: false,
      claimsReady: false,
      isAdmin: false,
      operatorState: 'not_requested',
      inventoryState: 'not_requested',
    }), 'login');
  }
  const operatorEntry = resolveEntry({
    mode: APP_MODE.OPERATOR,
    authenticated: true,
    claimsReady: true,
    isAdmin: false,
    operatorState: 'authorized',
    inventoryState: 'not_requested',
  });
  const inventoryEntry = resolveEntry({
    mode: APP_MODE.INVENTORY,
    authenticated: true,
    claimsReady: true,
    isAdmin: false,
    operatorState: 'not_requested',
    inventoryState: 'authorized',
  });
  assert.equal(operatorEntry, 'operator');
  assert.equal(inventoryEntry, 'inventory');
  assert.notEqual(operatorEntry, 'login');
  assert.notEqual(inventoryEntry, 'login');
});

test('Public cart menu entry is available without authentication', () => {
  const mode = modeForPath('/cartmenus/monarchbay_tony_lema_course');
  assert.equal(mode, APP_MODE.PUBLIC_MENU);
  assert.deepEqual(authorizationRequirements(mode), {
    adminClaim: false,
    customerCourseAssignment: false,
    publicReadOnly: true,
  });
  assert.equal(resolveEntry({
    mode,
    authenticated: false,
    claimsReady: false,
    isAdmin: false,
    operatorState: 'not_requested',
  }), 'public_menu');
});

test('A fresh sign-in on the Inventory route must redirect to Cart Operations; Admin and Operator never do', () => {
  // Fairway Refresh has exactly two application entry points (Cart UI, Admin
  // UI); Inventory is a feature within Cart UI, not a third entry point, so a
  // sign-in that completes on the Inventory route must not resolve directly
  // to Inventory. Admin keeps its own first-class landing.
  assert.equal(shouldRedirectFreshSignInToCartOperations(APP_MODE.INVENTORY), true);
  assert.equal(shouldRedirectFreshSignInToCartOperations(APP_MODE.OPERATOR), false);
  assert.equal(shouldRedirectFreshSignInToCartOperations(APP_MODE.ADMIN), false);
  assert.equal(shouldRedirectFreshSignInToCartOperations(APP_MODE.PUBLIC_MENU), false);
});
