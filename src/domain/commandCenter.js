// Shared contracts for the command centre. Plans never imply completed work.
export const SOLUTION_POINTS_UNIT = 'COZUM_NOKTALARI';
export const UNITS = { MEYDAN: 'Meydan Yönetim Şefliği', YERINDE_COZUM: 'Yerinde Çözüm Şefliği', SAHA_HIZMETLERI: 'Mobil Çözüm Noktaları Şefliği', [SOLUTION_POINTS_UNIT]: 'Çözüm Noktaları ve Şubeleri Şefliği' };
export const UNIT_SUBUNITS = {
  YERINDE_COZUM: [
    { id: 'avrupa', label: 'Avrupa Ekipleri' },
    { id: 'anadolu', label: 'Anadolu Ekipleri' },
  ],
  SAHA_HIZMETLERI: [
    { id: 'kampuste', label: 'Kampüste Çözüm Birimi' },
    { id: 'mahallede', label: 'Mahallede Çözüm Birimi' },
    { id: 'kamuoyu', label: 'Kamuoyu Araştırmaları ve Yerinde Bilgilendirme Birimi' },
    { id: 'bolge-1', label: '1. Bölge' },
    { id: 'bolge-2', label: '2. Bölge' },
    { id: 'bolge-3', label: '3. Bölge' },
  ],
  [SOLUTION_POINTS_UNIT]: [
    { id: 'nokta', label: 'Nokta Personeli' },
    { id: 'sube', label: 'Şube Personeli' },
    { id: 'avm', label: 'AVM Personeli' },
  ],
};
export const UNIT_PATHS = { '/meydan-yonetimi': 'MEYDAN', '/yerinde-cozum': 'YERINDE_COZUM', '/saha-hizmetleri': 'SAHA_HIZMETLERI', '/cozum-noktalari': SOLUTION_POINTS_UNIT };
export const KINDS = {
  personnel: { label: 'Birim Personeli', collection: 'birimPersonelleri', fields: ['personelId', 'adSoyad', 'telefon', 'birimId', 'cozumNoktasiId', 'ekip', 'unvan', 'fotoUrl'] },
  plans: { label: 'Haftalık Görev Planı', collection: 'sahaGorevPlanlari', fields: ['recordId', 'personelId', 'birimId', 'cozumNoktasiId', 'ekip', 'tarih', 'baslangic', 'bitis', 'planKapsami', 'kapsamAdi', 'ilceId', 'mahalleId', 'meydanId', 'gorevYeri', 'cakismaAciklamasi'] },
  activities: { label: 'Haftalık Öne Çıkan Çalışmalar', collection: 'sahaCalismalari', fields: ['recordId', 'birimId', 'cozumNoktasiId', 'tarih', 'personelId', 'ekip', 'ilceId', 'mahalleId', 'meydanId', 'gorevYeri', 'yapilanIs', 'sonuc', 'teyitEden', 'teyitTarihi', 'ortakCalismaKodu', 'katilimciBirimleri', 'fotoUrl'] },
  tasks: { label: 'Takip Edilen İşler', collection: 'takipEdilenIsler', fields: ['recordId', 'baslik', 'birimId', 'tarih', 'ilceId', 'mahalleId', 'meydanId', 'gorevYeri', 'sorumlu', 'hedefTarih', 'durum', 'not', 'kapanisNotu', 'fotoUrl'] },
  fieldUpdates: { label: 'Saha Akışı Bildirimi', collection: 'sahaAkisiBildirimleri', fields: ['recordId', 'baslik', 'aciklama', 'birimId', 'ekip', 'tarih', 'saat', 'ilceId', 'mahalleId', 'meydanId', 'cozumNoktasiId'] },
};
export const LABELS = { recordId: 'Kayıt Kodu', personelId: 'Personel Kodu', adSoyad: 'Ad Soyad', telefon: 'Telefon', birimId: 'Birim', cozumNoktasiId: 'Çözüm Noktası', ekip: 'Ekip', unvan: 'Unvan', fotoUrl: 'Fotoğraf', tarih: 'Tarih', saat: 'Saat', aciklama: 'Kısa açıklama', baslangic: 'Başlangıç', bitis: 'Bitiş', planKapsami: 'Plan Kapsamı', kapsamAdi: 'Kapsam Adı', ilceId: 'İlçe', mahalleId: 'Mahalle', meydanId: 'Meydan', gorevYeri: 'Görev Yeri', yapilanIs: 'Çalışma Başlığı', sonuc: 'Kısa Açıklama', teyitEden: 'Bilgiyi İleten', teyitTarihi: 'İletim Tarihi', ortakCalismaKodu: 'Ortak Çalışma Kodu', katilimciBirimleri: 'Katılımcı Birimler', cakismaAciklamasi: 'Çakışma Açıklaması', baslik: 'Başlık', sorumlu: 'Sorumlu', hedefTarih: 'Hedef Tarih', durum: 'Durum', not: 'Gelişme Notu', kapanisNotu: 'Kapanış Notu' };
export const STATES = ['Bekliyor', 'Devam Ediyor', 'Tamamlandı'];
export const NOTE_CONTEXT_TYPES = Object.freeze(['district', 'neighborhood']);
export const PLAN_SCOPE_LABELS = {
  ILCE: 'İlçe planı',
  YAKA: 'Yaka planı',
  BOLGE: 'Bölge planı',
  EKIP: 'Ekip planı',
  MERKEZ: 'Merkez planı',
};
export function planScopeLabel(plan) {
  return PLAN_SCOPE_LABELS[plan?.planKapsami || 'ILCE'] || 'Çalışma planı';
}
export function planLocationLabel(plan) {
  if (!plan) return 'Görev yeri belirtilmedi';
  if ((plan.planKapsami || 'ILCE') !== 'ILCE') return plan.kapsamAdi?.trim() || planScopeLabel(plan);
  return plan.gorevYeri || 'Görev yeri belirtilmedi';
}
// The panel shows the time the record was last changed, never a live field location.
export function latestRecordTimestamp(records = []) {
  return records.reduce((latest, record) => {
    const value = record?.updatedAt || record?.updated_at || record?.createdAt || record?.created_at || '';
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) || timestamp <= Date.parse(latest || 0) ? latest : value;
  }, '');
}
export function personnelPath(person) { return `/birim/${encodeURIComponent(person.birimId)}/personel/${encodeURIComponent(person.personelId)}`; }
export function navigationSearch(pathname, search) {
  const params = new URLSearchParams(search);
  const unit = UNIT_PATHS[pathname];
  const personUnit = pathname.match(/^\/birim\/([^/]+)\/personel/);
  if (personUnit) params.set('unit', personUnit[1]);
  const district = pathname.match(/^\/ilce\/([^/]+)/)?.[1];
  if (unit) params.set('unit', unit);
  if (district) params.set('district', district);
  return params.size ? `?${params}` : '';
}
export const normalizeText = (v) => String(v ?? '').trim().toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export const todayKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(date);
export const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export function dateRange(preset, today = todayKey()) {
  const end = new Date(`${today}T12:00:00Z`), start = new Date(end);
  if (preset === 'week') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.getTime()); end.setUTCDate(end.getUTCDate() + 6);
  }
  if (preset === 'month') {
    start.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
export function clampDateRange(from, to, maxDays = 90, today = todayKey()) {
  const safeFrom = validDate(from) ? from : today;
  const safeTo = validDate(to) && to >= safeFrom ? to : safeFrom;
  const d1 = new Date(`${safeFrom}T12:00:00Z`);
  const d2 = new Date(`${safeTo}T12:00:00Z`);
  const diffDays = Math.round((d2 - d1) / 86400000);
  if (diffDays > maxDays) {
    const clampedEnd = new Date(d1.getTime() + maxDays * 86400000);
    return { from: safeFrom, to: clampedEnd.toISOString().slice(0, 10), clamped: true };
  }
  return { from: safeFrom, to: safeTo, clamped: false };
}

export function previousDateRange(from, to) {
  if (!validDate(from) || !validDate(to) || to < from) throw new RangeError('Geçerli bir tarih aralığı gereklidir.');
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const spanDays = Math.round((end - start) / 86400000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - spanDays + 1);
  return {
    from: previousStart.toISOString().slice(0, 10),
    to: previousEnd.toISOString().slice(0, 10),
  };
}

export function safePhoto(value) {
  if (!value) return '';
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
export function normalizeRecord(kind, raw) {
  const record = Object.fromEntries(KINDS[kind].fields.map((f) => [f, String(raw[f] ?? '').trim()]));
  if (kind === 'tasks') {
    if (!record.tarih) record.tarih = todayKey();
    if (!record.durum) record.durum = 'Bekliyor';
  }
  if (kind === 'plans' && !record.planKapsami) record.planKapsami = 'ILCE';
  if (kind === 'fieldUpdates' && !record.tarih) record.tarih = todayKey();
  if (kind === 'fieldUpdates') record.fotoUrl = String(raw.fotoUrl ?? '').trim();
  if (kind === 'personnel') record.ozelAlanlar = raw.ozelAlanlar && typeof raw.ozelAlanlar === 'object' && !Array.isArray(raw.ozelAlanlar) ? { ...raw.ozelAlanlar } : {};
  return record;
}
export function fingerprint(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${fingerprint(value[k])}`).join(',')}}`;
}
export function validateRecord(kind, record, catalog = {}) {
  const errors = [], required = kind === 'personnel' ? ['personelId', 'adSoyad', 'birimId']
    : kind === 'plans' ? ['recordId', 'personelId', 'birimId', 'tarih', 'baslangic', 'bitis', 'planKapsami', 'gorevYeri']
      : kind === 'activities' ? ['recordId', 'birimId', 'tarih', 'ilceId', 'gorevYeri', 'yapilanIs', 'teyitEden', 'teyitTarihi']
      : kind === 'fieldUpdates' ? ['recordId', 'baslik', 'aciklama', 'birimId', 'tarih', 'saat']
      : ['recordId', 'baslik', 'sorumlu'];
  for (const field of required) if (!record[field]?.trim()) errors.push(`${LABELS[field]} zorunludur.`);
  for (const [key, value] of Object.entries(record)) if (String(value).length > 4000) errors.push(`${LABELS[key] || key} çok uzun (en fazla 4000 karakter).`);
  for (const field of ['recordId', 'personelId']) if (record[field] && !/^[\p{L}\p{N}_-]{1,100}$/u.test(record[field])) errors.push(`${LABELS[field]} yalnızca harf, rakam, alt çizgi ve tire içerebilir.`);
  const units = catalog.unitMap || UNITS;
  if ((kind !== 'tasks' || record.birimId) && !units[record.birimId]) errors.push('Geçerli bir birim seçin.');
  for (const field of ['tarih', 'hedefTarih', 'teyitTarihi']) if (record[field] && !validDate(record[field])) errors.push(`${LABELS[field]} YYYY-AA-GG biçiminde geçerli tarih olmalıdır.`);
  if (record.hedefTarih && record.hedefTarih < record.tarih) errors.push('Hedef tarih kayıt tarihinden önce olamaz.');
  if (record.fotoUrl && !/^syp-photo:[a-zA-Z0-9-]{1,100}$/.test(record.fotoUrl) && !safePhoto(record.fotoUrl)) errors.push('Fotoğraf adresi HTTPS olmalıdır.');
  if (kind === 'personnel' && record.telefon && !/^\+?[\d ()-]{7,25}$/.test(record.telefon)) errors.push('Geçerli bir telefon numarası girin.');
  if (kind === 'personnel' && Object.values(record.ozelAlanlar || {}).some((value) => String(value).length > 1000)) errors.push('Birime özel alan en fazla 1000 karakter olabilir.');
  if (record.katilimciBirimleri) for (const id of record.katilimciBirimleri.split(',').map((x) => x.trim())) if (id && !units[id]) errors.push(`Katılımcı birim kodu bulunamadı: ${id}`);
  if (record.cozumNoktasiId) {
    const point = (catalog.servicePoints || []).find((p) => p.id === record.cozumNoktasiId && p.active);
    if (!point) errors.push('Çözüm noktası katalogda bulunamadı veya pasif.');
    else {
      if (record.birimId !== SOLUTION_POINTS_UNIT) errors.push('Çözüm noktası personeli kendi şefliğinde kayıtlı olmalıdır.');
      if (kind !== 'personnel' && (record.ilceId !== point.ilceId || (point.mahalleId && record.mahalleId !== point.mahalleId) || (point.meydanId && record.meydanId !== point.meydanId))) errors.push('Kayıt konumu seçilen çözüm noktasıyla eşleşmiyor.');
    }
  }
  if (kind !== 'personnel' && record.personelId && !(catalog.personnel || []).some((p) => p.personelId === record.personelId)) errors.push('Personel kodu katalogda bulunamadı. Önce personeli yükleyin.');
  if (kind === 'plans' && (record.planKapsami || 'ILCE') === 'ILCE' && !record.ilceId) errors.push('İlçe kapsamındaki planlarda ilçe zorunludur.');
  if (kind === 'fieldUpdates' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(record.saat)) errors.push('Saat SS:DD biçiminde olmalıdır.');
  if (record.ilceId && !(catalog.districts || []).some((d) => d.id === record.ilceId)) errors.push('İlçe kodu bulunamadı.');
  if (record.mahalleId && !(catalog.neighborhoods || []).some((n) => n.id === record.mahalleId && n.districtId === record.ilceId)) errors.push('Mahalle seçili ilçeye ait değil.');
  if (record.meydanId && !(catalog.squares || []).some((s) => s.id === record.meydanId && s.districtId === record.ilceId)) errors.push('Meydan seçili ilçeye ait değil.');
  if (kind === 'plans') {
    if (!['ILCE', 'YAKA', 'BOLGE', 'EKIP', 'MERKEZ'].includes(record.planKapsami || 'ILCE')) errors.push('Geçerli bir plan kapsamı seçin.');
    if ((record.planKapsami || 'ILCE') !== 'ILCE' && !record.kapsamAdi?.trim()) errors.push('İlçe dışı planlarda kapsam adı zorunludur.');
    for (const f of ['baslangic', 'bitis']) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(record[f])) errors.push(`${LABELS[f]} SS:DD biçiminde olmalıdır.`);
    if (record.baslangic === record.bitis) errors.push('Başlangıç ve bitiş aynı olamaz.');
  }
  if (kind === 'tasks') {
    if (!STATES.includes(record.durum)) errors.push('Geçerli bir durum seçin.');
    if (record.durum === 'Tamamlandı' && !record.kapanisNotu?.trim()) errors.push('Tamamlamak için kapanış notu zorunludur.');
  }
  return [...new Set(errors)];
}
export function planInterval(p) {
  const start = Date.parse(`${p.tarih}T${p.baslangic}:00+03:00`);
  let end = Date.parse(`${p.tarih}T${p.bitis}:00+03:00`);
  if (end <= start) end += 86400000;
  return { start, end };
}
export function plansOverlap(a, b) {
  if (!a.personelId || a.personelId !== b.personelId || a.recordId === b.recordId || a.iptal || b.iptal) return false;
  const x = planInterval(a), y = planInterval(b);
  return x.start < y.end && y.start < x.end;
}
export function buildPreview(kind, rows, existing, catalog, options = {}) {
  const key = kind === 'personnel' ? 'personelId' : 'recordId';
  const counts = new Map();
  const normalized = rows.map((r) => {
    const record = normalizeRecord(kind, r);
    if (record.personelId) {
      const person = (catalog.personnel || []).find((p) => p.personelId === record.personelId || p.sistemPersonelKodu === record.personelId);
      if (person) record.personelId = person.personelId;
    }
    return record;
  });
  normalized.forEach((r) => counts.set(r[key], (counts.get(r[key]) || 0) + 1));
  // Replacement rows supersede their own previous version when checking collisions.
  const incomingIds = new Set(normalized.map((r) => r[key]));
  const otherPlans = existing.filter((r) => !incomingIds.has(r[key]));
  return normalized.map((record, index) => {
    const previous = existing.find((r) => r[key] === record[key]) || null;
    const errors = validateRecord(kind, record, catalog);
    if (counts.get(record[key]) > 1) errors.push('Dosyada aynı kayıt kodu birden fazla kez var.');
    if (kind === 'plans' && [...otherPlans, ...normalized].some((p) => plansOverlap(record, p)) && !(options.role === 'admin' || (options.role === 'manager' && record.cakismaAciklamasi))) errors.push('Personelin aynı saatlerde başka görevi var. Yalnız Admin veya açıklamalı Yönetici istisna verebilir.');
    const changed = previous && fingerprint(normalizeRecord(kind, previous)) !== fingerprint(record);
    return { row: rows[index].__sheetRow || index + 2, record, previous, errors, status: errors.length ? 'Hatalı' : !previous ? 'Yeni' : changed ? 'Değişen' : 'Aynı' };
  });
}
export function inScope(record, filters, withDate = true) {
  return (!filters.unit || record.birimId === filters.unit || record.katilimciBirimIds?.includes(filters.unit))
    && (!filters.district || record.ilceId === filters.district)
    && (!filters.neighborhood || record.mahalleId === filters.neighborhood)
    && (!filters.square || record.meydanId === filters.square)
    && (!withDate || (record.tarih >= filters.from && record.tarih <= filters.to));
}
export function aggregateOperations(plans, activities, tasks, filters) {
  const selectedPlans = plans.filter((p) => !p.iptal && !p.arsivli && inScope(p, filters));
  const selectedTasks = tasks.filter((t) => !t.arsivli && inScope(t, filters));
  const districtPeople = new Map();
  for (const p of selectedPlans) {
    if (!districtPeople.has(p.ilceId)) districtPeople.set(p.ilceId, new Set());
    if (p.personelId) districtPeople.get(p.ilceId).add(p.personelId);
  }
  return {
    plans: selectedPlans, activities: activities.filter((a) => !a.arsivli && inScope(a, filters)), tasks: selectedTasks,
    people: new Set(selectedPlans.map((p) => p.personelId).filter(Boolean)).size,
    districtPeople: [...districtPeople].map(([id, people]) => ({ id, count: people.size })),
    completed: selectedTasks.filter((t) => t.durum === 'Tamamlandı').length,
    pending: selectedTasks.filter((t) => t.durum !== 'Tamamlandı').length,
  };
}
