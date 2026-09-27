export const PANEL_ROLES = Object.freeze(['admin', 'manager', 'data_entry', 'chief', 'viewer']);

const capabilities = {
  admin: {
    canRead: true, canWrite: true, canDelete: true, canImport: true,
    canViewPhone: true, canAddNotes: true, canManageUsers: true, canManageSettings: true,
    canManageTasks: true, canOverridePlan: true, canViewAllUnits: true,
  },
  manager: {
    canRead: true, canWrite: false, canDelete: false, canImport: false,
    canViewPhone: true, canAddNotes: true, canManageUsers: false, canManageSettings: false,
    canManageTasks: false, canOverridePlan: false, canViewAllUnits: true,
  },
  data_entry: {
    canRead: true, canWrite: true, canDelete: false, canImport: true,
    canViewPhone: false, canAddNotes: false, canManageUsers: false, canManageSettings: false,
    canManageTasks: true, canOverridePlan: true, canViewAllUnits: true,
  },
  chief: {
    canRead: true, canWrite: false, canDelete: false, canImport: false,
    canViewPhone: false, canAddNotes: true, canManageUsers: false, canManageSettings: false,
    canManageTasks: false, canOverridePlan: false, canViewAllUnits: false,
  },
  viewer: {
    canRead: true, canWrite: false, canDelete: false, canImport: false,
    canViewPhone: false, canAddNotes: false, canManageUsers: false, canManageSettings: false,
    canManageTasks: false, canOverridePlan: false, canViewAllUnits: true,
  },
};

export const ROLE_MATRIX = Object.freeze(Object.fromEntries(
  Object.entries(capabilities).map(([role, value]) => [role, Object.freeze(value)]),
));

export function roleCapabilities(role) {
  return PANEL_ROLES.includes(role) ? ROLE_MATRIX[role] : null;
}
