import test from 'node:test';
import assert from 'node:assert/strict';
import { wheelScale, clampMapPan, svgPointFromClient, zoomViewport, pinchViewport, mapTooltipPosition } from '../src/utils/mapViewport.js';

test('trackpad increments are proportional, reversible, and bounded for large wheel deltas', () => {
  assert.equal(wheelScale(0), 1);
  assert.ok(wheelScale(-2) < wheelScale(-100));
  assert.ok(Math.abs(wheelScale(40) * wheelScale(-40) - 1) < 1e-12);
  assert.equal(wheelScale(1, 1), wheelScale(16));
  assert.equal(wheelScale(10000), wheelScale(120));
});
test('dragging cannot remove the city map from the viewport at any supported scale', () => {
  for (const zoom of [1, 1.25, 3, 6]) {
    const p = clampMapPan(-1e6, 1e6, zoom);
    assert.ok(p.x + 1200 * zoom >= 1200);
    assert.ok(p.y <= 0);
    assert.ok(p.x <= 0);
    assert.ok(p.y + 620 * zoom >= 620);
  }
});
test('zoom preserves the point under the cursor and returns to centered overview', () => {
  const anchor = { x: 330, y: 250 };
  const before = { zoom: 2, pan: { x: -400, y: -200 } };
  const after = zoomViewport(before, 1.25, anchor);
  for (const axis of ['x', 'y']) assert.ok(Math.abs((anchor[axis] - before.pan[axis]) / before.zoom - (anchor[axis] - after.pan[axis]) / after.zoom) < 1e-10);
  assert.deepEqual(zoomViewport(after, 0.01), { zoom: 1, pan: { x: 0, y: 0 } });
});
test('SVG conversion uses the browser matrix, including letterbox offsets', () => {
  const svg = {
    getScreenCTM: () => ({ inverse: () => ({ scale: 2, offsetX: 20, offsetY: 80 }) }),
    createSVGPoint: () => ({ matrixTransform(m) { return { x: (this.x - m.offsetX) / m.scale, y: (this.y - m.offsetY) / m.scale }; } }),
  };
  assert.deepEqual(svgPointFromClient(svg, 220, 180), { x: 100, y: 50 });
});

test('pinching follows both the changing finger distance and moving midpoint', () => {
  const before = { zoom: 2, pan: { x: -400, y: -200 } };
  const start = { x: 300, y: 250 };
  const current = { x: 360, y: 280 };
  const after = pinchViewport(before, 1.5, start, current);
  assert.equal(after.zoom, 3);
  for (const axis of ['x', 'y']) {
    assert.ok(Math.abs((start[axis] - before.pan[axis]) / before.zoom - (current[axis] - after.pan[axis]) / after.zoom) < 1e-10);
  }
  assert.deepEqual(pinchViewport(before, 0.01, start, current), { zoom: 1, pan: { x: 0, y: 0 } });
});

test('zoom at a limit keeps the current viewport without redundant state updates', () => {
  const overview = { zoom: 1, pan: { x: 0, y: 0 } };
  const closeup = { zoom: 6, pan: { x: -1400, y: -700 } };
  assert.equal(zoomViewport(overview, 0.8), overview);
  assert.equal(zoomViewport(closeup, 1.25), closeup);
});

test('tooltip stays inside resized canvas edges and flips below a northern district', () => {
  const card = { width: 280, height: 174 };
  for (const bounds of [{ width: 360, height: 480 }, { width: 1600, height: 820 }]) {
    for (const anchor of [{ x: 0, y: 0 }, { x: bounds.width, y: bounds.height }, { x: bounds.width / 2, y: bounds.height / 2 }]) {
      const position = mapTooltipPosition(anchor, card, bounds);
      assert.ok(position.left >= 10);
      assert.ok(position.top >= 10);
      assert.ok(position.left + card.width <= bounds.width - 10);
      assert.ok(position.top + card.height <= bounds.height - 10);
    }
  }
  const northern = mapTooltipPosition({ x: 400, y: 30 }, card, { width: 800, height: 500 });
  assert.equal(northern.top, 46);
});
