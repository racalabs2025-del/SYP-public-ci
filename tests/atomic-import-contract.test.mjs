import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const importer = readFileSync(new URL('../src/components/operations/CommandImport.jsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/services/supabaseCommandCenterService.js', import.meta.url), 'utf8');

test('the import UI commits one RPC-backed batch and reports rollback as a batch', () => {
  assert.match(importer, /saveRecordsAtomic\(kind, selectedRows/);
  assert.doesNotMatch(importer, /for \(const p of preview[\s\S]*?saveRecord/);
  assert.match(importer, /Hiçbir kayıt kaydedilmedi/);
});

test('single-record saves use the same atomic RPC and stage uploaded photos durably', () => {
  assert.match(service, /rpc\('save_syp_records_atomic'/);
  assert.match(service, /rpc\('stage_record_photo_upload'/);
  assert.match(service, /await removeUploadedPhotos\(prepared\.map\(item => item\.uploadedPath\)\)/);
  assert.match(service, /\$\{unitId\}\/\$\{kind\}\/\$\{crypto\.randomUUID\(\)\}\.jpg/);
});
