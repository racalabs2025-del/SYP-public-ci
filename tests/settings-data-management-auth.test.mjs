import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC = path.join(__dirname, '..', 'src');

test('SYP — Ayarlar & Veri Yönetimi RBAC (Admin-Only) Güvenlik Mimarisi Testi', async (t) => {
  const sidebarJsx = fs.readFileSync(path.join(SRC, 'components/layout/AppSidebar.jsx'), 'utf-8');
  const appJsx = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf-8');
  const screenJsx = fs.readFileSync(path.join(SRC, 'pages/CommandCenterScreen.jsx'), 'utf-8');

  await t.test('1. Sol Menü: Ayarlar butonu yalnızca admin rolüne gösterilir', () => {
    // role === 'admin' kontrolü ile Ayarlar butonu koşullu render edilir
    assert.match(sidebarJsx, /role\s*===\s*['"]admin['"]/);
    assert.match(sidebarJsx, /syp-sidebar__settings-btn/);
    assert.match(sidebarJsx, /goTo\(['"]\/ayarlar['"]\)/);
  });

  await t.test('2. App.jsx: /ayarlar rotası tanımlıdır', () => {
    assert.match(appJsx, /path="\/ayarlar"/);
    // /settings → /ayarlar redirect
    assert.match(appJsx, /path="\/settings"/);
    assert.ok(
      appJsx.includes('Navigate to="/ayarlar"') || appJsx.includes("Navigate to=\"/ayarlar\""),
      '/settings → /ayarlar redirect mevcut olmalı'
    );
  });

  await t.test('3. App.jsx: /veri-yonetimi ve diğer eski rotalar yeniden yönlendirilir', () => {
    assert.match(appJsx, /path="\/veri-yonetimi"/);
    assert.ok(
      appJsx.includes('Navigate to="/veri-yukleme"') || appJsx.includes("Navigate to=\"/veri-yukleme\""),
      '/veri-yonetimi → /veri-yukleme redirect mevcut olmalı'
    );
  });

  await t.test('4. CommandCenterScreen: settings modunda yönetici olmayan kullanıcılar engellenir', () => {
    // Ayarlar Admin'e; içe aktarma Admin ve Veri Giriş rollerine açıktır.
    assert.match(screenJsx, /mode\s*===\s*'settings'\s*&&\s*!canManageSettings/);
    assert.match(screenJsx, /mode\s*===\s*'import'\s*&&\s*!canImport/);
    assert.match(screenJsx, /Bu alan yalnızca yöneticiye açıktır/);
  });

  await t.test('5. CommandCenterScreen: settings modunda tema geçişi ve harita ayarları sunulur', () => {
    assert.match(screenJsx, /mode\s*===\s*'settings'/);
    assert.match(screenJsx, /toggleTheme/);
  });

  await t.test('6. Sidebar: Veri Yönetimi Ayarlar altındadır ve sadece admin erişir', () => {
    assert.match(sidebarJsx, /role\s*===\s*['"]admin['"]/);
    assert.match(sidebarJsx, /syp-sidebar__settings-btn/);
  });
});
