import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandMapMetrics, COMMAND_MAP_LAYERS } from '../src/domain/commandMapMetrics.js';

const input = {
  districts: [{ id: 'a' }, { id: 'b' }],
  squares: [{ districtId: 'a' }, { districtId: 'a' }, { districtId: 'b' }],
  from: '2026-09-01', to: '2026-09-30', ready: true,
  plans: [
    { ilceId: 'a', personelId: 'p1', birimId: 'MEYDAN', tarih: '2026-09-01' },
    { ilceId: 'a', personelId: 'p1', birimId: 'MEYDAN', tarih: '2026-09-02' },
    { ilceId: 'a', personelId: 'p2', birimId: 'SAHA_HIZMETLERI', tarih: '2026-09-02' },
    { ilceId: 'b', personelId: 'p3', birimId: 'MEYDAN', tarih: '2026-09-02' },
    { ilceId: 'b', personelId: 'p4', birimId: 'MEYDAN', tarih: '2026-08-31' },
    { ilceId: 'b', personelId: 'p5', birimId: 'MEYDAN', tarih: '2026-09-03', iptal: true },
  ],
  tasks: [
    { ilceId: 'a', birimId: 'MEYDAN', tarih: '2026-09-02', durum: 'Açık' },
    { ilceId: 'a', birimId: 'MEYDAN', tarih: '2026-09-02', durum: 'Tamamlandı' },
    { ilceId: 'b', birimId: 'SAHA_HIZMETLERI', tarih: '2026-09-02', durum: 'Açık' },
  ],
};

test('map counts unique people and units, excludes cancelled/out-of-range plans', () => {
  const { metricsByDistrictId: m, normalizedScores } = buildCommandMapMetrics(input);
  assert.equal(m.a.personnel.active, 2);
  assert.equal(m.a.shifts.today, 3);
  assert.equal(m.a.units, 2);
  assert.equal(m.b.personnel.active, 1);
  assert.equal(m.a.chronicIssues.count, 1);
  assert.deepEqual(normalizedScores, { a: 100, b: 50 });
});

test('unit filter scopes records, while square inventory remains geographic', () => {
  const { metricsByDistrictId: m } = buildCommandMapMetrics({ ...input, unit: 'SAHA_HIZMETLERI' });
  assert.equal(m.a.personnel.active, 1);
  assert.equal(m.a.units, 1);
  assert.equal(m.b.personnel.active, 0);
  assert.equal(m.a.chronicIssues.count, 0);
  assert.equal(m.b.chronicIssues.count, 1);
  assert.equal(m.a.squares.count, 2);
});

test('unavailable data is distinct from a loaded empty period; unsupported sources are absent', () => {
  const unavailable = buildCommandMapMetrics({ ...input, ready: false });
  assert.equal(unavailable.metricsByDistrictId.a.dataStatus, 'UNAVAILABLE');
  assert.equal(unavailable.normalizedScores.a, null);
  const empty = buildCommandMapMetrics({ ...input, plans: [], tasks: [] });
  assert.equal(empty.metricsByDistrictId.a.dataStatus, 'LIVE');
  assert.equal(empty.normalizedScores.a, 0);
  assert.equal(empty.metricsByDistrictId.a.personnel.active, 0);
  assert.equal('applications' in empty.metricsByDistrictId.a, false);
  assert.ok(!COMMAND_MAP_LAYERS.includes('Başvuru Yoğunluğu'));
  assert.ok(!COMMAND_MAP_LAYERS.includes('Genel Operasyon Yoğunluğu'));
});
