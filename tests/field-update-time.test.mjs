import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatIstanbulDateTime, startOfIstanbulDay, startOfNextIstanbulDay } from '../src/domain/fieldUpdateTime.js';

test('Saha Akışı gün aralığı İstanbul gece yarısını ve ertesi gün sınırını kullanır', () => {
  assert.equal(startOfIstanbulDay('2026-09-27'), '2026-09-27T00:00:00+03:00');
  assert.equal(startOfNextIstanbulDay('2026-09-27'), '2026-09-28T00:00:00+03:00');
});

test('UTC damgası ekranda İstanbul tarih ve saatiyle gösterilir', () => {
  assert.deepEqual(formatIstanbulDateTime('2026-09-27T23:30:00.000Z'), { date: '2026-09-28', time: '02:30' });
});
