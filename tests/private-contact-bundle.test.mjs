import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('virtual leadership cards do not hard-code telephone numbers in client source', () => {
  const source = readFileSync(new URL('../src/pages/CommandCenterScreen.jsx', import.meta.url), 'utf8');
  const leaders = source.match(/const VIRTUAL_LEADERS = \{[\s\S]*?\n\};/)?.[0] || '';
  assert.ok(leaders, 'virtual leadership data exists');
  assert.doesNotMatch(leaders, /(?:phone|telefon)\s*:\s*['"]\+?\d{7,}/i);
});
