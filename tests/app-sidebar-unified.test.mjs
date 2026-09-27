import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNITS } from '../src/domain/commandCenter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC = path.join(__dirname, '..', 'src');

test('SYP — AppSidebar ve Navigasyon Mimarisi Testi', async (t) => {
  const sidebarJsx = fs.readFileSync(path.join(SRC, 'components/layout/AppSidebar.jsx'), 'utf-8');
  const appJsx = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf-8');

  await t.test('1. App.jsx kök rotası (/) CommandCenterScreen render eder', () => {
    assert.match(appJsx, /path="\/"\s+element=\{<CommandCenterScreen/);
  });

  await t.test('2. AppSidebar bileşeninde operasyonel modüller tanımlıdır', () => {
    assert.match(sidebarJsx, /'Şehir Takip'/);
    for (const unitId of ['MEYDAN', 'YERINDE_COZUM', 'SAHA_HIZMETLERI', 'COZUM_NOKTALARI']) {
      assert.ok(sidebarJsx.includes(`label: UNITS.${unitId}`), `${unitId} adı ortak sözleşmeden gelmeli`);
      assert.ok(UNITS[unitId]?.endsWith('Şefliği'), `${unitId} güncel şeflik adı içermeli`);
      assert.ok(sidebarJsx.includes(`/birim/${unitId}/personel`), `${unitId} personel ekranı ayrı olmalı`);
    }
    assert.match(sidebarJsx, /'Takip Edilen İşler'/);
    assert.doesNotMatch(sidebarJsx, /'Üst Yönetim Gündemi'/);
    assert.match(sidebarJsx, /'Saha Asistanı'/);
  });

  await t.test('3. AppSidebar Ayarlar butonu /ayarlar rotasına yönlendirir', () => {
    assert.match(sidebarJsx, /goTo\(['"]\/ayarlar['"]\)/);
    assert.match(sidebarJsx, /syp-sidebar__settings-btn/);
  });

  await t.test('4. AppSidebar tema geçiş butonu içerir', () => {
    assert.match(sidebarJsx, /toggleTheme/);
    assert.match(sidebarJsx, /syp-sidebar__theme-btn/);
  });

  await t.test('5. Veri yükleme bağlantısı yalnız yetkili veri giriş rolleri içindir', () => {
    assert.match(sidebarJsx, /label: 'Veri Yükleme',[^\n]*roles: \['admin', 'data_entry'\]/);
    assert.match(sidebarJsx, /item\.roles\.includes\(role\)/);
  });

  await t.test('6. AppSidebar navigationSearch fonksiyonunu kullanır', () => {
    assert.match(sidebarJsx, /import.*navigationSearch.*from/);
    assert.match(sidebarJsx, /navigationSearch\(/);
  });

  await t.test('7. AppSidebar kullanıcı profil kartı ve çıkış butonu içerir', () => {
    assert.match(sidebarJsx, /syp-sidebar__user/);
    assert.match(sidebarJsx, /syp-sidebar__avatar/);
    assert.match(sidebarJsx, /onLogout/);
  });

  await t.test('8. AppSidebar mobil çekmece modunu destekler (isOpen, isMobile, onClose)', () => {
    assert.match(sidebarJsx, /isOpen/);
    assert.match(sidebarJsx, /isMobile/);
    assert.match(sidebarJsx, /onClose/);
    assert.match(sidebarJsx, /useFocusTrap/);
    assert.match(sidebarJsx, /useEscapeHandler/);
  });

  await t.test('9. AppSidebar dinamik alt menü oluşturur (ilçe/mahalle drill-down)', () => {
    assert.match(sidebarJsx, /dynamicChildren/);
    assert.match(sidebarJsx, /syp-sidebar__subnav/);
    assert.match(sidebarJsx, /syp-sidebar__sublink/);
  });
});
