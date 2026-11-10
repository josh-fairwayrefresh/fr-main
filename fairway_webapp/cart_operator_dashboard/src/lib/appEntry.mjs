export const APP_MODE = Object.freeze({
  ADMIN: 'admin',
  INVENTORY: 'inventory',
  OPERATOR: 'operator',
  PUBLIC_MENU: 'public_menu',
  PUBLIC_BAY: 'public_bay',
});

export function modeForPath(pathname) {
  if (pathname === '/range' || pathname.startsWith('/range/')) return APP_MODE.PUBLIC_BAY;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return APP_MODE.ADMIN;
  if (pathname === '/inventory' || pathname.startsWith('/inventory/')) return APP_MODE.INVENTORY;
  if (pathname === '/cartmenus' || pathname.startsWith('/cartmenus/')) return APP_MODE.PUBLIC_MENU;
  return APP_MODE.OPERATOR;
}

export function authorizationRequirements(mode) {
  return Object.freeze({
    adminClaim: mode === APP_MODE.ADMIN,
    customerCourseAssignment: mode === APP_MODE.OPERATOR || mode === APP_MODE.INVENTORY,
    publicReadOnly: mode === APP_MODE.PUBLIC_MENU,
  });
}

export function destinationForLocation({ pathname, search = '', hash = '' }) {
  return `${pathname}${search}${hash}`;
}

export function resolveEntry({ mode, authenticated, claimsReady, isAdmin, operatorState, inventoryState }) {
  if (mode === APP_MODE.PUBLIC_MENU) return 'public_menu';
  if (mode === APP_MODE.PUBLIC_BAY) return 'public_bay';
  if (!authenticated) return 'login';
  if (mode === APP_MODE.ADMIN) {
    if (!claimsReady) return 'checking';
    return isAdmin ? 'admin' : 'denied';
  }
  if (mode === APP_MODE.INVENTORY) {
    if (inventoryState !== 'authorized' && inventoryState !== 'denied') return 'checking';
    return inventoryState === 'authorized' ? 'inventory' : 'denied';
  }
  if (operatorState === 'checking') return 'checking';
  return operatorState === 'authorized' ? 'operator' : 'denied';
}

// Fairway Refresh has exactly two application entry points: Cart UI and Admin
// UI. Inventory is a feature within Cart UI, not a separate entry point, so a
// sign-in that completes while on the Inventory route must land on Cart
// Operations rather than resolving directly to Inventory. Admin keeps its own
// first-class landing because it is the legitimate second application entry.
// This only applies to a sign-in that just completed on this page load; an
// already-authenticated session continuing a direct or Cart-banner Inventory
// visit is unaffected.
export function shouldRedirectFreshSignInToCartOperations(mode) {
  return mode === APP_MODE.INVENTORY;
}
