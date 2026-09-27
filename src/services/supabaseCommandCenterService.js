import { supabase } from '../supabaseClient.js';
import { auth } from '../firebaseAuth.js';
import { KINDS, NOTE_CONTEXT_TYPES, SOLUTION_POINTS_UNIT, normalizeRecord, validateRecord } from '../domain/commandCenter.js';
import { formatIstanbulDateTime, startOfIstanbulDay, startOfNextIstanbulDay } from '../domain/fieldUpdateTime.js';
import { subscribeSharedRows } from './sharedLiveRows.js';
import { collectAllPages } from '../domain/pagination.js';

const PAGE_SIZE = 500;
const ROW_CACHE_TTL = 15_000;
const rowsCache = new Map();
const rowRequests = new Map();
const tableEpochs = new Map();
export const PHONE_COLLECTION = 'personnel_private';
const TABLES = { units: 'units', servicePoints: 'service_points', personnel: 'personnel', plans: 'plans', activities: 'activities', fieldUpdates: 'field_updates', tasks: 'tracked_work', unitStatus: 'unit_data_status', phones: 'personnel_private' };
// Keep API responses narrow. extra/custom_fields are retained because the UI
// supports unit-specific fields, while private phone data is queried separately.
const COLUMNS = {
  units: 'id,name,active,created_at',
  servicePoints: 'id,unit_id,kind,name,district_id,neighborhood_id,square_id,address,description,latitude,longitude,working_hours,active,version,created_at,updated_at,updated_by,deactivated_at,deactivated_by',
  personnel: 'id,unit_id,service_point_id,full_name,title,team,status,archived,photo_path,custom_fields,version,created_at,updated_at,updated_by',
  plans: 'id,personnel_id,unit_id,service_point_id,work_date,starts_at,ends_at,scope_type,scope_name,district_id,neighborhood_id,square_id,place,canceled,archived,override_explanation,participants,extra,version,created_at,updated_at,updated_by',
  activities: 'id,unit_id,service_point_id,personnel_id,work_date,district_id,neighborhood_id,square_id,place,work_done,result,confirmed_by,confirmed_at,photo_path,participants,archived,extra,version,created_at,updated_at,updated_by',
  fieldUpdates: 'id,title,description,unit_id,team,occurred_at,district_id,neighborhood_id,square_id,service_point_id,photo_path,photo_removed,archived,version,created_at,updated_at',
  tasks: 'id,title,responsible,unit_id,participants,work_date,target_date,status,closing_note,closed_at,archived,extra,version,created_at,updated_at,updated_by',
  unitStatus: 'unit_id,first_record_at,has_data,updated_at',
  phones: 'personnel_id,phone,updated_at,updated_by',
};
const NAME_TO_KIND = Object.fromEntries(Object.entries(KINDS).map(([kind, def]) => [def.collection, kind]));
const client = () => { if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmamış.'); return supabase; };
export function invalidateRowsCache(kindOrTable) {
  const table = TABLES[kindOrTable] || kindOrTable;
  if (!table) return;
  tableEpochs.set(table, (tableEpochs.get(table) || 0) + 1);
  for (const [key, entry] of rowsCache) if (entry.table === table) rowsCache.delete(key);
}
const dateValue = (value) => typeof value === 'string' ? value.slice(0, 10) : value || '';
const asUi = (kind, r) => {
  if (kind === 'units') return { id: r.id, name: r.name, active: r.active, createdAt: r.created_at };
  if (kind === 'servicePoints') return { id: r.id, name: r.name, tip: r.kind || 'NOKTA', birimId: r.unit_id, ilceId: r.district_id, mahalleId: r.neighborhood_id, meydanId: r.square_id, adres: r.address, aciklama: r.description, latitude: r.latitude, longitude: r.longitude, calismaSaatleri: r.working_hours || {}, active: r.active, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by, deactivatedAt: r.deactivated_at, deactivatedBy: r.deactivated_by };
  if (kind === 'unitStatus') return { id: r.unit_id, birimId: r.unit_id, ilkKayitAt: r.first_record_at, veriVar: r.has_data, updatedAt: r.updated_at };
  if (kind === 'phones') return { id: r.personnel_id, personelId: r.personnel_id, telefon: r.phone, updatedAt: r.updated_at, updatedBy: r.updated_by };
  if (kind === 'personnel') return { ...r.custom_fields, id: r.id, personelId: r.id, sistemPersonelKodu: r.id, adSoyad: r.full_name, birimId: r.unit_id, cozumNoktasiId: r.service_point_id || '', unvan: r.title, ekip: r.team, durum: r.status, arsivli: r.archived, fotoUrl: r.photo_path || '', ozelAlanlar: r.custom_fields || {}, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by };
  if (kind === 'plans') return { ...(r.extra || {}), id: r.id, recordId: r.id, personelId: r.personnel_id, birimId: r.unit_id, cozumNoktasiId: r.service_point_id || '', tarih: dateValue(r.work_date), baslangic: String(r.starts_at).slice(0, 5), bitis: String(r.ends_at).slice(0, 5), planKapsami: r.scope_type || 'ILCE', kapsamAdi: r.scope_name || '', ilceId: r.district_id || '', mahalleId: r.neighborhood_id, meydanId: r.square_id, gorevYeri: r.place, iptal: r.canceled, arsivli: r.archived, cakismaAciklamasi: r.override_explanation, katilimciBirimIds: r.participants || [], katilimciBirimleri: (r.participants || []).filter(x => x !== r.unit_id).join(','), saatAraligi: `${String(r.starts_at).slice(0,5)} - ${String(r.ends_at).slice(0,5)}`, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by };
  if (kind === 'activities') return { ...(r.extra || {}), id: r.id, recordId: r.id, birimId: r.unit_id, cozumNoktasiId: r.service_point_id || '', personelId: r.personnel_id || '', tarih: dateValue(r.work_date), ilceId: r.district_id, mahalleId: r.neighborhood_id, meydanId: r.square_id, gorevYeri: r.place, yapilanIs: r.work_done, sonuc: r.result, teyitEden: r.confirmed_by, teyitTarihi: dateValue(r.confirmed_at), fotoUrl: r.photo_path || '', katilimciBirimIds: r.participants || [], katilimciBirimleri: (r.participants || []).filter(x => x !== r.unit_id).join(','), arsivli: r.archived, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by };
  if (kind === 'fieldUpdates') { const occurred = r.occurred_at || ''; const local = formatIstanbulDateTime(occurred); return { id: r.id, recordId: r.id, baslik: r.title, aciklama: r.description, birimId: r.unit_id, ekip: r.team || '', tarih: local.date, saat: local.time, ilceId: r.district_id || '', mahalleId: r.neighborhood_id || '', meydanId: r.square_id || '', cozumNoktasiId: r.service_point_id || '', fotoUrl: r.photo_path || '', photoRemoved: Boolean(r.photo_removed), arsivli: r.archived, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at }; }
  return { ...(r.extra || {}), id: r.id, recordId: r.id, baslik: r.title, sorumlu: r.responsible, birimId: r.unit_id || '', katilimciBirimIds: r.participants || [], tarih: dateValue(r.work_date), hedefTarih: dateValue(r.target_date), durum: r.status, kapanisNotu: r.closing_note, closedAt: r.closed_at, arsivli: r.archived, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by };
};
function kindFromName(name) { const base = String(name).split('/')[0]; return NAME_TO_KIND[base] || (base === PHONE_COLLECTION ? 'phones' : base === 'birimVeriDurumlari' ? 'unitStatus' : null); }
export function fromDatabaseRow(table, row) { const kind = TABLES[table] ? table : kindFromName(table); return kind ? asUi(kind, row) : row; }

async function fetchRows(kind, filters = {}) {
  if (!TABLES[kind] || !COLUMNS[kind]) throw new Error(`Desteklenmeyen Supabase veri kümesi: ${kind}`);
  let q = client().from(TABLES[kind]).select(COLUMNS[kind]);
  if (filters.from && ['plans', 'activities', 'tasks'].includes(kind)) q = q.gte('work_date', filters.from);
  if (filters.to && ['plans', 'activities', 'tasks'].includes(kind)) q = q.lte('work_date', filters.to);
  // occurred_at is timestamptz. Use explicit Istanbul offsets and an exclusive
  // next-day boundary so late-night records and UTC serialization are handled
  // consistently throughout the Saha Akışı.
  if (filters.from && kind === 'fieldUpdates') q = q.gte('occurred_at', startOfIstanbulDay(filters.from));
  if (filters.to && kind === 'fieldUpdates') q = q.lt('occurred_at', startOfNextIstanbulDay(filters.to));
  if (filters.personnelId && kind === 'plans') q = q.eq('personnel_id', filters.personnelId);
  if (filters.personnelIds?.length && kind === 'personnel') q = q.in('id', filters.personnelIds);
  if (filters.personnelIds?.length && kind === 'phones') q = q.in('personnel_id', filters.personnelIds);
  if (filters.search && kind === 'personnel') {
    const term = String(filters.search).normalize('NFC').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().slice(0, 100);
    if (term) {
      const pattern = `%${term}%`;
      const searchIds = (filters.searchIds || []).filter(id => /^[\p{L}\p{N}_-]{1,100}$/u.test(String(id))).slice(0, 200);
      q = q.or([`id.ilike.${pattern}`, `full_name.ilike.${pattern}`, `title.ilike.${pattern}`, `team.ilike.${pattern}`, ...(searchIds.length ? [`id.in.(${searchIds.join(',')})`] : [])].join(','));
    }
  }
  if (filters.search && kind === 'tasks') {
    const term = String(filters.search).normalize('NFC').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().slice(0, 100);
    if (term) {
      const pattern = `%${term}%`;
      q = q.or(`id.ilike.${pattern},title.ilike.${pattern},responsible.ilike.${pattern}`);
    }
  }
  if (filters.archivedOnly && !['unitStatus', 'phones', 'units', 'servicePoints'].includes(kind)) q = q.eq('archived', true);
  if (filters.includeArchived === false && !['unitStatus', 'phones', 'units', 'servicePoints'].includes(kind)) q = q.eq('archived', false);
  if (kind === 'servicePoints' && filters.activeOnly) q = q.eq('active', true);
  if (kind === 'servicePoints' && filters.districtId) q = q.eq('district_id', filters.districtId);
  if (filters.unitId && ['personnel', 'plans', 'activities', 'fieldUpdates', 'tasks'].includes(kind)) q = q.eq('unit_id', filters.unitId);
  if (filters.districtId && ['fieldUpdates', 'tasks'].includes(kind)) q = q.eq('district_id', filters.districtId);
  if (filters.unitId && kind === 'unitStatus') q = q.eq('unit_id', filters.unitId);
  if (filters.participantUnitId && ['plans', 'activities', 'tasks'].includes(kind)) q = q.contains('participants', [filters.participantUnitId]);
  if (kind === 'tasks' && filters.openOnly) q = q.neq('status', 'Tamamlandı');
  if (kind === 'tasks' && filters.closedFrom) q = q.gte('closed_at', `${filters.closedFrom}T00:00:00`);
  if (kind === 'tasks' && filters.closedTo) q = q.lte('closed_at', `${filters.closedTo}T23:59:59.999`);
  const orderColumn = kind === 'personnel' ? 'full_name' : kind === 'unitStatus' ? 'unit_id' : kind === 'phones' ? 'personnel_id' : kind === 'fieldUpdates' ? 'occurred_at' : 'id';
  let ordered = q.order(orderColumn, { ascending: kind !== 'fieldUpdates' });
  if (kind === 'personnel') ordered = ordered.order('id', { ascending: true });
  if (kind === 'fieldUpdates') ordered = ordered.order('id', { ascending: false });
  if (Number.isInteger(filters.pageSize)) {
    const pageSize = Math.min(200, Math.max(1, filters.pageSize));
    const offset = Math.max(0, Number.isInteger(filters.offset) ? filters.offset : 0);
    const { data, error } = await ordered.range(offset, offset + pageSize - 1);
    if (error) throw error;
    return data.map(row => asUi(kind, row));
  }
  const rows = await collectAllPages(async (offset, pageSize) => {
    const { data, error } = await ordered.range(offset, offset + pageSize - 1);
    if (error) throw error;
    return data || [];
  }, PAGE_SIZE);
  return rows.map(row => asUi(kind, row));
}

export async function getRows(kind, filters = {}) {
  if (!TABLES[kind] || !COLUMNS[kind]) throw new Error(`Desteklenmeyen Supabase veri kümesi: ${kind}`);
  // Private phone data is never retained in the shared in-memory cache.
  if (kind === 'phones') return fetchRows(kind, filters);
  const table = TABLES[kind];
  const uid = auth.currentUser?.uid || 'anonymous';
  const epoch = tableEpochs.get(table) || 0;
  const key = `${uid}:${table}:${epoch}:${stableFilterKey(filters)}`;
  const cached = rowsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  if (rowRequests.has(key)) return rowRequests.get(key);
  const request = fetchRows(kind, filters).then(rows => {
    if ((tableEpochs.get(table) || 0) === epoch) {
      const now = Date.now();
      for (const [cacheKey, entry] of rowsCache) if (entry.expiresAt <= now) rowsCache.delete(cacheKey);
      while (rowsCache.size >= 100) rowsCache.delete(rowsCache.keys().next().value);
      rowsCache.set(key, { table, rows, expiresAt: now + ROW_CACHE_TTL });
    }
    return rows;
  }).finally(() => rowRequests.delete(key));
  rowRequests.set(key, request);
  return request;
}

export async function getRowsPage(kind, filters = {}) {
  const pageSize = Math.min(200, Math.max(1, Number.isInteger(filters.pageSize) ? filters.pageSize : 100));
  const rows = await getRows(kind, { ...filters, pageSize });
  return { rows, hasMore: rows.length === pageSize };
}

export async function getRowById(kind, id) {
  if (!TABLES[kind] || !COLUMNS[kind] || !id) return null;
  const key = kind === 'phones' ? 'personnel_id' : 'id';
  const { data, error } = await client().from(TABLES[kind]).select(COLUMNS[kind]).eq(key, id).maybeSingle();
  if (error) throw error;
  return data ? asUi(kind, data) : null;
}

// Screens often request the same live slice (for example a profile and a
// drawer opened together). Share the initial read for identical slices.
const liveSlices = new Map();
// A screen may need several filtered slices from the same table (notably open,
// closed, and date-window tracked work). One table channel can invalidate all
// active slices and avoids opening one Realtime subscription per filter.
const liveTables = new Map();
function subscribeTableChanges(kind, onChange) {
  const table = TABLES[kind];
  let entry = liveTables.get(table);
  if (!entry) {
    entry = { listeners: new Set(), channel: null };
    entry.channel = client().channel(`syp-${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        invalidateRowsCache(table);
        for (const listener of entry.listeners) listener();
      }).subscribe();
    liveTables.set(table, entry);
  }
  entry.listeners.add(onChange);
  return { unsubscribe() {
    entry.listeners.delete(onChange);
    if (!entry.listeners.size) {
      client().removeChannel(entry.channel);
      liveTables.delete(table);
    }
  } };
}
function stableFilterKey(value) {
  if (Array.isArray(value)) return `[${value.map(stableFilterKey).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableFilterKey(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function subscribeProductRows(kind, filters, onData, onError) {
  const key = `${kind}:${stableFilterKey(filters || {})}`;
  return subscribeSharedRows(liveSlices, key,
    onChange => subscribeTableChanges(kind, onChange),
    () => getRows(kind, filters), onData, onError);
}

export function subscribeRows(name, onData, onError) {
  const path = String(name).split('/');
  if (path[2] === 'gecmis') {
    let active = true;
    loadRecordHistory(kindFromName(path[0]), path[1]).then(page => { if (active) onData(page.rows); }).catch(error => { if (active) onError(error); });
    return () => { active = false; };
  }
  const kind = kindFromName(name);
  if (!kind) { onError(new Error(`Desteklenmeyen Supabase veri kümesi: ${name}`)); return () => {}; }
  return subscribeProductRows(kind, {}, onData, onError);
}

export async function loadRecordHistory(kind, id, offset = 0, pageSize = 50) {
  const limit = Math.min(100, Math.max(1, pageSize));
  const start = Math.max(0, offset);
  const { data, error } = await client().from('record_history')
    .select('id,recorded_at,actor,actor_label,action,changes')
    .eq('table_name', kind === 'personnel' ? 'personnel' : TABLES[kind]).eq('record_id', id)
    .order('recorded_at', { ascending: false }).order('id', { ascending: false })
    .range(start, start + limit - 1);
  if (error) throw error;
  const rows = (data || []).map(r => ({ id: String(r.id), at: r.recorded_at, by: r.actor, byName: r.actor_label, action: r.action, changes: r.changes }));
  return { rows, hasMore: rows.length === limit };
}

export function loadRecordNotes(kind, id, onData, onError) {
  const tableName = kind === 'personnel' ? 'personnel' : TABLES[kind];
  client().from('record_notes').select('id,note,author_id,author_label,created_at').eq('table_name', tableName).eq('record_id', id).order('created_at', { ascending: false }).then(({ data, error }) => {
    if (error) throw error;
    onData(data || []);
  }).catch(onError);
}

export async function addRecordNote(kind, id, note) {
  const text = String(note || '').trim();
  if (!text) throw new Error('Not metni boş bırakılamaz.');
  const user = auth.currentUser;
  if (!user) throw new Error('Not eklemek için aktif oturum gerekli.');
  const tableName = kind === 'personnel' ? 'personnel' : TABLES[kind];
  const { error } = await client().from('record_notes').insert({ table_name: tableName, record_id: String(id), note: text, author_id: user.uid, author_label: user.displayName || user.email || user.uid });
  if (error) throw error;
}

export function loadContextNotes(contextType, contextId, onData, onError) {
  if (!NOTE_CONTEXT_TYPES.includes(contextType) || !String(contextId || '').trim()) {
    onError(new Error('Geçersiz not bağlamı.'));
    return;
  }
  client().from('record_notes').select('id,note,author_id,author_label,created_at')
    .eq('table_name', contextType).eq('record_id', String(contextId)).order('created_at', { ascending: false })
    .then(({ data, error }) => { if (error) throw error; onData(data || []); }).catch(onError);
}

export async function addContextNote(contextType, contextId, note) {
  if (!NOTE_CONTEXT_TYPES.includes(contextType) || !String(contextId || '').trim()) throw new Error('Geçersiz not bağlamı.');
  const text = String(note || '').trim();
  if (!text) throw new Error('Not metni boş bırakılamaz.');
  const user = auth.currentUser;
  if (!user) throw new Error('Not eklemek için aktif oturum gerekli.');
  const { error } = await client().from('record_notes').insert({
    table_name: contextType, record_id: String(contextId), note: text,
    author_id: user.uid, author_label: user.displayName || user.email || user.uid,
  });
  if (error) throw error;
}

export async function readImportContext(kind, _db, filters = {}) {
  if (Array.isArray(filters)) filters = {};
  return getRows(kind, filters);
}

function toDatabase(kind, r, current, now, userId) {
  const extra = { ...(current?.extra || {}) };
  if (kind === 'plans' || kind === 'activities') extra.ekip = r.ekip || '';
  const pairs = kind === 'personnel' ? { id: r.personelId, unit_id: r.birimId, service_point_id: r.cozumNoktasiId || null, full_name: r.adSoyad, title: r.unvan, team: r.ekip, status: current?.status || 'AKTIF', archived: current?.archived || false, photo_path: r.fotoUrl || null, custom_fields: r.ozelAlanlar || {} }
    : kind === 'plans' ? { id: r.recordId, personnel_id: r.personelId, unit_id: r.birimId, service_point_id: r.cozumNoktasiId || null, work_date: r.tarih, starts_at: r.baslangic, ends_at: r.bitis, scope_type: r.planKapsami || 'ILCE', scope_name: r.kapsamAdi || '', district_id: r.ilceId || null, neighborhood_id: r.mahalleId || '', square_id: r.meydanId || '', place: r.gorevYeri, canceled: Boolean(r.iptal), archived: Boolean(current?.archived), override_explanation: r.cakismaAciklamasi || '', participants: [...new Set([r.birimId, ...(r.katilimciBirimleri || '').split(',').map(s => s.trim()).filter(Boolean)])], extra }
      : kind === 'activities' ? { id: r.recordId, unit_id: r.birimId, service_point_id: r.cozumNoktasiId || null, personnel_id: r.personelId || null, work_date: r.tarih, district_id: r.ilceId, neighborhood_id: r.mahalleId || '', square_id: r.meydanId || '', place: r.gorevYeri, work_done: r.yapilanIs, result: r.sonuc, confirmed_by: r.teyitEden, confirmed_at: r.teyitTarihi, photo_path: r.fotoUrl || null, participants: [...new Set([r.birimId, ...(r.katilimciBirimleri || '').split(',').map(s => s.trim()).filter(Boolean)])], archived: Boolean(current?.archived), extra }
      : kind === 'fieldUpdates' ? { id: r.recordId, title: r.baslik, description: r.aciklama, unit_id: r.birimId, team: r.ekip || '', occurred_at: `${r.tarih}T${r.saat}:00+03`, district_id: r.ilceId || '', neighborhood_id: r.mahalleId || '', square_id: r.meydanId || '', service_point_id: r.cozumNoktasiId || null, photo_path: r.fotoUrl || null, photo_removed: Boolean(r.fotoUrl ? false : current?.photo_removed), archived: Boolean(current?.archived), version: current?.version || 1 }
        : { id: r.recordId, title: r.baslik, responsible: r.sorumlu, unit_id: r.birimId || null, participants: r.birimId ? [r.birimId] : [], work_date: r.tarih || now.slice(0, 10), target_date: r.hedefTarih || null, status: r.durum || 'Bekliyor', closing_note: r.kapanisNotu || '', closed_at: r.durum === 'Tamamlandı' ? current?.closed_at || now : null, archived: Boolean(current?.archived), extra: { ...extra, not: r.not || '', ilceId: r.ilceId, mahalleId: r.mahalleId, meydanId: r.meydanId, gorevYeri: r.gorevYeri, fotoUrl: r.fotoUrl } };
  const known = new Set(['personelId','recordId','adSoyad','birimId','cozumNoktasiId','unvan','ekip','telefon','fotoUrl','ozelAlanlar','tarih','saat','aciklama','baslangic','bitis','planKapsami','kapsamAdi','ilceId','mahalleId','meydanId','gorevYeri','iptal','cakismaAciklamasi','katilimciBirimleri','katilimciBirimIds','saatAraligi','yapilanIs','sonuc','teyitEden','teyitTarihi','baslik','sorumlu','hedefTarih','durum','kapanisNotu','not','version','createdAt','updatedAt','updatedBy','closedAt','arsivli','id']);
  for (const [key, value] of Object.entries(r)) if (!known.has(key)) extra[key] = value;
  if (kind !== 'personnel') pairs.extra = extra;
  pairs.version = (current?.version || 0) + 1;
  pairs.created_at = current?.created_at || now;
  pairs.updated_by = userId;
  return pairs;
}

async function prepareRecordWrite(kind, input, previous, catalog, options = {}) {
  const record = normalizeRecord(kind, input);
  if (kind === 'plans' && options.cancelled !== undefined) record.iptal = options.cancelled;
  const errors = validateRecord(kind, record, catalog);
  if (errors.length) throw new Error(errors.join(' '));
  const id = kind === 'personnel' ? record.personelId : record.recordId;
  const table = TABLES[kind], now = new Date().toISOString(), userId = options.user?.uid || auth.currentUser?.uid;
  if (!userId) throw new Error('Oturum açmanız gerekiyor.');
  const { data: current, error: readError } = await client().from(table).select(COLUMNS[kind]).eq('id', id).maybeSingle();
  if (readError) throw readError;
  if (current?.archived) throw new Error('Pasif kaydı düzenlemeden önce yeniden etkinleştirin.');
  if (current && previous && Number(current.version) !== Number(previous.version)) throw new Error('Kayıt başka bir işlemde değişti. Yeniden yükleyip değişiklikleri kontrol edin.');
  if (!current && previous) throw new Error('Kayıt artık bulunmuyor; veriyi yeniden yükleyin.');
  if (kind === 'personnel' && current && current.unit_id !== record.birimId) throw new Error('Personelin birimi değiştirilemez; yeni birim kaydı oluşturulmalıdır.');
  if (kind === 'personnel') {
    const { data: schema, error } = await client().from('unit_field_schemas').select('fields').eq('unit_id', record.birimId).maybeSingle();
    if (error) throw error;
    const required = (schema?.fields || []).find(f => f.active !== false && f.required && !String(record.ozelAlanlar?.[f.id] || '').trim());
    if (required) throw new Error(`${required.label} zorunludur.`);
  }
  let uploadedPath = '';
  const previousPhotoPath = current?.photo_path || '';
  if (options.photo && record.fotoUrl?.startsWith('syp-photo:')) {
    const unitId = record.birimId || current?.unit_id || 'GENERAL';
    const path = `${unitId}/${kind}/${crypto.randomUUID()}.jpg`;
    const { error: stageError } = await client().rpc('stage_record_photo_upload', { p_path: path });
    if (stageError) throw stageError;
    const bytes = Uint8Array.from(atob(options.photo.dataUrl.split(',')[1]), char => char.charCodeAt(0));
    const { error } = await client().storage.from('syp-records').upload(path, new Blob([bytes], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    record.fotoUrl = path;
    uploadedPath = path;
  }
  const payload = toDatabase(kind, record, current, now, userId);
  return {
    id,
    uploadedPath,
    previousPhotoPath,
    rpc: {
      payload,
      expectedVersion: current ? current.version : null,
      writePhone: kind === 'personnel' && Object.hasOwn(input, 'telefon') && ['admin','manager'].includes(options.role),
      phone: record.telefon || '',
    },
  };
}

async function removeUploadedPhotos(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const { error } = await client().storage.from('syp-records').remove(unique);
  if (error) console.warn('Kaydedilemeyen fotoğraf temizlenemedi:', error.message);
}

async function executeAtomicWrites(kind, prepared) {
  const { data, error } = await client().rpc('save_syp_records_atomic', {
    p_kind: kind,
    p_records: prepared.map(item => item.rpc),
  });
  if (error) {
    await removeUploadedPhotos(prepared.map(item => item.uploadedPath));
    throw error;
  }
  invalidateRowsCache(kind);
  if (kind === 'personnel' && prepared.some(item => item.rpc.writePhone)) invalidateRowsCache('phones');
  return data || prepared.map(item => item.id);
}

export async function saveRecord(kind, input, previous, catalog, options = {}) {
  const prepared = await prepareRecordWrite(kind, input, previous, catalog, options);
  await executeAtomicWrites(kind, [prepared]);
  return prepared.id;
}

export async function saveRecordsAtomic(kind, entries, catalog, options = {}) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 500) throw new Error('Tek işlemde 1–500 kayıt yüklenebilir.');
  const prepared = [];
  try {
    for (const entry of entries) prepared.push(await prepareRecordWrite(kind, entry.record, entry.previous || null, catalog, options));
    await executeAtomicWrites(kind, prepared);
    return prepared.map(item => item.id);
  } catch (error) {
    await removeUploadedPhotos(prepared.map(item => item.uploadedPath));
    throw error;
  }
}

export async function setRecordArchived(kind, id, archived) {
  const table = TABLES[kind];
  const { data, error } = await client().from(table).update({ archived, ...(kind === 'personnel' ? { status: archived ? 'PASIF' : 'AKTIF' } : {}) }).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Kayıt bulunamadı veya bu işlem için yetkiniz yok.');
  invalidateRowsCache(kind);
}

export async function readUnitFieldSchema(unitId) {
  const { data, error } = await client().from('unit_field_schemas').select('fields').eq('unit_id', unitId).maybeSingle();
  if (error) throw error;
  return data?.fields || [];
}

export async function readAdminSettings() {
  const [users, schemas, units] = await Promise.all([
    client().from('app_users').select('id,display_name,email,role,unit_id,active').order('id'),
    client().from('unit_field_schemas').select('unit_id,fields'),
    client().from('units').select('id,name,active,created_at').order('name'),
  ]);
  if (users.error) throw users.error;
  if (schemas.error) throw schemas.error;
  if (units.error) throw units.error;
  return { users: users.data, units: units.data.map(asUi.bind(null, 'units')), schemas: schemas.data.map(s => ({ id: s.unit_id, birimId: s.unit_id, fields: s.fields })) };
}

export async function createUnit(id, name) {
  const cleanId = String(id || '').trim().toLocaleUpperCase('tr-TR');
  const cleanName = String(name || '').trim();
  if (!/^[A-Z0-9_-]{2,40}$/.test(cleanId)) throw new Error('Birim kodu 2–40 karakter olmalı; Latin harf, rakam, alt çizgi ve tire kullanılabilir.');
  if (cleanName.length < 2 || cleanName.length > 100) throw new Error('Birim adı 2–100 karakter olmalı.');
  const { error } = await client().from('units').insert({ id: cleanId, name: cleanName });
  if (error?.code === '23505') throw new Error('Bu birim kodu zaten kullanılıyor.');
  if (error) throw error;
  invalidateRowsCache('units');
  return { id: cleanId, name: cleanName, active: true };
}

export async function saveServicePoint(input, previous, catalog) {
  const id = String(input.id || '').trim();
  const name = String(input.name || '').trim();
  const districtId = String(input.ilceId || '').trim();
  const neighborhoodId = String(input.mahalleId || '').trim();
  const squareId = String(input.meydanId || '').trim();
  const address = String(input.adres || '').trim();
  const description = String(input.aciklama || '').trim();
  const workingHours = input.calismaSaatleri && typeof input.calismaSaatleri === 'object' ? input.calismaSaatleri : {};
  const lat = String(input.latitude ?? '').trim();
  const lon = String(input.longitude ?? '').trim();
  if (!/^[A-Za-z0-9_-]{2,100}$/.test(id)) throw new Error('Nokta kodu 2–100 karakter; Latin harf, rakam, alt çizgi veya tire içermelidir.');
  if (name.length < 2 || name.length > 160) throw new Error('Nokta adı 2–160 karakter olmalıdır.');
  if (!(catalog.districts || []).some(d => d.id === districtId)) throw new Error('Geçerli bir ilçe seçin.');
  if (neighborhoodId && !(catalog.neighborhoods || []).some(n => n.id === neighborhoodId && n.districtId === districtId)) throw new Error('Mahalle seçili ilçeye ait olmalıdır.');
  if (squareId && !(catalog.squares || []).some(s => s.id === squareId && s.districtId === districtId)) throw new Error('Meydan seçili ilçeye ait olmalıdır.');
  if (address.length > 500 || description.length > 2000) throw new Error('Adres veya açıklama çok uzun.');
  if (Boolean(lat) !== Boolean(lon)) throw new Error('Harita konumu için enlem ve boylamı birlikte girin.');
  if (lat && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || Number(lat) < 40 || Number(lat) > 42 || Number(lon) < 27 || Number(lon) > 31)) throw new Error('Harita koordinatları İstanbul sınırlarında olmalıdır.');
  const { data: current, error: readError } = await client().from('service_points').select(COLUMNS.servicePoints).eq('id', id).maybeSingle();
  if (readError) throw readError;
  if (current && !previous) throw new Error('Bu nokta kodu kullanılıyor. Kaydı açıp düzenleyin.');
  if (!current && previous) throw new Error('Nokta artık bulunmuyor. Sayfayı yenileyin.');
  if (current && Number(current.version) !== Number(previous.version)) throw new Error('Nokta başka bir işlemde değişti. Sayfayı yenileyin.');
  if (current && !current.active) throw new Error('Pasif noktayı düzenlemeden önce yeniden etkinleştirin.');
  if (!['NOKTA', 'SUBE'].includes(input.tip || 'NOKTA')) throw new Error('Geçerli bir hizmet yeri türü seçin.');
  const payload = { id, unit_id: SOLUTION_POINTS_UNIT, kind: input.tip || 'NOKTA', name, district_id: districtId, neighborhood_id: neighborhoodId, square_id: squareId, address, description, working_hours: workingHours, latitude: lat ? Number(lat) : null, longitude: lon ? Number(lon) : null, version: (current?.version || 0) + 1, updated_by: auth.currentUser?.uid || null };
  const write = current
    ? await client().from('service_points').update(payload).eq('id', id).eq('version', current.version).select('id').maybeSingle()
    : await client().from('service_points').insert(payload).select('id').single();
  if (write.error) throw write.error;
  if (!write.data) throw new Error('Nokta başka bir işlemde değişti. Sayfayı yenileyin.');
  invalidateRowsCache('servicePoints');
  return id;
}

export async function setServicePointActive(id, active, expectedVersion) {
  const { data, error } = await client().from('service_points')
    .update({ active, version: Number(expectedVersion) + 1 })
    .eq('id', id).eq('version', expectedVersion).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Nokta değişmiş veya işlem yetkiniz yok. Sayfayı yenileyin.');
  invalidateRowsCache('servicePoints');
}

export async function saveUnitFieldSchema(unitId, fields, userId) {
  const { error } = await client().from('unit_field_schemas').upsert({ unit_id: unitId, fields, updated_by: userId });
  if (error) throw error;
}

export async function updateAppUser(id, patch) {
  const update = {};
  if (Object.hasOwn(patch, 'role')) update.role = patch.role;
  if (Object.hasOwn(patch, 'unitId')) update.unit_id = patch.unitId || null;
  if (Object.hasOwn(patch, 'disabled')) update.active = !patch.disabled;
  const { error } = await client().from('app_users').update(update).eq('id', id);
  if (error) throw error;
}

export function loadUnitFieldSchema(unitId, onData, onError) {
  const load = async () => {
    const { data, error } = await client().from('unit_field_schemas').select('fields').eq('unit_id', unitId).maybeSingle();
    if (error) throw error;
    onData(data?.fields || []);
  };
  let active = true;
  const safeLoad = () => load().catch(e => { if (active) onError(e); });
  safeLoad();
  return () => { active = false; };
}
