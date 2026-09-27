import test from 'node:test';
import assert from 'node:assert/strict';
import { commandTabs, normalizeCommandTab } from '../src/domain/commandNavigation.js';

test('A square tab carried into another unit returns to its visible default', () => {
  for (const unit of ['YERINDE_COZUM', 'SAHA_HIZMETLERI']) {
    assert.equal(normalizeCommandTab('squares', 'unit', unit), 'plans');
    assert.equal(normalizeCommandTab('squares', 'city', unit), 'plans');
    assert.equal(commandTabs(unit).some(([id]) => id === 'squares'), false);
  }
});

test('Valid content tabs survive navigation and unknown tabs select the page default', () => {
  for (const unit of ['', 'MEYDAN', 'YERINDE_COZUM', 'SAHA_HIZMETLERI']) {
    for (const mode of ['city', 'unit', 'district', 'neighborhood', 'square']) {
      const availableTabs = commandTabs(unit).map(([id]) => id);
      for (const tab of availableTabs) assert.equal(normalizeCommandTab(tab, mode, unit), tab);
      for (const tab of [null, '', 'unknown', 'personnel']) {
        const resolvedTab = normalizeCommandTab(tab, mode, unit);
        assert.ok(availableTabs.includes(resolvedTab));
        assert.equal(resolvedTab, mode === 'unit' && unit === 'MEYDAN' ? 'squares' : 'plans');
      }
    }
  }
});
