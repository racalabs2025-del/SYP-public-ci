import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('mobile zoom remains available and deployment sends baseline security headers', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale/);
  const headers = Object.fromEntries(vercel.headers[0].headers.map(item => [item.key, item.value]));
  for (const name of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']) assert.ok(headers[name], name);
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
});

test('field photo dialog exposes a modal label and keyboard close behavior', () => {
  const source = readFileSync(new URL('../src/components/operations/FieldUpdatesView.jsx', import.meta.url), 'utf8');
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /onCancel=/);
  assert.match(source, /event\.key === 'Escape'/);
});

test('record notes expose loading and read-error feedback instead of swallowing failures', () => {
  const source = readFileSync(new URL('../src/components/operations/CommandRecordForm.jsx', import.meta.url), 'utf8');
  assert.match(source, /Notlar yükleniyor…/);
  assert.match(source, /Notlar okunamadı:/);
  assert.doesNotMatch(source, /loadRecordNotes\([^;]+\(\) => \{\}\)/s);
});
