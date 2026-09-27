import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLiveOperationDataset } from '../src/domain/liveDataPolicy.js';

test('Realtime yalnız canlı operasyon veri kümelerinde kullanılır', () => {
  for (const kind of ['plans', 'activities', 'tasks']) {
    assert.equal(isLiveOperationDataset(kind), true, `${kind} canlı kalmalı`);
  }
  for (const kind of ['units', 'servicePoints', 'personnel', 'phones', 'unitStatus', 'recordHistory', 'fieldUpdates']) {
    assert.equal(isLiveOperationDataset(kind), false, `${kind} normal sorgu kullanmalı`);
  }
});
