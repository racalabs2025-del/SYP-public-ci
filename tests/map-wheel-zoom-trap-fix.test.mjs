import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('SYP — Harita Scroll / Zoom Ayrımı ve Sayfa Kaydırma Koruması Testi', async (t) => {
  const map3dJsx = fs.readFileSync(path.resolve('src/components/map/Istanbul3DMap.jsx'), 'utf8');
  const map3dCss = fs.readFileSync(path.resolve('src/components/map/Istanbul3DMap.css'), 'utf8');

  const map25dJsx = fs.readFileSync(path.resolve('src/components/map/Istanbul25DMap.jsx'), 'utf8');
  const map25dCss = fs.readFileSync(path.resolve('src/components/map/Istanbul25DMap.css'), 'utf8');

  const districtNeighJsx = fs.readFileSync(path.resolve('src/components/map/DistrictNeighborhoodMap.jsx'), 'utf8');
  const districtNeighCss = fs.readFileSync(path.resolve('src/components/map/DistrictNeighborhoodMap.css'), 'utf8');

  await t.test('1. Istanbul3DMap: Tıklamadan mouse wheel yapıldığında preventDefault çağrılmaz, sayfa serbest kayar', () => {
    assert.ok(map3dJsx.includes('isWheelZoomActive'), 'isWheelZoomActive state olmalı');
    assert.ok(map3dJsx.includes('isWheelZoomActiveRef'), 'isWheelZoomActiveRef ref olmalı');
    assert.ok(
      map3dJsx.includes('if (!isWheelZoomActiveRef.current)') && map3dJsx.includes('return;'),
      'Zoom aktif değilken onWheel erken dönmeli ve sayfayı kaydırmalı'
    );
  });

  await t.test('2. Istanbul3DMap: Haritaya tıklanınca zoom aktifleşir, mouse haritadan çıkınca derhal deaktif olur', () => {
    assert.ok(
      map3dJsx.includes('isWheelZoomActiveRef.current = true') && map3dJsx.includes('setIsWheelZoomActive(true)'),
      'Tıklanınca (pointerdown) zoom aktifleşmeli'
    );
    assert.ok(
      map3dJsx.includes('isWheelZoomActiveRef.current = false') && map3dJsx.includes('setIsWheelZoomActive(false)'),
      'Fare haritadan çıkınca (pointerleave) zoom anında deaktif olmalı'
    );
    assert.ok(
      map3dJsx.includes('onWindowPointerDown'),
      'Harita dışına tıklandığında zoom deaktif olmalı'
    );
  });

  await t.test('3. Istanbul25DMap: Sayfa scrollunu tutsak etmez, tıklama ile odaklanır, çıkışta serbest bırakır', () => {
    assert.ok(map25dJsx.includes('isWheelZoomActive'), '2.5D haritada isWheelZoomActive state bulunmalı');
    assert.ok(map25dJsx.includes('if (!isWheelZoomActiveRef.current)'), 'Aktif değilken scroll pasif olmalı');
    assert.ok(map25dJsx.includes('isWheelZoomActiveRef.current = false'), 'Fare çıkışında pasifleşmeli');
  });

  await t.test('4. DistrictNeighborhoodMap: Mahalle haritasında da aynı scroll ayrımı ve koruması mevcuttur', () => {
    assert.ok(districtNeighJsx.includes('isWheelZoomActive'), 'Mahalle haritasında isWheelZoomActive bulunmalı');
    assert.ok(districtNeighJsx.includes('if (!isWheelZoomActiveRef.current)'), 'Aktif değilken scroll pasif olmalı');
    assert.ok(districtNeighJsx.includes('isWheelZoomActiveRef.current = false'), 'Fare çıkışında pasifleşmeli');
  });

  await t.test('5. Kullanıcı Rehberliği: Harita üzerinde durum rozeti ve aktif odak çerçevesi CSS sınıfları tanımlıdır', () => {
    assert.ok(map3dJsx.includes('map-zoom-scroll-indicator'), '3D JSX içinde durum rozeti bulunmalı');
    assert.ok(map3dCss.includes('.map-zoom-scroll-indicator'), '3D CSS içinde durum rozeti stilleri olmalı');
    assert.ok(map3dCss.includes('.istanbul-3d-map-wrapper.is-zoom-active'), '3D CSS içinde aktif odak çerçevesi olmalı');

    assert.ok(map25dCss.includes('.map-zoom-scroll-indicator'), '2.5D CSS içinde durum rozeti stilleri olmalı');
    assert.ok(map25dCss.includes('.istanbul-map-container.is-zoom-active'), '2.5D CSS içinde aktif odak çerçevesi olmalı');

    assert.ok(districtNeighCss.includes('.map-zoom-scroll-indicator'), 'Mahalle CSS içinde durum rozeti stilleri olmalı');
    assert.ok(districtNeighCss.includes('.syp-neigh-map-canvas-wrap.is-zoom-active'), 'Mahalle CSS içinde aktif odak çerçevesi olmalı');
  });
});
