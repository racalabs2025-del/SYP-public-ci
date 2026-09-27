import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeSharedRows } from '../src/services/sharedLiveRows.js';

test('identical active consumers share the initial read and the live channel', async () => {
  const registry = new Map(); let reads = 0, channels = 0, closes = 0;
  const first = [], second = [], late = [];
  let changed;
  const subscribe = callback => { channels++; changed = callback; return { unsubscribe: () => closes++ }; };
  const load = async () => { reads++; return [{ id: 'same-slice' }]; };
  const stop1 = subscribeSharedRows(registry, 'plans:{}', subscribe, load, rows => first.push(rows), assert.fail, 10);
  const stop2 = subscribeSharedRows(registry, 'plans:{}', subscribe, load, rows => second.push(rows), assert.fail, 10);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(reads, 1); assert.equal(channels, 1);
  assert.equal(first.length, 1); assert.equal(second.length, 1);
  const stop3 = subscribeSharedRows(registry, 'plans:{}', subscribe, load, rows => late.push(rows), assert.fail, 10);
  assert.equal(reads, 1); assert.equal(late.length, 1);
  stop1(); assert.equal(closes, 0);
  stop2(); assert.equal(closes, 0);
  stop3(); assert.equal(closes, 1); assert.equal(registry.size, 0);
});

test('bursts of table changes coalesce into one refresh shared by every consumer', async () => {
  const registry = new Map(); let reads = 0; let changed;
  const received = [0, 0];
  const subscribe = callback => { changed = callback; return { unsubscribe() {} }; };
  const load = async () => { reads++; return []; };
  const stop1 = subscribeSharedRows(registry, 'units:{}', subscribe, load, () => received[0]++, assert.fail, 25);
  const stop2 = subscribeSharedRows(registry, 'units:{}', subscribe, load, () => received[1]++, assert.fail, 25);
  await new Promise(resolve => setTimeout(resolve, 0));
  changed(); changed(); changed();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(reads, 2); assert.deepEqual(received, [2, 2]);
  stop1(); stop2();
});
