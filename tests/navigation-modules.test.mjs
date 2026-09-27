import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { KINDS, UNITS, UNIT_PATHS } from '../src/domain/commandCenter.js';

test('Saha Komuta Merkezi Modül ve Navigasyon Testleri', async (t) => {
  await t.test('1. Güncel dört şeflik sözleşmesi eksiksizdir', () => {
    assert.equal(UNITS.MEYDAN, 'Meydan Yönetim Şefliği');
    assert.equal(UNITS.YERINDE_COZUM, 'Yerinde Çözüm Şefliği');
    assert.equal(UNITS.SAHA_HIZMETLERI, 'Mobil Çözüm Noktaları Şefliği');
    assert.equal(UNITS.COZUM_NOKTALARI, 'Çözüm Noktaları ve Şubeleri Şefliği');
  });

  await t.test('2. App.jsx korumalı rotaları eksiksiz kaydeder (tüm modlar)', () => {
    const content = readFileSync(path.join(process.cwd(), 'src/App.jsx'), 'utf8');

    // Tüm temel rotalar mevcut olmalı
    assert.ok(content.includes('path="/ilce-operasyonlari"'), 'Şehir Takip rotası');
    assert.ok(content.includes('path="/meydan-yonetimi"'), 'Meydan Yönetimi rotası');
    assert.ok(content.includes('path="/yerinde-cozum"'), 'Yerinde Çözüm rotası');
    assert.ok(content.includes('path="/saha-hizmetleri"'), 'Saha Hizmetleri rotası');
    assert.ok(content.includes('path="/personel"'), 'Personel rotası');
    assert.ok(content.includes('path="/takip-edilen-isler"'), 'Takip Edilen İşler rotası');
    assert.ok(content.includes('path="/ust-yonetim-gundemi"'), 'Üst Yönetim Gündemi rotası');
    assert.ok(content.includes('path="/asistan"'), 'Saha Asistanı rotası');
    assert.ok(content.includes('path="/veri-yukleme"'), 'Veri Yükleme rotası');
    assert.ok(content.includes('path="/ayarlar"'), 'Ayarlar rotası');
  });

  await t.test('3. CommandCenterScreen birim yollarını tanır', () => {
    assert.equal(UNIT_PATHS['/meydan-yonetimi'], 'MEYDAN', 'Meydan birim yolu');
    assert.equal(UNIT_PATHS['/yerinde-cozum'], 'YERINDE_COZUM', 'Yerinde Çözüm birim yolu');
    assert.equal(UNIT_PATHS['/saha-hizmetleri'], 'SAHA_HIZMETLERI', 'Saha Hizmetleri birim yolu');
    assert.ok(UNIT_PATHS['/cozum-noktalari'], 'Çözüm Noktaları birim yolu');
  });

  await t.test('4. App.jsx tüm eski rotaları yeni sisteme yönlendirir', () => {
    const content = readFileSync(path.join(process.cwd(), 'src/App.jsx'), 'utf8');

    // Redirect rotaları
    assert.ok(content.includes('path="/settings"'), '/settings redirect');
    assert.ok(content.includes('path="/veri-yonetimi"'), '/veri-yonetimi redirect');
    assert.ok(content.includes('Navigate to="/ayarlar"') || content.includes("Navigate to=\"/ayarlar\""), 'settings → ayarlar redirect');
  });

  await t.test('5. Tüm mod tipleri CommandCenterScreen tarafından desteklenir', () => {
    const content = readFileSync(path.join(process.cwd(), 'src/pages/CommandCenterScreen.jsx'), 'utf8');

    const modes = ['city', 'district', 'neighborhood', 'square', 'unit', 'person', 'personnel', 'tasks', 'import', 'settings', 'assistant'];
    for (const mode of modes) {
      assert.ok(content.includes(`'${mode}'`) || content.includes(`"${mode}"`), `Mode '${mode}' desteklenmeli`);
    }
  });

  await t.test('6. Asistan yeni Üst Yönetim Gündemi taslağı sunmaz', () => {
    assert.equal(Object.hasOwn(KINDS, 'agenda'), false);
  });
});
