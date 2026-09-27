import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOperations, buildPreview, clampDateRange, dateRange, KINDS, LABELS, latestRecordTimestamp, NOTE_CONTEXT_TYPES, normalizeRecord, planInterval, planLocationLabel, planScopeLabel, plansOverlap, previousDateRange, validateRecord, validDate } from '../src/domain/commandCenter.js';
import { getPermissionsForRole, PANEL_ROLES } from '../src/domain/authContracts.js';
import { permissionsForRole } from '../src/utils/permissions.js';
import { ROLE_MATRIX } from '../src/domain/roleMatrix.js';
import { readFileSync } from 'node:fs';
import { readCommandWorkbook } from '../src/domain/commandImport.js';
import { adaptPlan } from '../src/domain/commandCatalog.js';
import writeExcelFile from 'write-excel-file/node';

const catalog = { personnel: [{ personelId: 'P-1', sistemPersonelKodu: '001' }], districts: [{ id: 'kadikoy' }, { id: 'fatih' }], neighborhoods: [{ id: 'kadikoy-moda', districtId: 'kadikoy' }], squares: [{ id: 'meydan-1', districtId: 'kadikoy' }] };
const plan = { recordId: 'V-1', personelId: 'P-1', birimId: 'MEYDAN', tarih: '2026-09-23', baslangic: '08:00', bitis: '16:00', ilceId: 'kadikoy', mahalleId: '', meydanId: '', gorevYeri: 'Meydan', ekip: '' };
const work = { recordId: 'W-1', birimId: 'MEYDAN', tarih: '2026-09-23', ilceId: 'kadikoy', gorevYeri: 'Meydan', baslik: 'Aydınlatma', sorumlu: 'Merkez', hedefTarih: '2026-09-25', durum: 'Bekliyor' };
test('Published Excel templates match the parser and contain no invented input records', async () => {
  for (const kind of Object.keys(KINDS)) await assert.rejects(readCommandWorkbook(readFileSync(`public/templates/syp-${kind}.xlsx`), kind), /doldurulmuş kayıt yok/);
});
test('Excel numeric dates/times parse correctly and blank rows retain original row numbers', async () => {
  const headers = KINDS.plans.fields.map((field) => LABELS[field]);
  const dateCell = { type: Date, value: new Date(Date.UTC(2026, 8, 23)), format: 'yyyy-mm-dd' };
  const startCell = { type: Date, value: new Date(Date.UTC(1899, 11, 30, 8)), format: 'hh:mm' };
  const endCell = { type: Date, value: new Date(Date.UTC(1899, 11, 30, 16)), format: 'hh:mm' };
  const values = { ...plan, tarih: dateCell, baslangic: startCell, bitis: endCell };
  const workbook = await writeExcelFile([
    headers,
    Array(headers.length).fill(''),
    KINDS.plans.fields.map((field) => values[field] ?? ''),
  ], { sheet: 'Veri' }).toBuffer();
  const rows = await readCommandWorkbook(workbook, 'plans');
  assert.equal(rows[0].tarih, '2026-09-23'); assert.equal(rows[0].baslangic, '08:00'); assert.equal(rows[0].bitis, '16:00');
  const preview = buildPreview('plans', rows, [], catalog)[0];
  assert.equal(preview.row, 3); assert.equal(preview.status, 'Yeni'); assert.deepEqual(preview.errors, []);
});
test('Excel imports reject formulas and numeric identifiers', async () => {
  const headers = KINDS.plans.fields.map((field) => LABELS[field]);
  const formulaRows = [headers, KINDS.plans.fields.map((field) => field === 'recordId' ? { type: 'Formula', value: '=1+1' } : 'x')];
  await assert.rejects(readCommandWorkbook(await writeExcelFile(formulaRows, { sheet: 'Veri' }).toBuffer(), 'plans'), /formül kullanmayın/);
  const numericRows = [headers, KINDS.plans.fields.map((field) => field === 'recordId' ? 12 : 'x')];
  await assert.rejects(readCommandWorkbook(await writeExcelFile(numericRows, { sheet: 'Veri' }).toBuffer(), 'plans'), /metin olarak girilmeli/);
});
test('Existing canonical shift aliases are readable without guessing unknown location', () => {
  const old = adaptPlan({ id: 'legacy', personelId: 'P-1', personelAdiSnapshot: 'Eski kayıt', baslangicTarihi: '2026-09-23', baslangicSaati: '08:00', bitisSaati: '16:00', ilceIds: ['kadikoy'] });
  assert.equal(old.tarih, plan.tarih); assert.equal(old.baslangic, plan.baslangic); assert.equal(old.ilceId, 'kadikoy'); assert.equal(old.adSoyad, 'Eski kayıt'); assert.equal(old.mahalleId, '');
});
test('Non-district plans use a readable scope and never present the raw scope code', () => {
  const regionalPlan = { ...plan, planKapsami: 'BOLGE', kapsamAdi: '2. Bölge', gorevYeri: 'Saha taraması' };
  assert.equal(planScopeLabel(regionalPlan), 'Bölge planı');
  assert.equal(planLocationLabel(regionalPlan), '2. Bölge');
  assert.equal(planLocationLabel(plan), 'Meydan');
});
test('Field updates have a focused daily contract and require a real time', () => {
  assert.deepEqual(KINDS.fieldUpdates.fields, ['recordId', 'baslik', 'aciklama', 'birimId', 'ekip', 'tarih', 'saat', 'ilceId', 'mahalleId', 'meydanId', 'cozumNoktasiId']);
  const valid = { recordId: 'F-1', baslik: 'Saha bildirimi', aciklama: 'Kısa saha notu', birimId: 'MEYDAN', ekip: 'Avrupa', tarih: '2026-09-26', saat: '08:30', ilceId: 'kadikoy', mahalleId: '', meydanId: '', cozumNoktasiId: '', fotoUrl: '' };
  assert.deepEqual(validateRecord('fieldUpdates', valid, catalog), []);
  assert.match(validateRecord('fieldUpdates', { ...valid, saat: '8:30' }, catalog).join(' '), /Saat/);
});
test('Freshness uses the most recent record timestamp and ignores invalid values', () => {
  assert.equal(latestRecordTimestamp([{ updatedAt: '2026-09-20T09:00:00Z' }, { created_at: '2026-09-21T11:00:00Z' }, { updatedAt: 'not-a-date' }]), '2026-09-21T11:00:00Z');
  assert.equal(latestRecordTimestamp([{ updatedAt: 'invalid' }]), '');
});
test('Person codes resolving to the same ID are duplicates', () => {
  const rows = ['P-1', '001'].map((personelId) => ({personelId, adSoyad: 'Kişi', telefon: '05000000000', birimId:'MEYDAN'}));
  assert.ok(buildPreview('personnel', rows, [], catalog).every((p) => p.errors.some((e) => e.includes('birden fazla'))));
});
test('Approved roles; unknown/editor never gain access', () => {
  assert.deepEqual(PANEL_ROLES, ['admin', 'manager', 'data_entry', 'chief', 'viewer']);
  for (const role of ['editor', null, 'ADMIN', 'unknown']) assert.equal(permissionsForRole(role).canWrite, false);
  assert.equal(getPermissionsForRole('editor').canRead, false);
  assert.equal(permissionsForRole('viewer').canRead, true);
  assert.equal(permissionsForRole('admin').canWrite, true);
});
test('Role matrix keeps central writes, private phones and notes separate', () => {
  const manager = permissionsForRole('manager');
  const chief = permissionsForRole('chief', 'YERINDE_COZUM');
  const entry = permissionsForRole('data_entry');
  const viewer = permissionsForRole('viewer');
  assert.deepEqual([manager.canWrite, manager.canViewPhone, manager.canAddNotes], [false, true, true]);
  assert.deepEqual([chief.canWrite, chief.canViewPhone, chief.canAddNotes, chief.unitId], [false, false, true, 'YERINDE_COZUM']);
  assert.deepEqual([entry.canWrite, entry.canImport, entry.canAddNotes], [true, true, false]);
  assert.deepEqual([viewer.canWrite, viewer.canViewPhone, viewer.canAddNotes], [false, false, false]);
  for (const role of PANEL_ROLES) {
    const permissions = permissionsForRole(role, role === 'chief' ? 'MEYDAN' : '');
    for (const [capability, expected] of Object.entries(ROLE_MATRIX[role])) {
      assert.equal(permissions[capability], expected, `${role}.${capability}`);
    }
  }
});
test('Date boundaries use Istanbul day, calendar week, clamp large ranges and validate dates', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.deepEqual(dateRange('week', '2026-09-23'), { from: '2026-09-21', to: '2026-09-27' });
  assert.equal(dateRange('month', '2026-09-23').from, '2026-09-01');
  assert.deepEqual(clampDateRange('2026-09-01', '2026-09-20', 90, '2026-09-23'), { from: '2026-09-01', to: '2026-09-20', clamped: false });
  assert.deepEqual(clampDateRange('', '', 90, '2026-09-23'), { from: '2026-09-23', to: '2026-09-23', clamped: false });
  const clamped = clampDateRange('2026-01-01', '2026-12-31', 90, '2026-09-23');
  assert.equal(clamped.clamped, true);
  assert.equal(clamped.from, '2026-01-01');
  assert.equal(clamped.to, '2026-04-01');
  assert.deepEqual(previousDateRange('2026-09-21', '2026-09-27'), { from: '2026-09-14', to: '2026-09-20' });
  assert.deepEqual(previousDateRange('2026-09-01', '2026-09-30'), { from: '2026-08-02', to: '2026-08-31' });
});
test('Tracked work requires a closure note when completed', () => {
  assert.deepEqual(validateRecord('tasks', normalizeRecord('tasks', work), catalog), []);
  assert.match(validateRecord('tasks', normalizeRecord('tasks', { ...work, durum: 'Tamamlandı', kapanisNotu: '  ' }), catalog).join(), /kapanış notu/);
  assert.deepEqual(validateRecord('tasks', normalizeRecord('tasks', { ...work, durum: 'Tamamlandı', kapanisNotu: 'Merkez teyidiyle tamamlandı.' }), catalog), []);
});
test('Invalid cross-district neighborhood and square are rejected', () => {
  assert.match(validateRecord('plans', { ...plan, ilceId: 'fatih', mahalleId: 'kadikoy-moda', meydanId: 'meydan-1' }, catalog).join(), /Mahalle.*Meydan/);
  assert.match(validateRecord('plans', { ...plan, personelId: 'missing' }, catalog).join(), /Personel kodu/);
});
test('Adjacent shifts allowed, overlapping and overnight shifts rejected', () => {
  assert.equal(plansOverlap(plan, { ...plan, recordId: 'V-2', baslangic: '16:00', bitis: '23:00' }), false);
  assert.equal(plansOverlap(plan, { ...plan, recordId: 'V-2', baslangic: '15:59' }), true);
  const night = { ...plan, baslangic: '22:00', bitis: '06:00' };
  assert.equal(planInterval(night).end - planInterval(night).start, 8 * 3600000);
  assert.equal(plansOverlap(night, { ...plan, recordId: 'V-2', tarih: '2026-09-24', baslangic: '05:00' }), true);
});
test('Preview distinguishes new, unchanged, edits, duplicate IDs and collisions', () => {
  assert.equal(buildPreview('plans', [plan], [], catalog)[0].status, 'Yeni');
  assert.equal(buildPreview('plans', [plan], [plan], catalog)[0].status, 'Aynı');
  assert.equal(buildPreview('plans', [{ ...plan, gorevYeri: 'Yeni yer' }], [plan], catalog)[0].status, 'Değişen');
  assert.ok(buildPreview('plans', [plan, plan], [], catalog).every((p) => p.status === 'Hatalı'));
  assert.equal(buildPreview('plans', [plan], [{ ...plan, recordId: 'V-2' }], catalog)[0].status, 'Hatalı');
  assert.equal(buildPreview('plans', [{ ...plan, personelId: '001' }], [], catalog)[0].record.personelId, 'P-1');
});
test('Plans do not create activities, city people are deduplicated, neighborhood excludes unlocated records', () => {
  const plans = [plan, { ...plan, recordId: 'V-2', tarih: '2026-09-24', ilceId: 'fatih' }];
  const filter = { from: '2026-09-23', to: '2026-09-24' };
  const scope = aggregateOperations(plans, [], [work], filter);
  assert.equal(scope.people, 1); assert.equal(scope.districtPeople.length, 2); assert.equal(scope.activities.length, 0);
  assert.equal(scope.tasks.length, 1);
  assert.equal(aggregateOperations(plans, [], [], { ...filter, neighborhood: 'kadikoy-moda' }).people, 0);
});
test('Selected weekly work requires a title and confirmation metadata', () => {
  const a = normalizeRecord('activities', { ...plan, yapilanIs: 'Ziyaret', sonuc: 'Tamamlandı', teyitEden: 'Merkez', teyitTarihi: '2026-09-23' });
  assert.deepEqual(validateRecord('activities', a, catalog), []);
  assert.deepEqual(validateRecord('activities', { ...a, personelId: '', ekip: '', sonuc: '' }, catalog), []);
  assert.match(validateRecord('activities', { ...a, teyitEden: '', teyitTarihi: '' }, catalog).join(' '), /Bilgiyi İleten.*İletim Tarihi/);
  assert.match(validateRecord('activities', { ...a, yapilanIs: '' }, catalog).join(), /Çalışma Başlığı/);
});
test('District and neighborhood are the only non-record note contexts', () => {
  assert.deepEqual(NOTE_CONTEXT_TYPES, ['district', 'neighborhood']);
});
test('Photo must use HTTPS; unknown unit and malformed time do not become defaults', () => {
  assert.match(validateRecord('activities', normalizeRecord('activities', { ...plan, fotoUrl: 'javascript:alert(1)' }), catalog).join(), /HTTPS/);
  assert.match(validateRecord('plans', { ...plan, birimId: 'OTHER', baslangic: '25:00' }, catalog).join(), /birim.*Başlangıç/);
});
