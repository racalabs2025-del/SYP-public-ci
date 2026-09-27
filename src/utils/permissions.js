import { PANEL_ROLES, getPermissionsForRole } from '../domain/authContracts.js';

export { PANEL_ROLES };

export function getPanelRole(claims) {
  return claims?.firebase?.sign_in_provider === 'password' && PANEL_ROLES.includes(claims?.sypRole)
    ? claims.sypRole : null;
}

export function permissionsForRole(role, unitId = '') {
  const base = getPermissionsForRole(role);
  const isChief = role === 'chief';
  return {
    ...base,
    unitId: isChief ? unitId : '',
  };
}
