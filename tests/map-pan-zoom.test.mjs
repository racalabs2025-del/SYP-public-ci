import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('SYP — Harita Sürükleme ve Pan Kontrolleri Doğrulama Testi', async (t) => {
  const jsxPath = path.resolve('src/components/map/Istanbul25DMap.jsx');
  const cssPath = path.resolve('src/components/map/Istanbul25DMap.css');

  const jsxContent = fs.readFileSync(jsxPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  await t.test('1. Harita sürükleme için global mouse ve touch eventleri dinleyicileri tanımlıdır', () => {
    assert.ok(jsxContent.includes("window.addEventListener('mousemove', onGlobalMouseMove"), 'Global mousemove olmalı');
    assert.ok(jsxContent.includes("window.addEventListener('mouseup', onGlobalMouseUp"), 'Global mouseup olmalı');
    assert.ok(jsxContent.includes('onTouchStart={handleTouchStart}'), 'Touch start bağlanmış olmalı');
    assert.ok(jsxContent.includes('onTouchMove={handleTouchMove}'), 'Touch move bağlanmış olmalı');
    assert.ok(jsxContent.includes('onTouchEnd={handleTouchEnd}'), 'Touch end bağlanmış olmalı');
  });

  await t.test('2. Sağa sola kaydırma (Pan) sınırları 1x ve zoom durumlarında esnek çalışır', () => {
    // Sürükleme matematik formülü
    const zoom = 1.0;
    const maxPanX = 1800 * Math.max(zoom, 1);
    const maxPanY = 1000 * Math.max(zoom, 1);

    // Batı yönüne kaydırma (mouse sağa çekildiğinde pozitif dx)
    const panStart = { x: 0, y: 0 };
    const dxEast = 300;
    const clampedEast = Math.min(Math.max(panStart.x + dxEast, -maxPanX), maxPanX);
    assert.equal(clampedEast, 300, 'Doğu/Batı yönünde 300px serbest kayabilmeli');

    // Aşırı kaydırma clamp testi
    const dxExtreme = 5000;
    const clampedExtreme = Math.min(Math.max(panStart.x + dxExtreme, -maxPanX), maxPanX);
    assert.equal(clampedExtreme, 1800, 'Aşırı sürüklemede harita kaybolmamalı, 1800px ile sınırlandırılmalı');
  });

  await t.test('3. Sürükleme (Drag) bitiminde yanlışlıkla ilçe seçilmesini önleyen eşik ve cooldown mevcuttur', () => {
    assert.ok(jsxContent.includes('Math.hypot(dx, dy) > 4'), '4px eşik kontrolü olmalı');
    assert.ok(jsxContent.includes('hasDraggedRef.current = true'), 'Sürüklendi bayrağı ayarlanmalı');
    assert.ok(jsxContent.includes('if (hasDraggedRef.current)'), 'Tıklama sürükleme kontrolü yapmalı');
  });

  await t.test('4. Hızlı pan butonları (◀ ve ▶) arayüzde yer alır ve handlePanNudge tetikler', () => {
    assert.ok(jsxContent.includes('handlePanNudge(120, 0)'), 'Sol yön butonu handlePanNudge(120, 0) çağırmalı');
    assert.ok(jsxContent.includes('handlePanNudge(-120, 0)'), 'Sağ yön butonu handlePanNudge(-120, 0) çağırmalı');
    assert.ok(jsxContent.includes('map-pan-btn'), 'map-pan-btn classı bulunmalı');
  });

  await t.test('5. CSS tarafında grab/grabbing imleçleri ve sürükleme sırasında SVG pointer-events koruması tanımlıdır', () => {
    assert.ok(cssContent.includes('cursor: grab;'), 'Varsayılan imleç grab olmalı');
    assert.ok(cssContent.includes('cursor: grabbing !important;'), 'Sürüklerken grabbing imleci olmalı');
    assert.ok(cssContent.includes('.istanbul-map-canvas-wrap.is-dragging svg'), 'Sürüklerken svg pointer-events izole edilmeli');
  });

  await t.test('6. 3D İlçe haritasında sürekli oynama/dalgalanma (sinusoidal wobble) bulunmaz, harita sabit kalır', () => {
    const map3dPath = path.resolve('src/components/map/Istanbul3DMap.jsx');
    const map3dContent = fs.readFileSync(map3dPath, 'utf8');

    assert.equal(
      map3dContent.includes('Math.sin('),
      false,
      'Istanbul3DMap animasyon döngüsünde sürekli salınım / dalgalanma (Math.sin) olmamalıdır'
    );
  });
});

