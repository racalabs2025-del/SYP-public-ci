import { getServerAuth } from './firebase-admin.js';
import { getSupabaseUserProfile } from './supabase-profile.js';
import { PANEL_ROLES, isUserRecordActive } from '../src/domain/authContracts.js';

/**
 * Server API yetkilendirme doğrulaması.
 *
 * Faz 5.1 Standartları:
 * - Kimlik Doğrulama: Firebase Auth ID Token -> claims.uid
 * - Tek Yetki Kaynağı (Source of Truth): Supabase `app_users` profili
 * - Custom Claims Bağımsız Yetki Veremez: profil yoksa 403 Forbidden
 * - Fail-Closed: Supabase hatası veya ulaşılamazlık durumunda 503 Service Unavailable
 * - Parity: Client, Rules ve Server tam olarak aynı yetkilendirme kurallarına tabidir.
 *
 * @param {import('http').IncomingMessage} request
 * @param {(token: string) => Promise<any>} [verifyToken]
 * @param {(uid: string) => Promise<any>} [getUserDoc]
 * @returns {Promise<{ status: number, uid?: string, role?: string, error?: string }>}
 */
export async function authorizePanelRequest(
  request,
  verifyToken = (token) => getServerAuth().verifyIdToken(token, true),
  getUserDoc = null
) {
  const header = request?.headers?.authorization;
  const match = typeof header === 'string' && header.match(/^Bearer ([^\s]+)$/i);
  if (!match) {
    return { status: 401, error: 'Oturum açmanız gerekiyor.' };
  }

  let claims = null;
  try {
    claims = await verifyToken(match[1]);
  } catch {
    return { status: 401, error: 'Oturum doğrulanamadı. Yeniden giriş yapın.' };
  }

  if (!claims || !claims.uid) {
    return { status: 401, error: 'Oturum kimliği doğrulanamadı.' };
  }

  // Yalnızca güvenli e-posta/şifre sağlayıcısı kabul edilir
  if (claims.firebase?.sign_in_provider && claims.firebase.sign_in_provider !== 'password') {
    return { status: 403, error: 'Geçersiz oturum sağlayıcısı.' };
  }

  // 1. getUserDoc fonksiyonu açıkça enjekte edilmişse (Test veya özel çözümleyici)
  if (typeof getUserDoc === 'function') {
    let userData = null;
    try {
      userData = await getUserDoc(claims.uid);
    } catch {
      return { status: 503, error: 'Yetki doğrulama servisine ulaşılamıyor.' };
    }

    if (!userData) {
      return { status: 403, error: 'Kullanıcı yetki kaydı bulunamadı (app_users profili zorunludur).' };
    }

    if (!isUserRecordActive(userData)) {
      return { status: 403, error: 'Kullanıcı hesabı devre dışı bırakılmış.' };
    }

    const role = typeof userData.role === 'string'
      ? userData.role.trim().toLowerCase()
      : null;

    if (!PANEL_ROLES.includes(role)) {
      return { status: 403, error: 'Geçersiz kullanıcı rolü.' };
    }

    return { status: 200, uid: claims.uid, role };
  }

  // 2. Canlı sunucu: Firebase tokenıyla Supabase app_users profili okunur.
  let userData = null;
  try {
    userData = await getSupabaseUserProfile(claims.uid, match[1]);
  } catch {
    return { status: 503, error: 'Yetki doğrulama servisine ulaşılamıyor.' };
  }

  if (!userData) {
    return { status: 403, error: 'Kullanıcı yetki kaydı bulunamadı (app_users profili zorunludur).' };
  }

  if (!isUserRecordActive(userData)) {
    return { status: 403, error: 'Kullanıcı hesabı devre dışı bırakılmış.' };
  }

  const role = typeof userData.role === 'string'
    ? userData.role.trim().toLowerCase()
    : null;

  if (!PANEL_ROLES.includes(role)) {
    return { status: 403, error: 'Geçersiz kullanıcı rolü.' };
  }

  return { status: 200, uid: claims.uid, role };
}
