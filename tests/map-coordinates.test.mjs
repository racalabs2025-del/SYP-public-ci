import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { geoMercator } from 'd3-geo';
import { geoPaths } from '../src/data/istanbulGeoJsonPaths.js';
import { ALL_ISTANBUL_NEIGHBORHOODS } from '../src/data/istanbulNeighborhoodsData.js';
import { projectNeighborhoodCoordinates } from '../src/utils/mapCoordinates.js';

const districts = JSON.parse(fs.readFileSync(new URL('../data/source-evidence/istanbul-districts.json', import.meta.url), 'utf8'));
const referenceProjection = geoMercator().fitSize([1200, 620], districts);
const slug = name => name.toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
  .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '');

function vertices(coordinates) {
  return typeof coordinates[0] === 'number' ? [coordinates] : coordinates.flatMap(vertices);
}

function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point.y) !== (yj > point.y)
      && point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

test('projected source boundary anchors align with all 39 rendered district bounds', () => {
  assert.equal(districts.features.length, 39);
  for (const feature of districts.features) {
    const name = feature.properties.name;
    const points = vertices(feature.geometry.coordinates)
      .map(([longitude, latitude]) => projectNeighborhoodCoordinates({ longitude, latitude }));
    const actual = {
      minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
      minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)),
    };
    const expected = geoPaths[slug(name)].bounds;
    for (const key of ['minX', 'maxX', 'minY', 'maxY']) {
      assert.ok(Math.abs(actual[key] - expected[key]) < 1e-7, `${name} ${key} must align with the rendered outline`);
    }
  }
});

test('all 57 Fatih neighborhoods lie inside the rendered district outline', () => {
  const rings = geoPaths.fatih.path.split(/M\s*/).filter(Boolean).map(part => {
    const numbers = part.match(/-?\d+(?:\.\d+)?/g).map(Number);
    return Array.from({ length: numbers.length / 2 }, (_, i) => numbers.slice(i * 2, i * 2 + 2));
  });
  const neighborhoods = ALL_ISTANBUL_NEIGHBORHOODS.filter(n => n.districtId === 'fatih');
  assert.equal(neighborhoods.length, 57);
  for (const neighborhood of neighborhoods) {
    const point = projectNeighborhoodCoordinates(neighborhood);
    assert.ok(rings.filter(ring => insideRing(point, ring)).length % 2 === 1, neighborhood.name);
  }
});

test('all recorded locations match the outline generator projection without spreading points', () => {
  for (const neighborhood of ALL_ISTANBUL_NEIGHBORHOODS) {
    const actual = projectNeighborhoodCoordinates(neighborhood);
    const expected = referenceProjection([neighborhood.longitude, neighborhood.latitude]);
    assert.ok(Math.abs(actual.x - expected[0]) < 1e-7, neighborhood.id);
    assert.ok(Math.abs(actual.y - expected[1]) < 1e-7, neighborhood.id);
  }
  const location = { latitude: 41.006996, longitude: 28.948733 };
  assert.deepEqual(
    projectNeighborhoodCoordinates({ ...location, id: 'one', svgCoords: { x: 100, y: 200 } }),
    projectNeighborhoodCoordinates({ ...location, id: 'two', svgCoords: { x: 500, y: 600 } }),
  );
});

test('fallback coordinates are used only when valid geographic coordinates are unavailable', () => {
  const fallback = { x: 123, y: 456 };
  for (const geographic of [{}, { latitude: null, longitude: null }, { latitude: NaN, longitude: 29 },
    { latitude: 90, longitude: 29 }, { latitude: 41, longitude: Infinity }, { latitude: 41, longitude: 181 }]) {
    assert.deepEqual(projectNeighborhoodCoordinates({ ...geographic, svgCoords: fallback }), fallback);
  }
  const geographic = { latitude: 41, longitude: 29 };
  assert.notDeepEqual(projectNeighborhoodCoordinates({ ...geographic, svgCoords: fallback }), fallback);
  assert.deepEqual(projectNeighborhoodCoordinates({ svgCoords: { x: 0, y: 0 } }), { x: 0, y: 0 });
  for (const invalid of [null, undefined, {}, { svgCoords: { x: NaN, y: 1 } },
    { svgCoords: { x: 1, y: Infinity } }, { latitude: '41', longitude: '29' }]) {
    assert.equal(projectNeighborhoodCoordinates(invalid), null);
  }
});
