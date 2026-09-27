/**
 * @file src/auth.js
 * @description SYP Authentication & Session Giriş/Çıkış Arayüzü (Production).
 *
 * Faz 5 Güncellemesi:
 * - Tüm geliştirici rol atlatma ve yerel bypass yöntemleri tamamen kaldırılmıştır.
 * - Yalnızca gerçek kimlik doğrulaması (Firebase Auth) üzerinden çalışır.
 * - Hata mesajları kullanıcı ifşasını (enumeration) önleyecek biçimde sanitize edilir.
 */

import { auth } from './firebaseAuth';
import {
  signInWithCredentials,
  signOutSession,
} from './service/authService.js';

/**
 * Panel yetkili girişi gerçekleştirir.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signInPanel(email, password) {
  return signInWithCredentials(auth, email, password);
}

/**
 * Panel oturumunu güvenli biçimde kapatır.
 *
 * @returns {Promise<void>}
 */
export async function signOutAdmin() {
  return signOutSession(auth);
}
