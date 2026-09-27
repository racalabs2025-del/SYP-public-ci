import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutNeighborhoodLabels } from '../src/utils/neighborhoodLabelLayout.js';
import { projectNeighborhoodCoordinates } from '../src/utils/mapCoordinates.js';
import { ALL_ISTANBUL_NEIGHBORHOODS } from '../src/data/istanbulNeighborhoodsData.js';
import { geoPaths } from '../src/data/istanbulGeoJsonPaths.js';

function districtPoints(districtId, width, height) {
    const neighborhoods = ALL_ISTANBUL_NEIGHBORHOODS.filter(item => item.districtId === districtId)
        .map(item => ({ ...item, svgCoords: projectNeighborhoodCoordinates(item) }))
        .filter(item => item.svgCoords);
    const bounds = geoPaths[districtId].bounds;
    const minX = Math.min(bounds.minX, ...neighborhoods.map(item => item.svgCoords.x));
    const maxX = Math.max(bounds.maxX, ...neighborhoods.map(item => item.svgCoords.x));
    const minY = Math.min(bounds.minY, ...neighborhoods.map(item => item.svgCoords.y));
    const maxY = Math.max(bounds.maxY, ...neighborhoods.map(item => item.svgCoords.y));
    const scale = Math.min(width / ((maxX - minX) * 1.35), height / ((maxY - minY) * 1.35));
    return neighborhoods.map(item => ({
        id: item.id,
        x: width / 2 + (item.svgCoords.x - (minX + maxX) / 2) * scale,
        y: height / 2 + (item.svgCoords.y - (minY + maxY) / 2) * scale,
        labelWidth: item.name.length * 7.2 + 24,
    }));
}

function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
}

function assertReadable(labels, { width, height, points = [], reserved = [] }) {
    for (const [id, rect] of labels) {
        assert.ok(rect.x >= 12 && rect.y >= 12, `${id} escapes top/left edges`);
        assert.ok(rect.x + rect.width <= width - 12 && rect.y + rect.height <= height - 12, `${id} escapes bottom/right edges`);
        for (const [otherId, other] of labels) {
            if (id !== otherId) assert.equal(intersects(rect, other), false, `${id} overlaps ${otherId}`);
        }
        for (const overlay of reserved) assert.equal(intersects(rect, overlay), false, `${id} covers a map control`);
        for (const point of points) {
            if (id === point.id) continue;
            const closestX = Math.max(rect.x, Math.min(rect.x + rect.width, point.x));
            const closestY = Math.max(rect.y, Math.min(rect.y + rect.height, point.y));
            assert.ok(Math.hypot(closestX - point.x, closestY - point.y) >= 7, `${id} covers marker ${point.id}`);
        }
    }
}

test('dense real district data stays readable at laptop, narrow and wide map sizes', () => {
    for (const district of ['fatih', 'sisli', 'uskudar']) {
        for (const [width, height] of [[600, 420], [1000, 520], [1500, 620]]) {
            const points = districtPoints(district, width, height);
            const reserved = [{ x: width - 80, y: 12, width: 68, height: 32 }, { x: 12, y: height - 42, width: 230, height: 30 }];
            const labels = layoutNeighborhoodLabels({ points, width, height, reserved });
            assert.ok(labels.size > 0, `${district} should have readable names`);
            assert.ok(labels.size < points.length, `${district} should reduce automatic label density`);
            assertReadable(labels, { width, height, points, reserved });
        }
    }
});

test('selected and focused names remain available when automatic names are off', () => {
    const points = [
        { id: 'selected', x: 180, y: 160, labelWidth: 140, priority: 1 },
        { id: 'focused', x: 420, y: 160, labelWidth: 160, priority: 2 },
        { id: 'ordinary', x: 300, y: 300, labelWidth: 100 },
    ];
    const labels = layoutNeighborhoodLabels({ points, width: 600, height: 420, showLabels: false });
    assert.deepEqual([...labels.keys()], ['focused', 'selected']);
    assertReadable(labels, { width: 600, height: 420, points });
});

test('focused name takes precedence over a collocated selected name', () => {
    const labels = layoutNeighborhoodLabels({
        width: 160, height: 100, showLabels: false,
        points: [
            { id: 'selected', x: 80, y: 65, labelWidth: 136, labelHeight: 30, priority: 1 },
            { id: 'focused', x: 80, y: 65, labelWidth: 136, labelHeight: 30, priority: 2 },
        ],
    });
    assert.deepEqual([...labels.keys()], ['focused']);
});

test('offscreen and invalid points cannot reserve space or consume a name slot', () => {
    const visible = { id: 'inside', x: 120, y: 100, labelWidth: 90 };
    const outside = [
        { id: 'left', x: -1, y: 100, labelWidth: 300, priority: 2 },
        { id: 'bottom', x: 120, y: 301, labelWidth: 300, priority: 2 },
        { id: 'invalid', x: NaN, y: 100, labelWidth: 300, priority: 2 },
    ];
    const options = { width: 400, height: 300 };
    assert.deepEqual(layoutNeighborhoodLabels({ ...options, points: [visible, ...outside] }), layoutNeighborhoodLabels({ ...options, points: [visible] }));
});

test('long names fit within the map and labels flip at canvas edges', () => {
    for (const [x, y] of [[2, 2], [298, 2], [2, 218], [298, 218]]) {
        const points = [{ id: 'long-neighborhood-name', x, y, labelWidth: 600, priority: 2 }];
        const labels = layoutNeighborhoodLabels({ points, width: 300, height: 220 });
        assert.equal(labels.size, 1);
        assertReadable(labels, { width: 300, height: 220 });
        assert.equal(labels.get(points[0].id).width, 276);
    }
});

test('zoom can reveal more names while keeping all rectangles separate', () => {
    const points = Array.from({ length: 40 }, (_, index) => ({
        id: `point-${index}`, x: 60 + index % 8 * 120, y: 65 + Math.floor(index / 8) * 100, labelWidth: 70,
    }));
    const options = { points, width: 1000, height: 520 };
    const overview = layoutNeighborhoodLabels(options);
    const zoomed = layoutNeighborhoodLabels({ ...options, zoom: 4 });
    assert.ok(zoomed.size > overview.size);
    assert.ok(overview.size >= 8);
    assertReadable(zoomed, options);
});

test('automatic label choices are deterministic across source ordering', () => {
    const points = districtPoints('fatih', 1000, 520);
    const options = { width: 1000, height: 520, zoom: 1.05 };
    assert.deepEqual(layoutNeighborhoodLabels({ ...options, points }), layoutNeighborhoodLabels({ ...options, points: points.slice().reverse() }));
});

test('map overlays are respected even by high-priority labels', () => {
    const points = [{ id: 'focus', x: 200, y: 150, labelWidth: 120, priority: 2 }];
    const reserved = [{ x: 0, y: 0, width: 400, height: 300 }];
    assert.equal(layoutNeighborhoodLabels({ points, width: 400, height: 300, reserved }).size, 0);
});

test('empty and not-yet-measured canvases return an empty layout', () => {
    for (const width of [0, 10, NaN, undefined]) {
        assert.equal(layoutNeighborhoodLabels({ points: [{ id: 'a', x: 0, y: 0 }], width, height: 300 }).size, 0);
    }
    assert.equal(layoutNeighborhoodLabels({ points: [], width: 1000, height: 520 }).size, 0);
});

test('revealing a hidden Fatih name keeps other labels still and only hides conflicts', () => {
    const points = districtPoints('fatih', 1000, 520);
    const options = { points, width: 1000, height: 520 };
    const baseline = layoutNeighborhoodLabels(options);
    const original = structuredClone(baseline);
    let conflicts = 0;
    for (const hidden of points.filter(point => !baseline.has(point.id))) {
        const focused = layoutNeighborhoodLabels({
            ...options, preferredLayout: baseline,
            points: points.map(point => ({ ...point, priority: point.id === hidden.id ? 2 : 0 })),
        });
        assert.ok(focused.has(hidden.id), `focused ${hidden.id} should be named`);
        // A priority name may cover markers when every candidate is crowded.
        assertReadable(focused, { width: options.width, height: options.height });
        for (const [id, rect] of focused) {
            if (id !== hidden.id) assert.deepEqual(rect, baseline.get(id), `${id} moved or appeared during focus`);
        }
        const revealed = focused.get(hidden.id);
        const breathingRoom = { x: revealed.x - 6, y: revealed.y - 6, width: revealed.width + 12, height: revealed.height + 12 };
        for (const [id, rect] of baseline) {
            if (!focused.has(id)) {
                conflicts++;
                assert.ok(intersects(rect, breathingRoom), `${id} disappeared without conflicting with focus`);
            }
        }
    }
    assert.ok(conflicts > 0, 'fixture must exercise crowded labels being hidden');
    assert.deepEqual(baseline, original, 'hovering must not mutate the baseline layout');
});

test('hovering an existing label keeps its rectangle under the pointer', () => {
    const points = districtPoints('sisli', 1000, 520);
    const options = { points, width: 1000, height: 520 };
    const baseline = layoutNeighborhoodLabels(options);
    for (const [id, rect] of baseline) {
        const focused = layoutNeighborhoodLabels({
            ...options, preferredLayout: baseline,
            points: points.map(point => ({ ...point, priority: point.id === id ? 2 : 0 })),
        });
        assert.deepEqual(focused.get(id), rect, `hovered label ${id} jumped away`);
        for (const [otherId, other] of focused) assert.deepEqual(other, baseline.get(otherId));
    }
});

test('stale preferred rectangles cannot cross canvas edges or cover a new overlay', () => {
    const points = [
        { id: 'outside', x: 100, y: 100, labelWidth: 80 },
        { id: 'overlay', x: 200, y: 100, labelWidth: 80 },
    ];
    const preferredLayout = new Map([
        ['outside', { x: -5, y: 30, width: 80, height: 28, placement: 'top' }],
        ['overlay', { x: 160, y: 30, width: 80, height: 28, placement: 'top' }],
    ]);
    const options = { points, width: 400, height: 300, preferredLayout, reserved: [{ x: 160, y: 30, width: 80, height: 28 }] };
    assert.equal(layoutNeighborhoodLabels(options).size, 0);
    const focused = layoutNeighborhoodLabels({ ...options, points: points.map(point => ({ ...point, priority: 2 })) });
    assert.equal(focused.size, 2, 'focused names may find a new valid position');
    assertReadable(focused, options);
});
