/**
 * @file tests/auth-production.test.mjs
 * @description SYP Faz 5.1 Production Authentication ve Authorization Doğrulama Testleri.
 *
 * Faz 5.1 Kapsamı:
 * 1. Tek Kimlik Kaynağı: Firebase Authentication User UID
 * 2. Tek Yetki Kaynağı (Source of Truth): Supabase app_users profili
 * 3. Custom Claims: Bağımsız fallback veya privilege escalation kaynağı OLAMAZ.
 * 4. Client / Server / Firestore Rules Parity: Aynı UID her üç ortamda aynı rolü çözer.
 * 5. 7 Adet Role Mismatch Senaryosu.
 * 6. Self Privilege Escalation Koruması.
 * 7. Tüm Route ve API Endpoint Envanteri Güvenlik Denetimleri.
 * 8. İlk Yönetici Bootstrap Güvenlik Kilitleri.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  PANEL_ROLES,
  ROLE_LABELS,
  AUTH_SOURCES,
  getPermissionsForRole,
  sanitizeAuthErrorMessage,
} from '../src/domain/authContracts.js';
import {
  resolveUserAuthorization,
  resolveSupabaseProfile,
} from '../src/service/authService.js';
import {
  authorizePanelRequest,
} from '../server/authorize.js';

// ── 1. STANDART ROL MODELİ VE İZİN MATRİSİ ───────────────────────────────────

test('1. Onaylı rol modeli Admin, Yönetici, Veri Giriş, Şef ve İzleyici içerir', () => {
  assert.deepEqual(PANEL_ROLES, ['admin', 'manager', 'data_entry', 'chief', 'viewer']);
  assert.ok(ROLE_LABELS.admin);
  assert.equal(ROLE_LABELS.editor, undefined);
  assert.ok(ROLE_LABELS.viewer);
});

test('2. Viewer yetki sınırları: canRead: true, canWrite: false, canDelete: false', () => {
  const perms = getPermissionsForRole('viewer');
  assert.equal(perms.canRead, true);
  assert.equal(perms.canWrite, false);
  assert.equal(perms.canDelete, false);
  assert.equal(perms.isViewer, true);
  assert.equal(perms.isEditor, false);
  assert.equal(perms.isAdmin, false);
});

test('3. Editor yetki sınırları: canRead: false, canWrite: false, canDelete: false', () => {
  const perms = getPermissionsForRole('editor');
  assert.equal(perms.canRead, false);
  assert.equal(perms.canWrite, false);
  assert.equal(perms.canDelete, false);
  assert.equal(perms.isViewer, false);
  assert.equal(perms.isEditor, false);
  assert.equal(perms.isAdmin, false);
});

test('4. Admin yetki sınırları: canRead: true, canWrite: true, canDelete: true', () => {
  const perms = getPermissionsForRole('admin');
  assert.equal(perms.canRead, true);
  assert.equal(perms.canWrite, true);
  assert.equal(perms.canDelete, true);
  assert.equal(perms.isAdmin, true);
});

test('5. Tanımsız / null rol yetki sınırları: tüm izinler false (Default Deny)', () => {
  for (const invalidRole of [null, undefined, '', 'guest', 'hacker', 'owner', 'superadmin']) {
    const perms = getPermissionsForRole(invalidRole);
    assert.equal(perms.canRead, false);
    assert.equal(perms.canWrite, false);
    assert.equal(perms.canDelete, false);
    assert.equal(perms.isAdmin, false);
  }
});

// ── 2. IDENTITY VE DEFAULT-DENY TEMELLERİ ───────────────────────────────────

test('6. Unauthenticated kullanıcı yetkilendirme çözümlemesi: authorized: false, role: null', async () => {
  const resNull = await resolveUserAuthorization(null, null);
  assert.equal(resNull.authorized, false);
  assert.equal(resNull.role, null);
  assert.equal(resNull.source, AUTH_SOURCES.NONE);

  const resEmptyUser = await resolveUserAuthorization(null, {});
  assert.equal(resEmptyUser.authorized, false);
  assert.equal(resEmptyUser.role, null);
});

// ── 3. SUPABASE PROFİLİ VE FIREBASE CLAIM AYRIŞMASI ──────────────────────────

const firebaseUser = (uid, claim) => ({
  uid, email: `${uid}@syp.local`,
  getIdTokenResult: async () => ({ claims: { sypRole: claim } }),
});
const profile = (role, active = true, extra = {}) => ({ role, active, display_name: 'Kullanıcı', ...extra });

test('7. Supabase izleyici profili, Firebase admin claim karşısında da izleyici kalır', () => {
  const res = resolveSupabaseProfile(firebaseUser('u_viewer', 'admin'), profile('viewer'));
  assert.equal(res.authorized, true);
  assert.equal(res.role, 'viewer');
  assert.equal(res.source, AUTH_SOURCES.SUPABASE_USERS);
});

test('8. Supabase admin profili, Firebase viewer claim karşısında da admin kalır', () => {
  const res = resolveSupabaseProfile(firebaseUser('u_admin', 'viewer'), profile('admin'));
  assert.equal(res.authorized, true);
  assert.equal(res.role, 'admin');
  assert.equal(res.source, AUTH_SOURCES.SUPABASE_USERS);
});

test('9. Supabase profili yoksa Firebase claim yetki vermez', () => {
  const res = resolveSupabaseProfile(firebaseUser('u_missing', 'admin'), null);
  assert.equal(res.authorized, false);
  assert.equal(res.role, null);
  assert.equal(res.reason, 'SUPABASE_PROFILE_NOT_FOUND');
  assert.equal(res.source, AUTH_SOURCES.NONE);
});

test('10. Pasif Supabase profili erişim vermez', () => {
  const res = resolveSupabaseProfile(firebaseUser('u_disabled', 'admin'), profile('admin', false));
  assert.equal(res.authorized, false);
  assert.equal(res.reason, 'ACCOUNT_DISABLED');
});

test('11. Geçersiz rol claim ile düzeltilemez', () => {
  const res = resolveSupabaseProfile(firebaseUser('u_invalid', 'admin'), profile('hacker'));
  assert.equal(res.authorized, false);
  assert.equal(res.reason, 'INVALID_ROLE_IN_DOCUMENT');
});

test('12. Eski editor rolü erişim alamaz', () => {
  const res = resolveSupabaseProfile(firebaseUser('u_editor'), profile('editor'));
  assert.equal(res.authorized, false);
  assert.equal(res.source, AUTH_SOURCES.SUPABASE_USERS);
});

test('13. Şef profili birim atanmadığında erişim alamaz', () => {
  const denied = resolveSupabaseProfile(firebaseUser('u_chief'), profile('chief'));
  const accepted = resolveSupabaseProfile(firebaseUser('u_chief'), profile('chief', true, { unit_id: 'MEYDAN' }));
  assert.equal(denied.reason, 'CHIEF_UNIT_REQUIRED');
  assert.equal(accepted.authorized, true);
  assert.equal(accepted.user.unitId, 'MEYDAN');
});

// ── 4. SERVER AUTHORIZATION PARITY TESTLERİ (SERVER/AUTHORIZE.JS) ───────────

test('14. Server Authorize Parity: header yoksa 401 döner', async () => {
  const res = await authorizePanelRequest({});
  assert.equal(res.status, 401);
  assert.ok(res.error.includes('Oturum açmanız'));
});

test('15. Server Authorize Parity: geçersiz token 401 döner', async () => {
  const req = { headers: { authorization: 'Bearer invalid_token' } };
  const res = await authorizePanelRequest(req, async () => {
    throw new Error('Token expired');
  });
  assert.equal(res.status, 401);
  assert.ok(res.error.includes('doğrulanamadı'));
});

test('16. Server Authorize Parity: users doc missing + admin claim => 403 Forbidden', async () => {
  const req = { headers: { authorization: 'Bearer valid_jwt' } };
  const mockVerify = async () => ({ uid: 'attacker_uid', sypRole: 'admin', firebase: { sign_in_provider: 'password' } });
  const mockGetUserDoc = async () => null; // Firestore'da kayıt yok

  const res = await authorizePanelRequest(req, mockVerify, mockGetUserDoc);
  assert.equal(res.status, 403);
  assert.ok(res.error.includes('yetki kaydı bulunamadı'));
});

test('17. Server Authorize Parity: users disabled=true + admin claim => 403 Forbidden', async () => {
  const req = { headers: { authorization: 'Bearer valid_jwt' } };
  const mockVerify = async () => ({ uid: 'disabled_uid', sypRole: 'admin', firebase: { sign_in_provider: 'password' } });
  const mockGetUserDoc = async () => ({ uid: 'disabled_uid', role: 'admin', disabled: true });

  const res = await authorizePanelRequest(req, mockVerify, mockGetUserDoc);
  assert.equal(res.status, 403);
  assert.ok(res.error.includes('devre dışı'));
});

test('18. Server Authorize Parity: users role=viewer + admin claim => role: viewer (Privilege Escalation Yok)', async () => {
  const req = { headers: { authorization: 'Bearer valid_jwt' } };
  const mockVerify = async () => ({ uid: 'viewer_uid', sypRole: 'admin', firebase: { sign_in_provider: 'password' } });
  const mockGetUserDoc = async () => ({ uid: 'viewer_uid', role: 'viewer', disabled: false });

  const res = await authorizePanelRequest(req, mockVerify, mockGetUserDoc);
  assert.equal(res.status, 200);
  assert.equal(res.role, 'viewer'); // Server'da da role viewer olarak çözümlenir!
});

test('19. Server Authorize Parity: users role=editor + matching request => erişim reddedilir', async () => {
  const req = { headers: { authorization: 'Bearer valid_jwt' } };
  const mockVerify = async () => ({ uid: 'editor_uid', firebase: { sign_in_provider: 'password' } });
  const mockGetUserDoc = async () => ({ uid: 'editor_uid', role: 'editor', disabled: false });

  const res = await authorizePanelRequest(req, mockVerify, mockGetUserDoc);
  assert.equal(res.status, 403);
  assert.equal(res.role, undefined);
});

test('20. Server Authorize Parity: Anında Role Downgrade (admin -> viewer) hemen etki eder', async () => {
  // Kullanıcının tokenında hâlâ sypRole: 'admin' var fakat veritabanında rolü 'viewer' yapıldı
  const req = { headers: { authorization: 'Bearer stale_admin_jwt' } };
  const mockVerify = async () => ({ uid: 'downgraded_uid', sypRole: 'admin', firebase: { sign_in_provider: 'password' } });
  const mockGetUserDoc = async () => ({ uid: 'downgraded_uid', role: 'viewer', disabled: false });

  const res = await authorizePanelRequest(req, mockVerify, mockGetUserDoc);
  assert.equal(res.status, 200);
  assert.equal(res.role, 'viewer'); // Stale claim admin yetkisi sürdüremez!
});

// ── 5. ROUTE VE API ENDPOINT ENVANTERİ TESTLERİ ─────────────────────────────

test('21. Tüm uygulama rotaları ve koruma sınıfları eksiksiz tanımlıdır', () => {
  const appJsContent = readFileSync(path.join(process.cwd(), 'src/App.jsx'), 'utf8');

  // Tanımlı Rota Envanteri
  const expectedRoutes = [
    { path: '/', classification: 'AUTHENTICATED_VIEWER_PLUS' },
    { path: '/meydan-yonetimi', classification: 'AUTHENTICATED_VIEWER_PLUS' },
    { path: '/yerinde-cozum', classification: 'AUTHENTICATED_VIEWER_PLUS' },
    { path: '/saha-hizmetleri', classification: 'AUTHENTICATED_VIEWER_PLUS' },
    { path: '/splash', classification: 'PUBLIC' },
    { path: '/login', classification: 'PUBLIC' },
    { path: '/unauthorized', classification: 'AUTHENTICATED_UNAUTHORIZED_FEEDBACK' },
    { path: '/meydan/:id', classification: 'AUTHENTICATED_VIEWER_PLUS' },
    { path: '/meydan/:id/not', classification: 'AUTHENTICATED_VIEWER_PLUS' },
    { path: '/personel', classification: 'AUTHENTICATED_VIEWER_PLUS' },
    { path: '/personel/detay/:personelId', classification: 'AUTHENTICATED_VIEWER_PLUS' },
    { path: '/personel/:personelAdi', classification: 'AUTHENTICATED_VIEWER_PLUS' },
  ];

  for (const route of expectedRoutes) {
    assert.ok(appJsContent.includes(`path="${route.path}"`), `Rota tanımlı olmalıdır: ${route.path}`);
  }

  // Korunan rotalar ProtectedRoute sarmalayıcısı içindedir
  assert.ok(appJsContent.includes('<ProtectedRoute authState={authState} onLogout={handleLogout}>'));
  // Public rotalar PublicRoute sarmalayıcısı içindedir
  assert.ok(appJsContent.includes('<PublicRoute authState={authState}>'));
  // Doğrudan URL girişi ve popstate koruması mevcuttur
  assert.ok(appJsContent.includes('NavigationGuard'));
});

test('22. Kullanılmayan serverless API uçları üretim kaynak ağından kaldırılmıştır', () => {
  for (const file of [
    'api/deepseek.js',
    'api/weather.js',
    'api/external/ispark.js',
    'api/external/metro-stations.js',
    'server/ai-proxy-server.js',
  ]) {
    assert.equal(existsSync(path.join(process.cwd(), file)), false, `${file} dağıtım yüzeyinde bulunmamalı`);
  }
  const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['proxy:ai'], undefined);
  assert.equal(packageJson.scripts['dev:full'], undefined);
});

// ── 6. GÜVENLİK VE ENUMERATION TEMİZLİĞİ ─────────────────────────────────────

test('23. Firebase hata mesajları kullanıcı ifşasını önleyecek biçimde sanitize edilir', () => {
  assert.equal(sanitizeAuthErrorMessage('auth/invalid-credential'), 'E-posta veya şifre hatalı.');
  assert.equal(sanitizeAuthErrorMessage('auth/user-not-found'), 'E-posta veya şifre hatalı.');
  assert.equal(sanitizeAuthErrorMessage('auth/wrong-password'), 'E-posta veya şifre hatalı.');
  assert.equal(sanitizeAuthErrorMessage('auth/invalid-email'), 'E-posta veya şifre hatalı.');
  assert.ok(sanitizeAuthErrorMessage('auth/too-many-requests').includes('bekleyip'));
  assert.ok(sanitizeAuthErrorMessage('auth/network-request-failed').includes('İnternet'));
});

test('24. Kaynak kodda hiçbir dev bypass, signInDevBypass veya syp_dev_role bulunmamaktadır', () => {
  const srcDir = path.resolve(process.cwd(), 'src');
  const authJsContent = readFileSync(path.join(srcDir, 'auth.js'), 'utf8');
  const appJsContent = readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
  const loginJsContent = readFileSync(path.join(srcDir, 'pages/LoginScreen.jsx'), 'utf8');
  const assistantJsContent = readFileSync(path.join(srcDir, 'components/operations/CommandAssistant.jsx'), 'utf8');
  const serverAuthContent = readFileSync(path.join(process.cwd(), 'server/authorize.js'), 'utf8');

  assert.ok(!authJsContent.includes('signInDevBypass'), 'auth.js içinde signInDevBypass bulunamaz');
  assert.ok(!loginJsContent.includes('signInDevBypass'), 'LoginScreen.jsx içinde signInDevBypass bulunamaz');
  assert.ok(!authJsContent.includes('getDevRole'), 'auth.js içinde getDevRole bulunamaz');
  assert.ok(!appJsContent.includes('getDevRole'), 'App.jsx içinde getDevRole bulunamaz');
  assert.ok(!authJsContent.includes('syp_dev_role'), 'auth.js içinde syp_dev_role bulunamaz');
  assert.ok(!appJsContent.includes('syp_dev_role'), 'App.jsx içinde syp_dev_role bulunamaz');
  assert.ok(!loginJsContent.includes('syp_dev_role'), 'LoginScreen.jsx içinde syp_dev_role bulunamaz');
  assert.ok(!assistantJsContent.includes('syp_dev_role'), 'CommandAssistant içinde syp_dev_role bulunamaz');
  assert.ok(!assistantJsContent.includes('syp-dev-token'), 'CommandAssistant içinde syp-dev-token bulunamaz');
  assert.ok(!serverAuthContent.includes('syp-dev-token'), 'server/authorize.js içinde syp-dev-token bulunamaz');
});

test('25. Client yetkilendirmesi asla localStorage veya URL parametrelerine dayanmaz', () => {
  const srcDir = path.resolve(process.cwd(), 'src');
  const appJsContent = readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
  const authServiceContent = readFileSync(path.join(srcDir, 'service/authService.js'), 'utf8');

  assert.ok(!appJsContent.includes('localStorage.getItem'), 'App.jsx localStorage role kontrolü yapamaz');
  assert.ok(!authServiceContent.includes('localStorage'), 'authService.js localStorage kullanamaz');
  assert.ok(!appJsContent.includes('location.search.includes'), 'App.jsx URL query string ile rol alamaz');
});
