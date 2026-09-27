import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { ROLE_MATRIX } from '../src/domain/roleMatrix.js';

const localEnv = fs.existsSync('.env.supabase.local') ? Object.fromEntries(
  fs.readFileSync('.env.supabase.local', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
): {};
const env = { ...localEnv, ...process.env };

if (!env.SUPABASE_DB_URL) for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD']) {
  if (!env[key]) throw new Error(`Missing ${key}`);
}

const connection = env.SUPABASE_DB_URL ? { connectionString: env.SUPABASE_DB_URL } : {
  host: env.SUPABASE_DB_HOST || 'aws-0-eu-central-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: `postgres.${env.SUPABASE_PROJECT_REF}`,
  password: env.SUPABASE_DB_PASSWORD,
};
const localDatabase = env.SUPABASE_DB_URL && /(?:localhost|127\.0\.0\.1)/.test(env.SUPABASE_DB_URL);
const client = new pg.Client({
  ...connection,
  ssl: localDatabase ? false : {
    ca: fs.readFileSync('supabase/certs/prod-ca-2021.crt', 'utf8'),
    rejectUnauthorized: true,
  },
});

const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const prefix = `syp-rls-${suffix}`;
const roles = ['admin', 'manager', 'data_entry', 'chief', 'viewer'];
const ids = Object.fromEntries(roles.map((role) => [role, `${prefix}-${role}`]));
const people = {
  meydan: `${prefix}-person-meydan`,
  yerinde: `${prefix}-person-yerinde`,
};
const capabilityMap = {
  read: 'canRead',
  write_records: 'canWrite',
  view_phone: 'canViewPhone',
  add_notes: 'canAddNotes',
  manage_users: 'canManageUsers',
  manage_settings: 'canManageSettings',
  archive_records: 'canDelete',
};

function claimsFor(id) {
  return JSON.stringify({
    sub: id,
    iss: 'https://securetoken.google.com/foodsense-e1bf6',
    aud: 'foodsense-e1bf6',
  });
}

async function assumeFirebaseIdentity(id) {
  await client.query('set local role anon');
  await client.query("select set_config('request.jwt.claims', $1, true)", [claimsFor(id)]);
}

async function resetDatabaseRole() {
  await client.query('reset role');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

await client.connect();
let began = false;
try {
  await client.query('begin');
  began = true;
  for (const role of roles) {
    await client.query(
      `insert into public.app_users(id, display_name, role, unit_id, active)
       values($1, $2, $3, $4, true)`,
      [ids[role], `RLS ${role}`, role, role === 'chief' ? 'MEYDAN' : null],
    );
  }
  await client.query(
    `insert into public.personnel(id, unit_id, full_name, title)
     values ($1, 'MEYDAN', 'Geçici Meydan', 'Test'),
            ($2, 'YERINDE_COZUM', 'Geçici Yerinde', 'Test')`,
    [people.meydan, people.yerinde],
  );
  await client.query(
    `insert into public.personnel_private(personnel_id, phone)
     values($1, '0000000000')`,
    [people.meydan],
  );
  await client.query(
    `insert into public.field_updates(id,title,description,unit_id,occurred_at)
     values($1,'Meydan güncellemesi','RLS testi','MEYDAN',now()),
           ($2,'Yerinde güncellemesi','RLS testi','YERINDE_COZUM',now())`,
    [`${prefix}-field-meydan`, `${prefix}-field-yerinde`],
  );
  await client.query(
    `insert into public.record_notes(table_name,record_id,note,author_id,author_label)
     values('personnel',$1,'Meydan notu',$3,'RLS'),
           ('personnel',$2,'Yerinde notu',$3,'RLS')`,
    [people.meydan, people.yerinde, ids.admin],
  );

  const results = [];
  for (const [roleIndex, role] of roles.entries()) {
    await assumeFirebaseIdentity(ids[role]);
    const resolved = await client.query('select public.current_role() as role, public.current_unit() as unit');
    assertEqual(resolved.rows[0].role, role, `${role} role resolution`);
    assertEqual(resolved.rows[0].unit, role === 'chief' ? 'MEYDAN' : null, `${role} unit resolution`);

    for (const [databaseCapability, uiCapability] of Object.entries(capabilityMap)) {
      const capability = await client.query('select public.role_capability($1) as allowed', [databaseCapability]);
      assertEqual(capability.rows[0].allowed, ROLE_MATRIX[role][uiCapability], `${role} ${databaseCapability} capability`);
    }

    const profiles = await client.query('select count(*)::int as count from public.app_users where id like $1', [`${prefix}%`]);
    const personnel = await client.query('select count(*)::int as count from public.personnel where id in ($1,$2)', [people.meydan, people.yerinde]);
    const phones = await client.query('select count(phone)::int as count from public.personnel_private where personnel_id=$1', [people.meydan]);
    const expectedPersonnel = role === 'chief' ? 1 : 2;
    const expectedPhones = ['admin', 'manager'].includes(role) ? 1 : 0;
    const expectedProfiles = role === 'admin' ? roles.length : 1;
    assertEqual(profiles.rows[0].count, expectedProfiles, `${role} profile visibility`);
    assertEqual(personnel.rows[0].count, expectedPersonnel, `${role} personnel visibility`);
    assertEqual(phones.rows[0].count, expectedPhones, `${role} phone visibility`);
    const fieldUpdates = await client.query('select count(*)::int as count from public.field_updates where id like $1', [`${prefix}-field-%`]);
    const notes = await client.query('select count(*)::int as count from public.record_notes where record_id in ($1,$2)', [people.meydan, people.yerinde]);
    assertEqual(fieldUpdates.rows[0].count, role === 'chief' ? 1 : 2, `${role} field-update visibility`);
    assertEqual(notes.rows[0].count, role === 'chief' ? 1 : 2, `${role} record-note visibility`);

    await client.query('savepoint base_write_check');
    let canWriteBaseData = true;
    try {
      await client.query(
        `insert into public.service_points(id, name, district_id)
         values($1, 'Geçici RLS Noktası', 'FATIH')`,
        [`${prefix}-point-${role}`],
      );
    } catch {
      canWriteBaseData = false;
      await client.query('rollback to savepoint base_write_check');
    }
    assertEqual(canWriteBaseData, ROLE_MATRIX[role].canWrite, `${role} base-data write permission`);

    await client.query('savepoint task_write_check');
    let canManageTasks = true;
    try {
      await client.query(
        `insert into public.tracked_work(id, title, responsible, unit_id, participants, work_date)
         values($1, 'Geçici RLS İşi', 'Test', 'MEYDAN', array['MEYDAN'], current_date)`,
        [`${prefix}-task-${role}`],
      );
    } catch {
      canManageTasks = false;
      await client.query('rollback to savepoint task_write_check');
    }
    assertEqual(canManageTasks, ROLE_MATRIX[role].canManageTasks, `${role} task permission`);

    await client.query('savepoint plan_write_check');
    let canManagePlans = true;
    try {
      const startHour = 8 + (roleIndex * 2);
      await client.query(
        `insert into public.plans(id, personnel_id, unit_id, work_date, starts_at, ends_at, district_id, place, participants)
         values($1, $2, 'MEYDAN', current_date, $3, $4, 'FATIH', 'Geçici RLS Planı', array['MEYDAN'])`,
        [`${prefix}-plan-${role}`, people.meydan, `${startHour}:00`, `${startHour + 1}:00`],
      );
    } catch {
      canManagePlans = false;
      await client.query('rollback to savepoint plan_write_check');
    }
    assertEqual(canManagePlans, ROLE_MATRIX[role].canOverridePlan, `${role} plan permission`);

    await client.query('savepoint note_write_check');
    let canAddNotes = true;
    try {
      await client.query(
        `insert into public.record_notes(table_name,record_id,note,author_id,author_label)
         values('personnel',$1,'Rol notu',$2,$3)`,
        [people.meydan, ids[role], `RLS ${role}`],
      );
    } catch {
      canAddNotes = false;
      await client.query('rollback to savepoint note_write_check');
    }
    assertEqual(canAddNotes, ROLE_MATRIX[role].canAddNotes, `${role} note permission`);
    await client.query('rollback to savepoint note_write_check');
    await resetDatabaseRole();
    results.push({ role, profiles: expectedProfiles, personnel: expectedPersonnel, phones: expectedPhones, canWriteBaseData, canManageTasks, canManagePlans, canAddNotes });
  }

  await assumeFirebaseIdentity(ids.admin);
  await client.query('savepoint atomic_batch_check');
  let batchRejected = false;
  try {
    const payload = [
      { payload: { id: `${prefix}-atomic-valid`, title: 'Atomik geçerli', responsible: 'RLS', unit_id: 'MEYDAN', participants: ['MEYDAN'], work_date: '2026-09-27', status: 'Bekliyor', closing_note: '', archived: false, extra: {}, version: 1, created_at: new Date().toISOString(), updated_by: ids.admin }, expectedVersion: null },
      { payload: { id: `${prefix}-atomic-invalid`, title: 'Atomik geçersiz', responsible: 'RLS', unit_id: 'MEYDAN', participants: ['MEYDAN'], work_date: '2026-09-27', status: 'GEÇERSİZ', closing_note: '', archived: false, extra: {}, version: 1, created_at: new Date().toISOString(), updated_by: ids.admin }, expectedVersion: null },
    ];
    await client.query('select public.save_syp_records_atomic($1,$2::jsonb)', ['tasks', JSON.stringify(payload)]);
  } catch {
    batchRejected = true;
    await client.query('rollback to savepoint atomic_batch_check');
  }
  assertEqual(batchRejected, true, 'invalid atomic batch rejection');
  const atomicRows = await client.query('select count(*)::int as count from public.tracked_work where id like $1', [`${prefix}-atomic-%`]);
  assertEqual(atomicRows.rows[0].count, 0, 'atomic batch rollback');
  await resetDatabaseRole();

  const stagedPhotoPath = `MEYDAN/tasks/${crypto.randomUUID()}.jpg`;
  await assumeFirebaseIdentity(ids.data_entry);
  await client.query('select public.stage_record_photo_upload($1)', [stagedPhotoPath]);
  await resetDatabaseRole();
  const stagedPhoto = await client.query('select count(*)::int as count from public.record_photo_gc where path=$1 and reason=$2', [stagedPhotoPath, 'staged_upload']);
  assertEqual(stagedPhoto.rows[0].count, 1, 'data_entry durable photo staging');

  await assumeFirebaseIdentity(ids.viewer);
  await client.query('savepoint photo_stage_permission_check');
  let viewerPhotoStageRejected = false;
  try {
    await client.query('select public.stage_record_photo_upload($1)', [`MEYDAN/tasks/${crypto.randomUUID()}.jpg`]);
  } catch {
    viewerPhotoStageRejected = true;
    await client.query('rollback to savepoint photo_stage_permission_check');
  }
  assertEqual(viewerPhotoStageRejected, true, 'viewer photo staging rejection');
  await resetDatabaseRole();

  process.stdout.write(`${JSON.stringify({ verified: true, rolledBack: true, durablePhotoSaga: true, roles: results }, null, 2)}\n`);
} finally {
  if (began) {
    await resetDatabaseRole().catch(() => {});
    await client.query('rollback').catch(() => {});
  }
  await client.end();
}
