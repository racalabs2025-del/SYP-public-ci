import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectAllPages } from '../src/domain/pagination.js';

test('all pages are collected without a fixed total-row ceiling', async () => {
  const source = Array.from({ length: 5735 }, (_, index) => ({ id: index + 1 }));
  const calls = [];
  const rows = await collectAllPages(async (offset, pageSize) => {
    calls.push([offset, pageSize]);
    return source.slice(offset, offset + pageSize);
  }, 500);

  assert.equal(rows.length, 5735);
  assert.equal(rows.at(-1).id, 5735);
  assert.equal(calls.length, 12);
});

test('an exact page multiple performs one terminating empty-page read', async () => {
  const source = Array.from({ length: 1000 }, (_, index) => index);
  let calls = 0;
  const rows = await collectAllPages(async (offset, pageSize) => {
    calls += 1;
    return source.slice(offset, offset + pageSize);
  }, 500);

  assert.equal(rows.length, 1000);
  assert.equal(calls, 3);
});
