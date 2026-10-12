import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_MODE,
  authorizationRequirements,
  destinationForLocation,
  modeForPath,
  resolveEntry,
} from '../src/lib/appEntry.mjs';

test('Admin-only account enters Admin without operator bootstrap', () => {
  const mode = modeForPath('/admin');
  assert.deepEqual(authorizationRequirements(mode), {
    adminClaim: true,
    operatorBootstrap: false,
    inventoryMembership: false,
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

test('Operator-only account enters operator mode but cannot enter Admin', () => {
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

test('Dual-role account starts in the mode selected by its entry path', () => {
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

test('Inventory entry requires course membership but not Admin or Operator access', () => {
  const mode = modeForPath('/inventory');
  assert.equal(mode, APP_MODE.INVENTORY);
  assert.deepEqual(authorizationRequirements(mode), {
    adminClaim: false,
    operatorBootstrap: false,
    inventoryMembership: true,
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

test('Public cart menu entry is available without authentication', () => {
  const mode = modeForPath('/cartmenus/monarchbay_tony_lema_course');
  assert.equal(mode, APP_MODE.PUBLIC_MENU);
  assert.deepEqual(authorizationRequirements(mode), {
    adminClaim: false,
    operatorBootstrap: false,
    inventoryMembership: false,
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
