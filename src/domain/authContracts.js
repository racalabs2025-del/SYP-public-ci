/**
 * @file src/domain/authContracts.js
 * @description SYP Authentication ve Authorization Sözleşmeleri (Auth Contracts).
 *
 * Faz 5.1 Standartları:
 * - Rol Modeli: 'admin', 'manager', 'data_entry', 'chief', 'viewer'
 * - Kimlik Kaynağı (Authentication): Firebase Authentication User UID
 * - Tek Yetki Kaynağı (Authorization Source of Truth): Supabase app_users/{uid}
 * - Custom Claims: Yalnızca ikincil assertion/optimizasyon (users/{uid} yoksa yetki vermez, privilege escalate edemez)
 * - Default Deny: users/{uid} kaydı bulunmayan veya devre dışı bırakılan kullanıcılar kesinlikle yetkisizdir.
 */

import { PANEL_ROLES, roleCapabilities } from './roleMatrix.js';

export { PANEL_ROLES };

export const ROLE_LABELS = Object.freeze({
  admin: 'Admin',
  manager: 'Yönetici',
  data_entry: 'Veri Giriş Personeli',
  chief: 'Şef',
  viewer: 'İzleyici',
});

export const AUTH_SOURCES = Object.freeze({
  SUPABASE_USERS: 'SUPABASE_USERS',
  FIRESTORE_USERS: 'FIRESTORE_USERS',
  CUSTOM_CLAIMS: 'CUSTOM_CLAIMS',
  NONE: 'NONE',
});

/**
 * Kullanıcının users/{uid} yetki belgesinin aktif ve geçerli olup olmadığını
 * Firestore Security Rules ile tam uyumlu (parity) olarak doğrular.
 *
 * Kurallar:
 * - Belge mevcut ve nesne olmalıdır.
 * - disabled == true ise pasiftir.
 * - status alanı tanımlıysa ('status' in doc) değeri tam olarak 'active' olmalıdır.
 * - durum alanı tanımlıysa ('durum' in doc) değeri tam olarak 'AKTIF' olmalıdır.
 * - Tanımsız/ara durumlar (örn. 'pending', 'passive', 'PASIF') aktif kabul edilmez.
 *
 * @param {any} userData
 * @returns {boolean}
 */
export function isUserRecordActive(userData) {
  if (!userData || typeof userData !== 'object') {
    return false;
  }

  if (userData.disabled === true) {
    return false;
  }

  if (userData.status !== undefined && userData.status !== null && userData.status !== 'active') {
    return false;
  }

  if (userData.durum !== undefined && userData.durum !== null && userData.durum !== 'AKTIF') {
    return false;
  }

  return true;
}

/**
 * Belirtilen rol için UI ve operasyonel yetki sınırlarını döner.
 *
 * @param {string|null} role
 * Yönetici ve şef, merkezi veri ekibinin girdilerini değiştirmez; yalnızca not ekler.
 * @returns {{ canRead: boolean, canWrite: boolean, canDelete: boolean, canImport: boolean, canViewPhone: boolean, canAddNotes: boolean, canManageUsers: boolean, canManageSettings: boolean, isAdmin: boolean, isEditor: boolean, isViewer: boolean }}
 */
export function getPermissionsForRole(role) {
  const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : null;
  // Runtime role values arrive from the already-normalized authorization profile.
  // Reject raw aliases such as ADMIN here so a caller cannot gain access through
  // a looser presentation-layer comparison.
  const isValidRole = typeof role === 'string' && role === normalizedRole && PANEL_ROLES.includes(normalizedRole);
  const effectiveRole = isValidRole ? normalizedRole : null;
  const capabilities = roleCapabilities(effectiveRole);

  return capabilities ? {
    ...capabilities,
    isAdmin: effectiveRole === 'admin',
    isEditor: effectiveRole === 'data_entry',
    isViewer: effectiveRole === 'viewer',
  } : {
    canRead: false, canWrite: false, canDelete: false, canImport: false,
    canViewPhone: false, canAddNotes: false, canManageUsers: false, canManageSettings: false,
    canManageTasks: false, canOverridePlan: false, canViewAllUnits: false,
    isAdmin: false, isEditor: false, isViewer: false,
  };
}

/**
 * Firebase Auth veya sistem hata kodlarını kullanıcı dostu, kullanıcı ifşası (enumeration)
 * yapmayan güvenli Türkçe metinlere dönüştürür.
 *
 * @param {string|Object} error
 * @returns {string}
 */
export function sanitizeAuthErrorMessage(error) {
  const code = typeof error === 'string' ? error : error?.code || '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'E-posta veya şifre hatalı.';

    case 'auth/user-disabled':
      return 'Bu kullanıcı hesabı devre dışı bırakılmıştır. Lütfen yöneticinizle iletişime geçin.';

    case 'auth/too-many-requests':
      return 'Çok fazla hatalı deneme yapıldı. Güvenliğiniz için lütfen bir süre bekleyip tekrar deneyin.';

    case 'auth/network-request-failed':
      return 'Sunucu ile bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.';

    case 'auth/unauthorized-role':
      return 'Bu hesaba panel erişim yetkisi tanımlanmamış. Lütfen sistem yöneticinizle iletişime geçin.';

    case 'auth/session-expired':
      return 'Oturum süreniz doldu. Lütfen tekrar giriş yapın.';

    default:
      if (typeof error?.message === 'string' && !error.message.includes('auth/')) {
        return error.message;
      }
      return 'Giriş yapılamadı. Lütfen bilgilerinizi kontrol edip tekrar deneyin.';
  }
}
