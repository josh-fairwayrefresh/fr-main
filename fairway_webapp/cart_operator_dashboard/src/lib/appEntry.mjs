export const APP_MODE = Object.freeze({
  ADMIN: 'admin',
  INVENTORY: 'inventory',
  OPERATOR: 'operator',
  PUBLIC_MENU: 'public_menu',
});

export function modeForPath(pathname) {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return APP_MODE.ADMIN;
  if (pathname === '/inventory' || pathname.startsWith('/inventory/')) return APP_MODE.INVENTORY;
  if (pathname === '/cartmenus' || pathname.startsWith('/cartmenus/')) return APP_MODE.PUBLIC_MENU;
  return APP_MODE.OPERATOR;
}

export function authorizationRequirements(mode) {
  return Object.freeze({
    adminClaim: mode === APP_MODE.ADMIN,
    operatorBootstrap: mode === APP_MODE.OPERATOR,
    inventoryMembership: mode === APP_MODE.INVENTORY,
    publicReadOnly: mode === APP_MODE.PUBLIC_MENU,
  });
}

export function destinationForLocation({ pathname, search = '', hash = '' }) {
  return `${pathname}${search}${hash}`;
}

export function resolveEntry({ mode, authenticated, claimsReady, isAdmin, operatorState, inventoryState }) {
  if (mode === APP_MODE.PUBLIC_MENU) return 'public_menu';
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
