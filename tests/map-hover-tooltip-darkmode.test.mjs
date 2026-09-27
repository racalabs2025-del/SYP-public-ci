import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC = path.join(__dirname, '..', 'src');

test('SYP — Harita İlçe Hover Balonu (Tooltip) Geliştirmesi ve Koyu Mod Okunabilirlik Testi', async (t) => {
  const map3dJsx = fs.readFileSync(path.join(SRC, 'components/map/Istanbul3DMap.jsx'), 'utf-8');
  const map3dCss = fs.readFileSync(path.join(SRC, 'components/map/Istanbul3DMap.css'), 'utf-8');
  const map25dJsx = fs.readFileSync(path.join(SRC, 'components/map/Istanbul25DMap.jsx'), 'utf-8');
  const map25dCss = fs.readFileSync(path.join(SRC, 'components/map/Istanbul25DMap.css'), 'utf-8');

  await t.test('1. Istanbul3DMap.jsx: Gelişmiş 4 metrikli operasyonel kart ve akıllı konumlandırma', () => {
    assert.match(map3dJsx, /map-3d-tooltip-metrics-grid/);
    assert.match(map3dJsx, /👥 (Planlanan|Saha) Personel/);
    assert.match(map3dJsx, /(📬 153 Başvuru|📅 Görev Planı)/);
    assert.match(map3dJsx, /🏛️ Aktif Birim/);
    assert.match(map3dJsx, /(⚠️ Kronik Sorun|📋 Takip Edilen İş)/);
    assert.match(map3dJsx, /map-3d-tooltip-pin-dot/);
    assert.match(map3dJsx, /map-3d-tooltip-badge/);
    // Viewport taşmasını önleyen akıllı konumlandırma
    assert.match(map3dJsx, /tooltipPos\.width - tooltipWidth - 8/);
    assert.match(map3dJsx, /tooltipPos\.height - 210/);
  });

  await t.test('2. Istanbul3DMap.css: Koyu modda (dark mode) yüksek kontrastlı okunabilirlik kuralları', () => {
    // Koyu mod arka planı
    assert.match(map3dCss, /:root\[data-theme="dark"\] \.map-3d-tooltip-card[\s\S]*?background:\s*rgba\(15,\s*23,\s*42/);
    // Başlık ve parlayan nokta
    assert.match(map3dCss, /:root\[data-theme="dark"\] \.map-3d-tooltip-title[\s\S]*?color:\s*#38bdf8/);
    // Metrik sayıları saf beyaz (#ffffff) olmalı, koyu modda görünmeyen eski #0f172a rengi olmamalı
    assert.match(map3dCss, /:root\[data-theme="dark"\] \.map-3d-metric-val[\s\S]*?color:\s*#ffffff/);
    // Yaka ve rozetler
    assert.match(map3dCss, /:root\[data-theme="dark"\] \.map-3d-tooltip-yaka/);
    assert.match(map3dCss, /:root\[data-theme="dark"\] \.map-3d-tooltip-badge\.is-yuksek/);
  });

  await t.test('3. Istanbul25DMap.jsx: 2.5D SVG haritasında da aynı gelişmiş 4 metrikli kart yapısı', () => {
    assert.match(map25dJsx, /map-tooltip-metrics-grid-compact/);
    assert.match(map25dJsx, /👥 (Planlanan|Saha) Personel/);
    assert.match(map25dJsx, /(📬 153 Başvuru|📅 Görev Planı)/);
    assert.match(map25dJsx, /🏛️ Aktif Birim/);
    assert.match(map25dJsx, /(⚠️ Kronik Sorun|📋 Takip Edilen İş)/);
    assert.match(map25dJsx, /map-tooltip-pin-dot/);
    assert.match(map25dJsx, /map-tooltip-density-compact/);
  });

  await t.test('4. Istanbul25DMap.css: 2.5D haritada da koyu modda yüksek kontrast ve okunabilirlik', () => {
    assert.match(map25dCss, /:root\[data-theme="dark"\] \.map-tooltip-card-compact[\s\S]*?background:\s*rgba\(15,\s*23,\s*42/);
    assert.match(map25dCss, /:root\[data-theme="dark"\] \.map-tooltip-title-compact[\s\S]*?color:\s*#38bdf8/);
    assert.match(map25dCss, /:root\[data-theme="dark"\] \.map-metric-val[\s\S]*?color:\s*#ffffff/);
    assert.match(map25dCss, /:root\[data-theme="dark"\] \.map-tooltip-pointer-compact[\s\S]*?border-top-color:\s*#38bdf8/);
  });
});
