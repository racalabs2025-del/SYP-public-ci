/**
 * @file src/service/authService.js
 * @description SYP Authentication & Authorization Servisi.
 *
 * Firebase Auth UID kimliktir; Supabase app_users tek panel yetki kaynağıdır.
 * Profil yoksa, pasifse veya rol geçersizse erişim verilmez.
 */

import {
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import {
  PANEL_ROLES,
  AUTH_SOURCES,
  sanitizeAuthErrorMessage,
} from '../domain/authContracts.js';
import { supabase } from '../supabaseClient.js';

/** Resolve one Supabase role profile without granting authority from claims. */
export function resolveSupabaseProfile(firebaseUser, userData) {
  const uid = firebaseUser?.uid;
  if (!uid) return { authorized: false, role: null, source: AUTH_SOURCES.NONE, reason: 'UNAUTHENTICATED', user: null };
  const email = firebaseUser.email || null;
  if (!userData) return { authorized: false, role: null, source: AUTH_SOURCES.NONE, reason: 'SUPABASE_PROFILE_NOT_FOUND', user: { uid, email, displayName: firebaseUser.displayName || '' } };
  if (!userData.active) return { authorized: false, role: null, source: AUTH_SOURCES.SUPABASE_USERS, reason: 'ACCOUNT_DISABLED', user: { uid, email, displayName: userData.display_name || '' } };

  const role = typeof userData.role === 'string' ? userData.role.trim().toLowerCase() : null;
  if (!PANEL_ROLES.includes(role)) return { authorized: false, role: null, source: AUTH_SOURCES.SUPABASE_USERS, reason: 'INVALID_ROLE_IN_DOCUMENT', user: { uid, email } };
  if (role === 'chief' && !String(userData.unit_id || '').trim()) return { authorized: false, role: null, source: AUTH_SOURCES.SUPABASE_USERS, reason: 'CHIEF_UNIT_REQUIRED', user: { uid, email } };

  return { authorized: true, role, source: AUTH_SOURCES.SUPABASE_USERS, user: {
    uid, email: email || userData.email || null, displayName: userData.display_name || firebaseUser.displayName || '', role,
    unitId: typeof userData.unit_id === 'string' ? userData.unit_id : '',
  } };
}

/** Read the current panel profile for a Firebase Auth user. */
export async function resolveUserAuthorization(_db, firebaseUser) {
  if (!firebaseUser?.uid) return { authorized: false, role: null, source: AUTH_SOURCES.NONE, reason: 'UNAUTHENTICATED', user: null };
  const uid = firebaseUser.uid;
  const email = firebaseUser.email || null;
  if (!supabase) return { authorized: false, role: null, source: AUTH_SOURCES.NONE, reason: 'SUPABASE_NOT_CONFIGURED', user: { uid, email } };

  let userData;
  try {
    const { data, error } = await supabase.from('app_users')
      .select('id,display_name,email,role,unit_id,active').eq('id', uid).maybeSingle();
    if (error) throw error;
    userData = data;
  } catch (error) {
    console.warn('Supabase app_users authorization query failed (default-deny):', error?.message || error);
    return { authorized: false, role: null, source: AUTH_SOURCES.NONE, reason: 'SUPABASE_AUTH_QUERY_FAILED', user: { uid, email } };
  }

  return resolveSupabaseProfile(firebaseUser, userData);
}

/**
 * Kullanıcı e-posta ve şifresi ile oturum açar (Session Persistence ile).
 *
 * @param {import('firebase/auth').Auth} auth
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signInWithCredentials(auth, email, password) {
  const cleanEmail = String(email || '').trim();
  const cleanPassword = String(password || '');

  if (!cleanEmail || !cleanPassword) {
    throw new Error('E-posta ve şifre zorunludur.');
  }

  try {
    if (typeof browserSessionPersistence !== 'undefined') {
      await setPersistence(auth, browserSessionPersistence).catch(() => {});
    }
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
    return credential.user;
  } catch (err) {
    const safeMessage = sanitizeAuthErrorMessage(err);
    const error = new Error(safeMessage);
    error.code = err?.code || 'auth/generic-error';
    throw error;
  }
}

/**
 * Oturumu güvenli biçimde kapatır ve client oturum artıklarını temizler.
 *
 * @param {import('firebase/auth').Auth} auth
 * @returns {Promise<void>}
 */
export async function signOutSession(auth) {
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem('syp-active-meydan-expanded');
      window.sessionStorage.removeItem('syp_chunk_reload_attempt');
    } catch {
      // sessionStorage erişimi kısıtlı ortamlarda sessizce atla
    }
  }

  if (auth) {
    await signOut(auth);
  }
}
