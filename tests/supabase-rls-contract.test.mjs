import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrations = Object.fromEntries([
  '202609240001_core_saha_model.sql',
  '202609240003_private_phone_policies.sql',
  '202609240005_firebase_auth_identity.sql',
  '202609240006_firebase_rls_bootstrap.sql',
  '202609240008_plan_and_unit_rules.sql',
  '202609240012_plan_overlap_consistency.sql',
  '202609240011_solution_points.sql',
  '202609250015_realtime_scope.sql',
  '202609250016_role_write_alignment.sql',
  '202609270005_firebase_rls_role_compatibility.sql',
  '202609270006_role_capability_matrix.sql',
  '202609270007_note_contexts_and_contract.sql',
  '202609270008_atomic_writes_and_least_privilege.sql',
  '202609270009_durable_record_photo_saga.sql',
  '202609270010_fix_photo_saga_identity_guard.sql',
].map((name) => [name, readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8').toLowerCase()]));

const core = migrations['202609240001_core_saha_model.sql'];
const identity = migrations['202609240005_firebase_auth_identity.sql'];
const bootstrap = migrations['202609240006_firebase_rls_bootstrap.sql'];
const phone = migrations['202609240003_private_phone_policies.sql'];
const overlap = migrations['202609240012_plan_overlap_consistency.sql'];
const solutionPoints = migrations['202609240011_solution_points.sql'];
const realtimeScope = migrations['202609250015_realtime_scope.sql'];
const roleWriteAlignment = migrations['202609250016_role_write_alignment.sql'];
const firebaseRoleCompatibility = migrations['202609270005_firebase_rls_role_compatibility.sql'];
const roleCapabilityMatrix = migrations['202609270006_role_capability_matrix.sql'];
const noteContexts = migrations['202609270007_note_contexts_and_contract.sql'];
const atomicWrites = migrations['202609270008_atomic_writes_and_least_privilege.sql'];
const photoSaga = migrations['202609270009_durable_record_photo_saga.sql'];
const photoSagaIdentityFix = migrations['202609270010_fix_photo_saga_identity_guard.sql'];

test('Supabase product tables enable row-level security', () => {
  for (const table of ['units', 'app_users', 'personnel', 'personnel_private', 'plans', 'activities', 'tracked_work', 'record_history', 'unit_field_schemas', 'legacy_review']) {
    assert.match(core, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  }
  assert.match(solutionPoints, /alter table public\.service_points enable row level security/);
  assert.match(bootstrap, /alter table public\.unit_data_status enable row level security/);
});

test('Firebase identity guard restricts Supabase JWT access to the configured issuer', () => {
  assert.match(identity, /auth\.jwt\(\)->>'iss'\s*=\s*'https:\/\/securetoken\.google\.com\/foodsense-e1bf6'/);
  assert.match(identity, /auth\.jwt\(\)->>'aud'\s*=\s*'foodsense-e1bf6'/);
  assert.match(identity, /create policy firebase_identity_guard on public\.%i as restrictive/);
  assert.match(bootstrap, /alter policy %i on %i\.%i to anon, authenticated/);
});

test('policies added after the Firebase bootstrap remain available to Firebase anon tokens', () => {
  assert.match(firebaseRoleCompatibility, /tablename in \([\s\S]*?'plans'[\s\S]*?'tracked_work'[\s\S]*?'record_history'[\s\S]*?'record_notes'[\s\S]*?'field_updates'/);
  assert.match(firebaseRoleCompatibility, /alter policy %i on %i\.%i to anon, authenticated/);
  assert.match(firebaseRoleCompatibility, /firebase_identity_guard on public\.field_updates as restrictive/);
  assert.match(firebaseRoleCompatibility, /firebase_identity_guard on public\.record_notes as restrictive/);
  assert.match(firebaseRoleCompatibility, /grant select, insert, update on public\.field_updates to anon, authenticated/);
  assert.match(firebaseRoleCompatibility, /grant select, insert on public\.record_notes to anon, authenticated/);
});

test('private phone reads and writes require a manager policy; audit excludes phone values', () => {
  assert.match(core, /personnel_private_manager_read on public\.personnel_private for select[\s\S]*?public\.is_manager\(\)/);
  assert.match(phone, /personnel_private_manager_insert on public\.personnel_private for insert[\s\S]*?public\.is_manager\(\)/);
  assert.match(phone, /personnel_private_manager_update on public\.personnel_private for update[\s\S]*?public\.is_manager\(\)/);
  assert.match(identity, /to_jsonb\(old\)-'phone'/);
  assert.match(identity, /to_jsonb\(new\)-'phone'/);
});

test('deactivation and plan-overlap exceptions retain admin and manager controls', () => {
  assert.match(identity, /old_json->'archived'[\s\S]*?public\.current_role\(\)<>'admin'/);
  assert.match(overlap, /actor_role<>'admin'[\s\S]*?actor_role<>'manager'/);
  assert.match(overlap, /length\(trim\(coalesce\(new\.override_explanation,''\)\)\)=0/);
});

test('application roles cannot delete or truncate product records through the API', () => {
  assert.match(bootstrap, /revoke delete,truncate on public\.units,public\.app_users,public\.personnel,public\.personnel_private,[\s\S]*?from anon,authenticated/);
  assert.match(solutionPoints, /revoke delete,truncate on public\.service_points from anon,authenticated/);
});

test('Realtime publication is narrowed to live operational tables', () => {
  assert.match(realtimeScope, /array\['plans', 'activities', 'tracked_work'\]/);
  for (const table of ['units', 'app_users', 'personnel', 'personnel_private', 'record_history', 'unit_field_schemas', 'legacy_review', 'unit_data_status', 'service_points']) {
    assert.match(realtimeScope, new RegExp(`'${table}'`));
  }
  assert.match(realtimeScope, /alter publication supabase_realtime drop table/);
});

test('base-data writes exclude managers while plan and task policies remain explicit', () => {
  assert.match(roleWriteAlignment, /current_role\(\) in \('admin','data_entry'\)/);
  assert.doesNotMatch(roleWriteAlignment, /'manager'/);
  const centralEntryOnly = readFileSync('supabase/migrations/202609260001_central_data_entry_only.sql', 'utf8');
  assert.match(centralEntryOnly, /tasks_write[\s\S]*?public\.can_write_records\(\)/);
  assert.match(centralEntryOnly, /plans_write[\s\S]*?public\.can_write_records\(\)/);
  assert.doesNotMatch(centralEntryOnly, /current_role\(\)='manager'/);
});

test('database capabilities mirror the central UI role matrix', () => {
  assert.match(roleCapabilityMatrix, /when 'read' then public\.current_role\(\) in \('admin','manager','data_entry','chief','viewer'\)/);
  assert.match(roleCapabilityMatrix, /when 'write_records' then public\.current_role\(\) in \('admin','data_entry'\)/);
  assert.match(roleCapabilityMatrix, /when 'view_phone' then public\.current_role\(\) in \('admin','manager'\)/);
  assert.match(roleCapabilityMatrix, /when 'add_notes' then public\.current_role\(\) in \('admin','manager','chief'\)/);
  assert.match(roleCapabilityMatrix, /record_notes_insert[\s\S]*?public\.role_capability\('add_notes'\)/);
});

test('note contexts and activity confirmation match the UI/import contract', () => {
  assert.match(noteContexts, /'field_updates', 'service_points', 'district', 'neighborhood'/);
  assert.match(noteContexts, /validate constraint activities_confirmed_by_nonempty/);
});

test('record/import writes are transactional and grants stay least-privilege', () => {
  assert.match(atomicWrites, /save_syp_records_atomic\(p_kind text, p_records jsonb\)/);
  assert.match(atomicWrites, /security invoker/);
  assert.match(atomicWrites, /jsonb_array_length\(p_records\) not between 1 and 500/);
  assert.match(atomicWrites, /insert into public\.personnel_private[\s\S]*?on conflict\(personnel_id\) do update/);
  assert.match(atomicWrites, /revoke all on public\.field_updates,public\.record_notes from anon,authenticated/);
  assert.match(atomicWrites, /revoke delete,truncate on public\.units[\s\S]*?public\.record_notes[\s\S]*?from anon,authenticated/);
  assert.match(atomicWrites, /record_notes_read[\s\S]*?can_read_record_note\(table_name,record_id\)/);
  assert.match(atomicWrites, /syp_records_delete[\s\S]*?public\.can_write_records\(\)/);
});

test('record photos use a durable staged-upload and cleanup saga', () => {
  assert.match(photoSaga, /create table if not exists public\.record_photo_gc/);
  assert.match(photoSaga, /alter table public\.record_photo_gc enable row level security/);
  assert.match(photoSaga, /stage_record_photo_upload\(p_path text\)/);
  assert.match(photoSaga, /not public\.role_capability\('write_records'\)/);
  for (const table of ['personnel', 'activities', 'field_updates', 'tracked_work']) {
    assert.match(photoSaga, new RegExp(`on public\\.${table}`));
  }
  assert.match(photoSaga, /insert into public\.record_photo_gc\(path,delete_after,reason,created_by\)/);
  assert.match(photoSaga, /delete from public\.record_photo_gc where path=new_path/);
  assert.match(photoSagaIdentityFix, /public\.is_syp_firebase_identity\(\)/);
});
