export const APP_MODE = Object.freeze({
  ADMIN: 'admin',
  OPERATOR: 'operator',
});

export function modeForPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
    ? APP_MODE.ADMIN
    : APP_MODE.OPERATOR;
}

export function authorizationRequirements(mode) {
  return Object.freeze({
    adminClaim: mode === APP_MODE.ADMIN,
    operatorBootstrap: mode === APP_MODE.OPERATOR,
  });
}

export function destinationForLocation({ pathname, search = '', hash = '' }) {
  return `${pathname}${search}${hash}`;
}

export function resolveEntry({ mode, authenticated, claimsReady, isAdmin, operatorState }) {
  if (!authenticated) return 'login';
  if (mode === APP_MODE.ADMIN) {
    if (!claimsReady) return 'checking';
    return isAdmin ? 'admin' : 'denied';
  }
  if (operatorState === 'checking') return 'checking';
  return operatorState === 'authorized' ? 'operator' : 'denied';
}
