import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC = path.join(__dirname, '..', 'src');

test('SYP — Harita Katman Seçici (MapLayerSelector) ve Pusula Kaldırma Testi', async (t) => {
  await t.test('1. MapLayerSelector bileşeni 7 operasyonel katmanı eksiksiz tanımlar', () => {
    const fileContent = fs.readFileSync(path.join(SRC, 'components/map/MapLayerSelector.jsx'), 'utf-8');
    assert.match(fileContent, /'Genel Operasyon Yoğunluğu'/);
    assert.match(fileContent, /'Personel Yoğunluğu'/);
    assert.match(fileContent, /'Başvuru Yoğunluğu'/);
    assert.match(fileContent, /'Aktif Operasyonlar'/);
    assert.match(fileContent, /'Kronik Sorunlar'/);
    assert.match(fileContent, /'Meydanlar'/);
    assert.match(fileContent, /'Birim Aktivitesi'/);
    assert.match(fileContent, /const MAP_LAYERS/);
  });

  await t.test('2. Istanbul3DMap bileşeninde eski pusula (KUZEY · 3D İSTANBUL) kaldırıldı ve MapLayerSelector eklendi', () => {
    const map3d = fs.readFileSync(path.join(SRC, 'components/map/Istanbul3DMap.jsx'), 'utf-8');
    assert.doesNotMatch(map3d, /KUZEY · 3D İSTANBUL/);
    assert.match(map3d, /import MapLayerSelector from '\.\/MapLayerSelector\.jsx'/);
    assert.match(map3d, /<MapLayerSelector[^>]*selectedLayer=\{selectedLayer\}[^>]*onSelectLayer=\{onSelectLayer\}/);
    assert.match(map3d, /onSelectLayer = \(\) => \{\}/);
  });

  await t.test('3. Istanbul3DMap 7 katmanın tamamı için 3D mesh renk hesaplaması barındırır', () => {
    const map3d = fs.readFileSync(path.join(SRC, 'components/map/Istanbul3DMap.jsx'), 'utf-8');
    assert.match(map3d, /selectedLayer === 'Genel Operasyon Yoğunluğu'/);
    assert.match(map3d, /selectedLayer === 'Personel Yoğunluğu'/);
    assert.match(map3d, /selectedLayer === 'Başvuru Yoğunluğu'/);
    assert.match(map3d, /selectedLayer === 'Aktif Operasyonlar'/);
    assert.match(map3d, /selectedLayer === 'Kronik Sorunlar'/);
    assert.match(map3d, /selectedLayer === 'Meydanlar'/);
    assert.match(map3d, /selectedLayer === 'Birim Aktivitesi'/);
  });

  await t.test('4. Istanbul25DMap bileşeninde eski pusula (KUZEY · İSTANBUL BOĞAZI) kaldırıldı ve MapLayerSelector eklendi', () => {
    const map25d = fs.readFileSync(path.join(SRC, 'components/map/Istanbul25DMap.jsx'), 'utf-8');
    assert.doesNotMatch(map25d, /KUZEY · İSTANBUL BOĞAZI/);
    assert.match(map25d, /import MapLayerSelector from '\.\/MapLayerSelector\.jsx'/);
    assert.match(map25d, /<MapLayerSelector[^>]*selectedLayer=\{selectedLayer\}[^>]*onSelectLayer=\{onSelectLayer\}/);
    assert.match(map25d, /onSelectLayer = \(\) => \{\}/);
  });

  await t.test('6. MapLayerSelector.css dosyasında açık ve koyu tema stilleri eksiksiz tanımlı', () => {
    const css = fs.readFileSync(path.join(SRC, 'components/map/MapLayerSelector.css'), 'utf-8');
    assert.match(css, /\.map-layer-selector/);
    assert.match(css, /\.map-layer-pill/);
    assert.match(css, /\.map-layer-dropdown-panel/);
    assert.match(css, /:root\[data-theme="dark"\] \.map-layer-pill/);
    assert.match(css, /:root\[data-theme="dark"\] \.map-layer-dropdown-panel/);
  });
});
