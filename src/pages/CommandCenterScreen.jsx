import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDesktopMaps } from '../hooks/useDesktopMaps.js';
import { useMapFocus } from '../hooks/useMapFocus.js';
import { buildNeighborhoodMapMetrics } from '../domain/neighborhoodMapMetrics.js';
import { buildCommandMapMetrics, COMMAND_MAP_LAYERS } from '../domain/commandMapMetrics.js';
import { useCommandCenter } from '../hooks/useCommandCenter.js';
import { squares } from '../domain/commandCatalog.js';
import { commandTabs, normalizeCommandTab } from '../domain/commandNavigation.js';
import { usePanelAccess } from '../hooks/usePanelAccess.js';
import { useTheme } from '../context/themeState.js';
import { aggregateOperations, inScope, dateRange, KINDS, normalizeText, todayKey, UNITS, UNIT_PATHS, SOLUTION_POINTS_UNIT, PLAN_SCOPE_LABELS, validDate } from '../domain/commandCenter.js';
import { getPhysicalPlaceAssociations } from '../domain/physicalPlaceAssociations.js';
import RecordPhoto from '../components/operations/RecordPhoto.jsx';
import PersonnelProfile from '../components/operations/PersonnelProfile.jsx';
import PersonCard from '../components/operations/PersonCard.jsx';
import CityMetrics from '../components/operations/CityMetrics.jsx';
import ContextNotes from '../components/operations/ContextNotes.jsx';
import DataFreshnessNotice from '../components/operations/DataFreshnessNotice.jsx';
import FieldUpdatesView from '../components/operations/FieldUpdatesView.jsx';
import { getRowById, getRows, getRowsPage } from '../services/supabaseCommandCenterService.js';

const UNIT_DESCRIPTIONS = {
  MEYDAN: 'Meydanlardaki hizmet eksiklerini ve sorunları tespit eder; ilgili birimler ve ilçe belediyeleriyle koordinasyon kurarak çözüm sürecini hızlandırır.',
  YERINDE_COZUM: 'İBB hizmet alanlarındaki sorunları vatandaş başvurusu oluşmadan sahada tespit eder ve ilgili birimlere ileterek çözüm sürecini başlatır.',
  SAHA_HIZMETLERI: 'Mobil Çözüm, yoğun meydan ve lokasyonlarda vatandaşla doğrudan iletişim kurar; Kampüste Çözüm, Mahallede Çözüm ve Kamuoyu Araştırmaları birimleriyle saha geri bildirimlerini toplar ve raporlar.',
  COZUM_NOKTALARI: 'Sabit noktalarda vatandaşlara bilgilendirme, başvuru alma, hizmet ve proje tanıtımı ile İstanbulkart gibi işlemlere destek sağlar.',
};
const VIRTUAL_LEADERS = {
  MEYDAN: [
    // Contact details are resolved from manager-only personnel phone data;
    // never embed a phone number in the browser bundle.
    { personelId: 'VIRTUAL-MEYDAN-SEF', adSoyad: 'Adem Can DÜZ', unvan: 'Meydan Yönetimi Şefi', ekip: 'Şeflik yönetimi', birimId: 'MEYDAN', isVirtual: true },
    { personelId: 'VIRTUAL-MEYDAN-AVRUPA', adSoyad: 'Cansın Boyoğlu', unvan: 'Avrupa Yakası Organizasyon Sorumlusu', ekip: 'Avrupa Yakası', telefon: '', birimId: 'MEYDAN', isVirtual: true },
    { personelId: 'VIRTUAL-MEYDAN-ANADOLU', adSoyad: 'Umut Emre', unvan: 'Anadolu Yakası Organizasyon Sorumlusu', ekip: 'Anadolu Yakası', telefon: '', birimId: 'MEYDAN', isVirtual: true },
  ],
};
import population from '../data/istanbulDistrictPopulation2025.json';
import areas from '../data/istanbulDistrictArea.json';
import { CITY_AND_DISTRICT_DOSSIERS } from '../data/istanbulCityAndDistrictDossiers.js';
import './CommandCenterScreen.css';
import '../styles/premium.css';

const OperationCharts = lazy(() => import('../components/operations/OperationCharts.jsx'));
const CommandRecordForm = lazy(() => import('../components/operations/CommandRecordForm.jsx'));
const CommandImport = lazy(() => import('../components/operations/CommandImport.jsx'));
const CommandAssistant = lazy(() => import('../components/operations/CommandAssistant.jsx'));
const CommandReports = lazy(() => import('../components/operations/CommandReports.jsx'));
const AdminSettings = lazy(() => import('../components/operations/AdminSettings.jsx'));
const DistrictNeighborhoodMap = lazy(() => import('../components/map/DistrictNeighborhoodMap.jsx'));
const Istanbul25DMap = lazy(() => import('../components/map/Istanbul25DMap.jsx'));
const Istanbul3DMap = lazy(() => import('../components/map/Istanbul3DMap.jsx'));
import { FAQView, GuideView } from '../components/help/HelpCenterViews.jsx';

function Empty({ children = 'Seçili kapsamda kayıt bulunamadı.' }) {
  return <div className="cc-empty">{children}</div>;
}

function movementLabel(current, previous) {
  if (!previous && !current) return 'Değişim yok';
  if (!previous) return `+${current} yeni`;
  const percentage = Math.round(((current - previous) / previous) * 100);
  return percentage === 0 ? 'Değişim yok' : `${percentage > 0 ? '+' : ''}%${percentage}`;
}

function leadershipRoleText(person) {
  return normalizeText(`${person?.unvan || ''} ${person?.ozelAlanlar?.rol || ''} ${person?.ozelAlanlar?.pozisyon || ''}`);
}

function isUnitLeadership(person) {
  const role = leadershipRoleText(person);
  return role.includes('sef') || role.includes('bolge sorumlusu') || role.includes('birim sorumlusu');
}

function leadershipRank(person) {
  const role = leadershipRoleText(person);
  if (role.includes('sef')) return 0;
  if (role.includes('bolge sorumlusu') || role.includes('organizasyon sorumlusu')) return 1;
  if (role.includes('birim sorumlusu')) return 2;
  return 3;
}

export default function CommandCenterScreen({ mode = 'city' }) {
  const data = useCommandCenter();
  const showMaps = useDesktopMaps();
  const [mapExpanded, setMapExpanded] = useState(false);
  const mapRef = useRef(null);
  const closeMapFocus = useCallback(() => setMapExpanded(false), []);
  const isMapFocused = mapExpanded && showMaps && mode === 'city';
  useMapFocus(isMapFocused, mapRef, closeMapFocus);
  const { role, canWrite, canManageTasks, canOverridePlan, canImport, canManageSettings, canViewPhone, unitId: chiefUnitId } = usePanelAccess();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const route = useParams();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState(null);
  const [fieldFeedReloadKey, setFieldFeedReloadKey] = useState(0);
  const [directoryReloadKey, setDirectoryReloadKey] = useState(0);
  const [taskReloadKey, setTaskReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [directoryState, setDirectoryState] = useState({ key: '', rows: [], offset: 0, hasMore: false, loadingMore: false, error: '' });
  const [taskDirectoryState, setTaskDirectoryState] = useState({ key: '', rows: [], offset: 0, hasMore: false, loadingMore: false, error: '' });
  const [directoryPageView, setDirectoryPageView] = useState({ key: '', count: 100 });
  const [mapMode, setMapMode] = useState(() => {
    try { return localStorage.getItem('syp_default_map_dim') === '3d' ? '3d' : '2d'; }
    catch { return '2d'; }
  });
  const [layer, setLayer] = useState('Personel Yoğunluğu');

  useEffect(() => {
    const timer = window.setTimeout(() => setServerSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const profilePerson = mode === 'person' ? data.allPersonnel.find((p) => p.personelId === route.personelId || normalizeText(p.adSoyad) === normalizeText(route.personelAdi)) : null;
  const unit = String(chiefUnitId || profilePerson?.birimId || UNIT_PATHS[location.pathname] || route.birimId || params.get('unit') || '');
  const subunit = params.get('subunit') || '';
  const unitMap = useMemo(() => ({ ...(data.catalog.unitMap || UNITS), SAHA_HIZMETLERI: UNITS.SAHA_HIZMETLERI }), [data.catalog.unitMap]);
  const square = mode === 'square' ? squares.find((s) => s.id === route.id) : null;
  const neighborhood = route.mahalleSlug
    ? data.catalog.neighborhoods.find((n) => (n.slug === route.mahalleSlug || n.id === route.mahalleSlug) && (!route.ilceSlug || n.districtId === route.ilceSlug))
    : null;
  const districtId = route.ilceSlug || square?.districtId || neighborhood?.districtId || params.get('district') || '';
  const district = data.catalog.districts.find((d) => d.id === districtId);
  const neighborhoodId = neighborhood?.id || params.get('neighborhood') || '';

  const filters = useMemo(() => ({ from: data.from, to: data.to, unit, district: districtId, neighborhood: neighborhoodId, square: square?.id || '' }), [data.from, data.to, unit, districtId, neighborhoodId, square?.id]);
  const scope = aggregateOperations(data.plans, data.activities, data.tasks, filters);
  const freshnessRecords = [
    ...scope.plans,
    ...scope.activities,
    ...data.openTasks.filter((record) => inScope(record, filters, false)),
    ...data.unitStatus.filter((record) => !unit || record.birimId === unit),
  ];
  const scopedServicePoints = (data.catalog.servicePoints || []).filter((point) => point.active && (!unit || point.birimId === unit) && (!districtId || point.ilceId === districtId) && (!neighborhoodId || point.mahalleId === neighborhoodId));
  const person = profilePerson;

  useEffect(() => {
    if (mapExpanded && (!showMaps || mode !== 'city')) setMapExpanded(false);
  }, [mapExpanded, showMaps, mode]);

  const tabs = commandTabs(unit);
  const tab = normalizeCommandTab(params.get('tab'), mode, unit);
  const title = mode === 'unit' ? unitMap[unit]
    : mode === 'district' ? district?.name
    : mode === 'neighborhood' ? `${neighborhood?.name || ''} Mahallesi`
    : mode === 'square' ? square?.name
    : mode === 'person' ? person?.adSoyad
    : ({ city: 'Şehir Takip', units: 'Birimler', personnel: `${unitMap[unit] || 'Birim'} Personeli`, tasks: 'Takip Edilen İşler', fieldUpdates: 'Saha Akışı', reports: 'Raporlar', import: 'Veri Yükleme', settings: 'Ayarlar', assistant: 'Saha Asistanı', faq: 'Sık Sorulan Sorular', guide: 'Panel Nasıl Kullanılır?' })[mode];

  const queryString = `?from=${data.from}&to=${data.to}${unit ? `&unit=${unit}` : ''}`;
  const personnelListKey = `${unit}|${subunit}|${serverSearch}|${data.from}|${data.to}|${directoryReloadKey}`;
  const taskRecordId = params.get('record') || '';
  const taskListKey = `${unit}|${districtId}|${serverSearch}|${data.from}|${data.to}|${taskRecordId}|${taskReloadKey}`;
  const personnelVisibleCount = directoryPageView.key === personnelListKey ? directoryPageView.count : 100;

  function update(values) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      for (const [k, v] of Object.entries(values)) {
        if (v) next.set(k, v); else next.delete(k);
      }
      return next;
    });
  }

  const openForm = (kind, initial = null) => setForm({
    kind, initial,
    defaults: {
      birimId: unit || (kind === 'tasks' ? '' : 'MEYDAN'), ilceId: districtId, mahalleId: neighborhoodId,
      meydanId: square?.id || '', gorevYeri: square?.name || '', personelId: person?.personelId || '',
      ...(kind === 'fieldUpdates' ? { tarih: todayKey(), saat: new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) } : {}),
    },
  });

  const linkedForm = useMemo(() => {
    const id = params.get('record');
    if (!id || !data.ready) return null;
    const taskRows = data.trackedWorkDirectory ? taskDirectoryState.rows : data.tasks;
    const found = [['plans', data.plans], ['activities', data.activities], ['tasks', taskRows]].find(([, rows]) => rows.some((r) => (r.recordId || r.id) === id));
    return found ? { kind: found[0], initial: found[1].find((r) => (r.recordId || r.id) === id), defaults: {} } : null;
  }, [params, data.ready, data.plans, data.activities, data.tasks, data.trackedWorkDirectory, taskDirectoryState.rows]);

  const mapMetrics = useMemo(() => buildCommandMapMetrics({
    districts: data.catalog.districts, squares, plans: data.plans, activities: data.activities, tasks: data.openTasks,
    from: data.from, to: data.to, unit, ready: data.ready,
  }), [data.catalog.districts, data.plans, data.activities, data.openTasks, data.from, data.to, data.ready, unit]);

  const mapDistrictId = String(districtId);
  const neighborhoodMetrics = useMemo(() => buildNeighborhoodMapMetrics({
    districtId: mapDistrictId, neighborhoods: data.catalog.neighborhoods, plans: data.plans, activities: data.activities,
    tasks: data.openTasks, servicePoints: data.catalog.servicePoints,
    from: data.from, to: data.to, unit,
    status: data.loading ? 'loading' : !data.ready ? 'unavailable'
      : data.unitStatus.some(s => (!unit || s.birimId === unit) && s.veriVar)
        || [...data.plans, ...data.activities, ...data.openTasks, ...data.catalog.servicePoints].some(r => !r.arsivli && inScope(r, { unit }, false)) ? 'ready' : 'waiting',
  }), [mapDistrictId, data.catalog.neighborhoods, data.plans, data.activities, data.openTasks, data.catalog.servicePoints,
    data.from, data.to, unit, data.loading, data.ready, data.unitStatus]);

  const matchesSearch = (r) => !search || normalizeText(Object.values(r).filter((v) => typeof v === 'string').join(' ')).includes(normalizeText(search));
  const matchesPerson = (p) => matchesSearch(p) || scope.plans.some((s) => s.personelId === p.personelId && matchesSearch(s));
  const fetchPersonnelPage = useCallback(async (offset, existingRows = [], desiredCount = 100) => {
    let cursor = offset, hasMore = true, rows = [...existingRows];
    const existingIds = new Set(rows.map(person => person.personelId));
    const searchNeedle = normalizeText(serverSearch);
    const scopedPlans = data.plans.filter(plan => inScope(plan, filters));
    const searchIds = searchNeedle ? [...new Set(scopedPlans.filter(plan => normalizeText(Object.values(plan).filter(value => typeof value === 'string').join(' ')).includes(searchNeedle)).map(plan => plan.personelId).filter(Boolean))].slice(0, 200) : [];
    while (rows.length - existingRows.length < desiredCount && hasMore) {
      const page = await getRowsPage('personnel', { unitId: unit, includeArchived: false, ...(serverSearch && !subunit ? { search: serverSearch, searchIds } : {}), pageSize: 100, offset: cursor });
      cursor += page.rows.length;
      hasMore = page.hasMore;
      if (!page.rows.length) break;
      let people = page.rows;
      if (canViewPhone) {
        const phones = await getRows('phones', { personnelIds: people.map(person => person.personelId) });
        const phoneById = new Map(phones.map(phone => [phone.personelId, phone.telefon]));
        people = people.map(person => ({ ...person, telefon: phoneById.get(person.personelId) || '' }));
      }
      for (const person of people) {
        if (person.arsivli || isUnitLeadership(person)) continue;
        if (districtId && !scopedPlans.some(plan => plan.personelId === person.personelId)) continue;
        if (subunit) {
          const source = String(person.ozelAlanlar?.source || '');
          const details = normalizeText(`${source} ${person.ekip || ''} ${person.ozelAlanlar?.birim || ''}`);
          const point = (data.catalog.servicePoints || []).find(item => item.id === person.cozumNoktasiId);
          const pointName = normalizeText(point?.name || '');
          const matchesSubunit = subunit === 'avrupa' ? source.includes('Avrupa')
            : subunit === 'anadolu' ? source.includes('Anadolu')
            : ['kampuste', 'mahallede', 'kamuoyu'].includes(subunit) ? person.birimId === 'SAHA_HIZMETLERI' && details.includes({ kampuste: 'kampus', mahallede: 'mahalle', kamuoyu: 'kamuoyu' }[subunit])
            : ['bolge-1', 'bolge-2', 'bolge-3'].includes(subunit) ? person.birimId === 'SAHA_HIZMETLERI' && normalizeText(`${person.unvan || ''} ${person.ekip || ''} ${person.ozelAlanlar?.bolge || ''}`).replace(/\s+/g, '').includes(`${subunit.replace('bolge-', '')}.bolge`)
            : subunit === 'sube' ? Boolean(point && point.tip === 'SUBE')
            : subunit === 'avm' ? Boolean(pointName.includes('avm'))
            : subunit === 'nokta' ? Boolean(point && point.tip !== 'SUBE' && !pointName.includes('avm')) : true;
          if (!matchesSubunit) continue;
        }
        const personText = normalizeText(Object.values(person).filter(value => typeof value === 'string').join(' '));
        const planMatch = scopedPlans.some(plan => plan.personelId === person.personelId && normalizeText(Object.values(plan).filter(value => typeof value === 'string').join(' ')).includes(searchNeedle));
        if (searchNeedle && !personText.includes(searchNeedle) && !planMatch) continue;
        if (!existingIds.has(person.personelId)) {
          existingIds.add(person.personelId);
          rows.push(person);
        }
      }
    }
    return { rows, offset: cursor, hasMore };
  }, [unit, serverSearch, subunit, districtId, canViewPhone, data.catalog.servicePoints, data.plans, filters]);
  useEffect(() => {
    if (!data.personnelDirectory || mode !== 'personnel') return undefined;
    let active = true;
    fetchPersonnelPage(0, [], 100).then(page => {
      if (active) setDirectoryState({ key: personnelListKey, ...page, loadingMore: false, error: '' });
    }).catch(error => {
      if (active) setDirectoryState({ key: personnelListKey, rows: [], offset: 0, hasMore: false, loadingMore: false, error: error.message || 'Personel listesi alınamadı.' });
    });
    return () => { active = false; };
  }, [data.personnelDirectory, mode, personnelListKey, fetchPersonnelPage]);
  const loadMorePersonnel = async () => {
    if (directoryPageView.key === personnelListKey && personnelVisibleCount < orderedPersonnel.length) {
      setDirectoryPageView({ key: personnelListKey, count: personnelVisibleCount + 100 });
      return;
    }
    if (!directoryState.hasMore || directoryState.loadingMore || directoryState.key !== personnelListKey) return;
    setDirectoryState(current => ({ ...current, loadingMore: true, error: '' }));
    try {
      const page = await fetchPersonnelPage(directoryState.offset, directoryState.rows, 100);
      setDirectoryState({ key: personnelListKey, ...page, loadingMore: false, error: '' });
      setDirectoryPageView({ key: personnelListKey, count: personnelVisibleCount + 100 });
    } catch (error) {
      setDirectoryState(current => ({ ...current, loadingMore: false, error: error.message || 'Daha fazla personel alınamadı.' }));
    }
  };

  const fetchTaskPage = useCallback(async (offset, existingRows = []) => {
    const query = {
      from: data.from,
      to: data.to,
      includeArchived: false,
      pageSize: 100,
      offset,
      ...(unit ? { participantUnitId: unit } : {}),
      ...(districtId ? { districtId } : {}),
      ...(serverSearch ? { search: serverSearch } : {}),
    };
    const [page, requested] = await Promise.all([
      getRowsPage('tasks', query),
      offset === 0 && taskRecordId ? getRowById('tasks', taskRecordId) : Promise.resolve(null),
    ]);
    const requestedMatches = requested && !requested.arsivli
      && requested.tarih >= data.from && requested.tarih <= data.to
      && (!unit || requested.birimId === unit || requested.katilimciBirimIds?.includes(unit))
      && (!districtId || requested.ilceId === districtId)
      && (!serverSearch || normalizeText(Object.values(requested).filter(value => typeof value === 'string').join(' ')).includes(normalizeText(serverSearch)));
    const merged = [...existingRows, ...(requestedMatches && !existingRows.some(item => item.recordId === requested.recordId) && !page.rows.some(item => item.recordId === requested.recordId) ? [requested] : []), ...page.rows];
    const unique = [...new Map(merged.map(item => [item.recordId, item])).values()];
    return { rows: unique, offset: offset + page.rows.length, hasMore: page.hasMore };
  }, [data.from, data.to, unit, districtId, serverSearch, taskRecordId]);

  useEffect(() => {
    if (!data.trackedWorkDirectory || mode !== 'tasks') return undefined;
    let active = true;
    fetchTaskPage(0).then(page => {
      if (active) setTaskDirectoryState({ key: taskListKey, ...page, loadingMore: false, error: '' });
    }).catch(error => {
      if (active) setTaskDirectoryState({ key: taskListKey, rows: [], offset: 0, hasMore: false, loadingMore: false, error: error.message || 'Takip işleri alınamadı.' });
    });
    return () => { active = false; };
  }, [data.trackedWorkDirectory, mode, taskListKey, fetchTaskPage]);

  const loadMoreTasks = async () => {
    if (!taskDirectoryState.hasMore || taskDirectoryState.loadingMore || taskDirectoryState.key !== taskListKey) return;
    setTaskDirectoryState(current => ({ ...current, loadingMore: true, error: '' }));
    try {
      const page = await fetchTaskPage(taskDirectoryState.offset, taskDirectoryState.rows);
      setTaskDirectoryState({ key: taskListKey, ...page, loadingMore: false, error: '' });
    } catch (error) {
      setTaskDirectoryState(current => ({ ...current, loadingMore: false, error: error.message || 'Daha fazla takip işi alınamadı.' }));
    }
  };

  const editBtn = (kind, r) => (
    <button onClick={() => openForm(kind, r)}>
      {(kind === 'tasks' ? canManageTasks : canWrite) ? 'Düzenle / geçmiş' : 'Ayrıntı / geçmiş'}
    </button>
  );

  // ─── Record list renderer ───
  const recordList = (kind, rows) => {
    const filteredRows = rows.filter(matchesSearch);
    return (
      <>
        {(kind === 'tasks' ? canManageTasks : canWrite) && (
          <button className="cc-primary" disabled={!data.ready} onClick={() => openForm(kind)}>
            + {kind === 'activities' ? 'Öne çıkan çalışma ekle' : 'Kayıt ekle'}
          </button>
        )}
        {!filteredRows.length ? <Empty>{search ? 'Aramanızla eşleşen kayıt bulunamadı.' : undefined}</Empty> : (
          <div className="cc-cards">
            {filteredRows.map((r) => (
              <article className="cc-record" key={r.recordId || r.id}>
                <div className="cc-record-head">
                  <h3>{r.baslik || r.yapilanIs}</h3>
                  {r.durum && <span className={`cc-badge ${r.durum === 'Tamamlandı' ? 'cc-done' : ''}`}>{r.durum}</span>}
                </div>
                <p>{unitMap[r.birimId] || r.birimId || 'Genel'} · {r.gorevYeri}</p>
                <p>{r.tarih}{r.hedefTarih && ` · Hedef: ${r.hedefTarih}`}</p>
                {r.sorumlu && <p>Sorumlu: {r.sorumlu}</p>}
                {r.ekip && <p>Ekip: {r.ekip}</p>}
                {r.personelId && (
                  <Link to={`/personel/detay/${r.personelId}${queryString}`}>
                    {data.personnel.find((p) => p.personelId === r.personelId)?.adSoyad || r.personelId}
                  </Link>
                )}
                {r.sonuc && <p>{r.sonuc}</p>}
                {r.not && <p>{r.not}</p>}
                {r.durum === 'Tamamlandı' && <p><strong>Kapanış notu:</strong> {r.kapanisNotu}</p>}
                {r.fotoUrl && <RecordPhoto className="cc-record-photo" value={r.fotoUrl} alt="Kayda eklenen fotoğraf" />}
                {editBtn(kind, { ...r, recordId: r.recordId || r.id })}
              </article>
            ))}
          </div>
        )}
      </>
    );
  };

  // ─── Planned people view ───
  const plannedPeople = data.personnel.filter((p) => scope.plans.some((s) => s.personelId === p.personelId));
  const plansView = (
    <>
      <div className="cc-section-title">
        <h2>Birim çalışma planı ve iletişim</h2>
        {(canWrite || canOverridePlan) && <button disabled={!data.ready} onClick={() => openForm('plans')}>+ Birim çalışma planı ekle</button>}
      </div>
      <p className="cc-muted">Birimlerden gelen haftalık plan · {data.from} – {data.to}</p>
      {unit === 'YERINDE_COZUM' && scope.plans.some((plan) => plan.planKapsami && plan.planKapsami !== 'ILCE') && (
        <section className="cc-panel cc-region-plans" aria-labelledby="cc-region-plans-title">
          <div className="cc-section-title"><div><p className="cc-eyebrow">COĞRAFİ KAPSAM</p><h3 id="cc-region-plans-title">Bölge planları</h3><p className="cc-muted">İlçe bilgisi kesinleşmemiş yaka, bölge, ekip ve merkez planları. Harita toplamlarına dahil edilmez.</p></div></div>
          <div className="cc-cards cc-cards--compact">
            {[...new Map(scope.plans.filter((plan) => plan.planKapsami && plan.planKapsami !== 'ILCE').map((plan) => [`${plan.planKapsami}:${plan.kapsamAdi}`, { type: plan.planKapsami, name: plan.kapsamAdi, people: new Set(), count: 0 }])).entries()].map(([key, entry]) => {
              const matching = scope.plans.filter((plan) => `${plan.planKapsami}:${plan.kapsamAdi}` === key);
              matching.forEach((plan) => entry.people.add(plan.personelId)); entry.count = matching.length;
              return <article className="cc-record" key={key}><strong>{entry.people.size}</strong><p>{entry.name || PLAN_SCOPE_LABELS[entry.type]}</p><small>{PLAN_SCOPE_LABELS[entry.type] || 'Çalışma planı'} · {entry.count} plan</small></article>;
            })}
          </div>
        </section>
      )}
      {plannedPeople.length ? (
        <div className="cc-cards">
          {plannedPeople.filter(matchesPerson).map((p) => (
            <PersonCard
              key={p.personelId}
              person={p}
              plans={scope.plans.filter((s) => s.personelId === p.personelId)}
              queryString={queryString}
              role={role}
              unitMap={unitMap}
              onEdit={openForm}
            />
          ))}
        </div>
      ) : (
        <Empty>Bu kapsamda personelle eşleşen görev planı bulunmuyor.</Empty>
      )}
      {/* Eşleştirme bekleyen görevler */}
      {scope.plans.filter((p) => !data.personnel.some((x) => x.personelId === p.personelId)).map((p) => (
        <article className="cc-record" key={p.recordId}>
          <strong>{p.adSoyad || 'Eşleştirme bekleyen görev'}</strong>
          <p>{p.gorevYeri} · {p.tarih} · {p.baslangic}–{p.bitis}</p>
          <p className="cc-muted">Bu eski kaydı personel koduyla eşleştirmek gerekiyor.</p>
          {editBtn('plans', p)}
        </article>
      ))}
    </>
  );

  // ─── Squares view ───
  const squaresView = (
    <div className="cc-cards">
      {squares.filter((s) => (!districtId || s.districtId === districtId) && matchesSearch(s)).map((s) => (
        <Link className="cc-square cc-record" key={s.id} to={`/meydan/${s.id}${queryString}`}>
          {s.heroImage && <img src={s.heroImage} alt={s.name} loading="lazy" />}
          <h3>{s.name}</h3>
          <p>{s.district} · {s.kategori}</p>
        </Link>
      ))}
    </div>
  );

  const pointsView = (
    <>
      <div className="cc-section-title"><div><h2>Çözüm noktaları ve şubeleri</h2><p className="cc-muted">İlçe, mahalle, meydan ve vardiya bilgileri kayıt geldikçe görünür.</p></div><Link className="cc-button cc-primary" to={`/cozum-noktalari/noktalar${queryString}`}>Tüm noktalar</Link></div>
      {(data.catalog.servicePoints || []).filter(p => p.active && (!districtId || p.ilceId === districtId) && (!neighborhoodId || p.mahalleId === neighborhoodId)).length
        ? <div className="cc-cards">{data.catalog.servicePoints.filter(p => p.active && (!districtId || p.ilceId === districtId) && (!neighborhoodId || p.mahalleId === neighborhoodId)).map(p => <Link className="cc-record" key={p.id} to={`/cozum-noktalari/noktalar/${encodeURIComponent(p.id)}${queryString}`}><h3>{p.name}</h3><p>{data.catalog.districts.find(d => d.id === p.ilceId)?.name || p.ilceId}{p.mahalleId ? ` · ${data.catalog.neighborhoods.find(n => n.id === p.mahalleId)?.name || p.mahalleId}` : ''}</p></Link>)}</div>
        : <Empty>Veri Bekleniyor. Çözüm noktaları kaydedildiğinde burada listelenecek.</Empty>}
    </>
  );

  // ─── Filtered personnel ───
  const personnelSource = data.personnelDirectory && directoryState.key === personnelListKey ? directoryState.rows : data.personnel;
  const filteredPersonnel = personnelSource.filter((p) =>
    (!unit || p.birimId === unit)
    && !(unit && ['YERINDE_COZUM', 'SAHA_HIZMETLERI', 'COZUM_NOKTALARI', 'MEYDAN'].includes(unit) && isUnitLeadership(p))
    && (!subunit || (subunit === 'avrupa' ? String(p.ozelAlanlar?.source || '').includes('Avrupa') : subunit === 'anadolu' ? String(p.ozelAlanlar?.source || '').includes('Anadolu') : ['kampuste', 'mahallede', 'kamuoyu'].includes(subunit) ? (p.birimId === 'SAHA_HIZMETLERI' && normalizeText(`${p.ozelAlanlar?.source || ''} ${p.ekip || ''} ${p.ozelAlanlar?.birim || ''}`).includes({ kampuste: 'kampus', mahallede: 'mahalle', kamuoyu: 'kamuoyu' }[subunit])) : ['bolge-1', 'bolge-2', 'bolge-3'].includes(subunit) ? (p.birimId === 'SAHA_HIZMETLERI' && normalizeText(`${p.unvan || ''} ${p.ekip || ''} ${p.ozelAlanlar?.bolge || ''}`).replace(/\s+/g, '').includes(`${subunit.replace('bolge-', '')}.bolge`)) : subunit === 'sube' ? Boolean(p.cozumNoktasiId && (data.catalog.servicePoints || []).find(point => point.id === p.cozumNoktasiId)?.tip === 'SUBE') : subunit === 'avm' ? Boolean(p.cozumNoktasiId && normalizeText((data.catalog.servicePoints || []).find(point => point.id === p.cozumNoktasiId)?.name || '').includes('avm')) : subunit === 'nokta' ? Boolean(p.cozumNoktasiId && (data.catalog.servicePoints || []).find(point => point.id === p.cozumNoktasiId)?.tip !== 'SUBE' && !normalizeText((data.catalog.servicePoints || []).find(point => point.id === p.cozumNoktasiId)?.name || '').includes('avm')) : true))
    && (!districtId || scope.plans.some((s) => s.personelId === p.personelId))
    && matchesPerson(p)
  );
  const orderedPersonnel = [...filteredPersonnel].sort((a, b) => {
    const rank = (person) => {
      const role = leadershipRoleText(person);
      if (role.includes('ekip sorumlusu')) return 0;
      return 1;
    };
    return rank(a) - rank(b) || String(a.adSoyad || '').localeCompare(String(b.adSoyad || ''), 'tr');
  });
  const resolvedVirtualLeaders = (VIRTUAL_LEADERS[unit] || []).map((leader) => {
    const matchingPersonnel = data.personnel.find((candidate) => normalizeText(candidate.adSoyad) === normalizeText(leader.adSoyad));
    return matchingPersonnel ? { ...matchingPersonnel, ...leader, personelId: matchingPersonnel.personelId, sistemPersonelKodu: matchingPersonnel.sistemPersonelKodu, telefon: matchingPersonnel.telefon || '', isVirtual: false, isDeclaredLeader: true } : { ...leader, isDeclaredLeader: true };
  });
  const resolvedLeaderIds = new Set(resolvedVirtualLeaders.filter((leader) => !leader.isVirtual).map((leader) => leader.personelId));
  const leadershipPersonnel = [...resolvedVirtualLeaders, ...data.personnel.filter((candidate) => !resolvedLeaderIds.has(candidate.personelId))]
    .filter((p) => p.birimId === unit)
    .filter((p) => p.isDeclaredLeader || isUnitLeadership(p))
    .sort((a, b) => leadershipRank(a) - leadershipRank(b) || String(a.adSoyad || '').localeCompare(String(b.adSoyad || ''), 'tr'));

  const listKind = mode === 'tasks';
  const unitHasOperationalData = Boolean(scope.plans.length || scope.activities.length || data.openTasks.some((r) => inScope(r, filters, false)) || (unit === SOLUTION_POINTS_UNIT && data.catalog.servicePoints.some((p) => p.active)));
  const executiveAnalytics = useMemo(() => {
    const currentPlans = data.plans.filter((record) => inScope(record, filters));
    const currentActivities = data.activities.filter((record) => inScope(record, filters));
    const currentPeople = new Set(currentPlans.map((record) => record.personelId).filter(Boolean)).size;
    const plannedNeighbourhoodIds = new Set(currentPlans.map((record) => record.mahalleId).filter(Boolean));
    const activityNeighbourhoodIds = new Set(currentActivities.map((record) => record.mahalleId).filter(Boolean));
    const planOnlyNeighbourhoodIds = [...plannedNeighbourhoodIds].filter((id) => !activityNeighbourhoodIds.has(id));
    const denominatorNeighbourhoods = data.catalog.neighborhoods.filter((item) => !filters.district || item.districtId === filters.district).length;
    const districtStats = new Map();
    const neighbourhoodStats = new Map();
    const unitStats = new Map();
    const bump = (map, id, key, amount = 1) => {
      if (!id) return;
      const row = map.get(id) || { plans: 0, activities: 0, people: new Set() };
      row[key] += amount;
      map.set(id, row);
    };
    currentPlans.forEach((p) => {
      bump(districtStats, p.ilceId, 'plans');
      bump(neighbourhoodStats, p.mahalleId, 'plans');
      const u = unitStats.get(p.birimId) || { plans: 0, activities: 0, people: new Set() };
      u.plans += 1; if (p.personelId) u.people.add(p.personelId); unitStats.set(p.birimId, u);
    });
    currentActivities.forEach((a) => {
      bump(districtStats, a.ilceId, 'activities');
      bump(neighbourhoodStats, a.mahalleId, 'activities');
      const u = unitStats.get(a.birimId) || { plans: 0, activities: 0, people: new Set() };
      u.activities += 1; unitStats.set(a.birimId, u);
    });
    const openByDistrict = new Map();
    data.openTasks.filter((r) => inScope(r, filters, false)).forEach((r) => { if (r.ilceId) openByDistrict.set(r.ilceId, (openByDistrict.get(r.ilceId) || 0) + 1); });
    const districtRows = data.catalog.districts.map((district) => {
      const s = districtStats.get(district.id) || { plans: 0, activities: 0, people: new Set() };
      const neighbourhoods = data.catalog.neighborhoods.filter((n) => n.districtId === district.id);
      const activityNeighbourhoods = new Set(currentActivities.filter((a) => a.ilceId === district.id && a.mahalleId).map((a) => a.mahalleId));
      const open = openByDistrict.get(district.id) || 0;
      // Öne çıkan çalışmalar seçilmiş haftalık kayıtlardır; yoklukları performans veya kapsama açığı anlamına gelmez.
      const state = open >= 5 ? 'open' : '';
      return { id: district.id, name: district.name, ...s, open, neighbourhoods: neighbourhoods.length, activityNeighbourhoods: activityNeighbourhoods.size, state };
    }).sort((a, b) => (b.plans + b.activities) - (a.plans + a.activities));
    const neighbourhoodRows = [...neighbourhoodStats].map(([id, s]) => ({ id, name: data.catalog.neighborhoods.find((n) => n.id === id)?.name || id, district: data.catalog.districts.find((d) => d.id === data.catalog.neighborhoods.find((n) => n.id === id)?.districtId)?.name || '', ...s })).sort((a, b) => (b.plans + b.activities) - (a.plans + a.activities));
    const priorityRows = districtRows.filter((r) => r.state).sort((a, b) => (b.open - a.open) || (a.activities - b.activities));
    const previousFilters = { ...filters, from: data.previousFrom, to: data.previousTo };
    const previousPlans = data.previousPlans.filter((r) => inScope(r, previousFilters));
    const previousActivities = data.previousActivities.filter((r) => inScope(r, previousFilters));
    const previousTasks = data.previousTasks.filter((r) => inScope(r, previousFilters));
    const previousPeople = new Set(previousPlans.map((r) => r.personelId).filter(Boolean)).size;
    const previousCoverage = new Set(previousActivities.map((r) => r.mahalleId).filter(Boolean)).size;
    const previousUnitActivity = new Map();
    previousActivities.forEach((record) => previousUnitActivity.set(record.birimId, (previousUnitActivity.get(record.birimId) || 0) + 1));
    const unitRows = [...unitStats].map(([id, s]) => ({ id, name: unitMap[id] || id, ...s, total: s.plans + s.activities, previousActivities: previousUnitActivity.get(id) || 0 })).sort((a, b) => b.total - a.total);
    const comparison = {
      label: `${previousFilters.from} – ${previousFilters.to}`,
      personnel: { current: currentPeople, previous: previousPeople },
      activities: { current: currentActivities.length, previous: previousActivities.length },
      tasks: { current: data.tasks.filter((r) => inScope(r, filters)).length, previous: previousTasks.length },
      coverage: { current: new Set(currentActivities.map((r) => r.mahalleId).filter(Boolean)).size, previous: previousCoverage },
    };
    return {
      districtRows, neighbourhoodRows, unitRows, priorityRows, comparison,
      topDistrict: districtRows.find((r) => r.plans || r.activities),
      topActivityDistrict: [...districtRows].sort((a, b) => b.activities - a.activities)[0],
      coveredNeighbourhoods: activityNeighbourhoodIds.size,
      plannedNeighbourhoods: plannedNeighbourhoodIds.size,
      planOnlyNeighbourhoods: planOnlyNeighbourhoodIds.map((id) => {
        const neighbourhood = data.catalog.neighborhoods.find((item) => item.id === id);
        const district = data.catalog.districts.find((item) => item.id === neighbourhood?.districtId);
        return { id, name: neighbourhood?.name || id, districtId: neighbourhood?.districtId, district: district?.name || '' };
      }).sort((a, b) => a.district.localeCompare(b.district, 'tr') || a.name.localeCompare(b.name, 'tr')),
      denominatorNeighbourhoods,
      activityCoveragePercent: denominatorNeighbourhoods ? Math.round((activityNeighbourhoodIds.size / denominatorNeighbourhoods) * 1000) / 10 : 0,
    };
  }, [data.plans, data.activities, data.tasks, data.openTasks, data.previousPlans, data.previousActivities, data.previousTasks, data.previousFrom, data.previousTo, data.catalog.districts, data.catalog.neighborhoods, filters, unitMap]);
  const todayFieldUpdates = data.fieldUpdates
    .filter((item) => !item.arsivli && item.tarih === todayKey())
    .filter((item) => !unit || item.birimId === unit)
    .filter((item) => !districtId || item.ilceId === districtId)
    .sort((a, b) => `${b.tarih}T${b.saat}`.localeCompare(`${a.tarih}T${a.saat}`));
  const physicalPlaces = useMemo(() => {
    if (!['district', 'neighborhood'].includes(mode) || !districtId) return { points: [], squares: [] };
    return getPhysicalPlaceAssociations({ mode, districtId, neighborhoodId, servicePoints: data.catalog.servicePoints, squares });
  }, [mode, districtId, neighborhoodId, data.catalog.servicePoints]);
  const locationSummary = useMemo(() => {
    if (!['district', 'neighborhood'].includes(mode) || !districtId) return null;
    const openTasks = data.openTasks.filter((r) => inScope(r, filters, false)).length;
    return { points: physicalPlaces.points.length, squares: physicalPlaces.squares.length, openTasks };
  }, [mode, districtId, data.openTasks, filters, physicalPlaces]);
  const unitDataWaiting = mode === 'unit' && unit && !data.unitStatus.some((s) => s.birimId === unit && s.veriVar);
  const forbidden = (chiefUnitId && route.birimId && chiefUnitId !== route.birimId) || (mode === 'import' && !canImport) || (mode === 'settings' && !canManageSettings);
  const invalidRoute = (mode === 'district' && !district) || (mode === 'neighborhood' && !neighborhood) || (mode === 'square' && !square) || (route.birimId && !unitMap[route.birimId]);

  return (
    <main className={`cc-workspace${mode === 'city' ? ' cc-workspace--city' : ''}`}>
      {/* ─── Page Header ─── */}
      <header className="cc-page-header">
        <div>
          <p className="cc-eyebrow">İBB · Halkla İlişkiler · Saha Komuta Merkezi</p>
          <h1>{title || 'Kayıt bulunamadı'}</h1>
          <p>Görev dağılımı, çalışmalar ve yönetim takibi</p>
        </div>
        <Link className="cc-button cc-primary" to={`/asistan${queryString}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          Saha Asistanı
        </Link>
      </header>

      {/* ─── Breadcrumb ─── */}
      {mode !== 'city' && mode !== 'fieldUpdates' && (
        <nav className="cc-breadcrumb" aria-label="Konum">
          <Link to={`/${queryString}`}>Şehir Takip</Link>
          {district && mode !== 'district' && <Link to={`/ilce/${district.id}${queryString}`}>{district.name}</Link>}
          <span>{title}</span>
        </nav>
      )}

      {/* ─── Filters ─── */}
      {!['settings', 'import', 'faq', 'guide', 'units', 'unit', 'fieldUpdates'].includes(mode) && (
        <section className="cc-filters" aria-label="Görünüm filtreleri">
          {!UNIT_PATHS[location.pathname] && !route.birimId && mode !== 'person' && !chiefUnitId && (
            <label>
              Birim
              <select value={unit} onChange={(e) => update({ unit: e.target.value })}>
                <option value="">Tüm birimler</option>
                {Object.entries(unitMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          )}
          {!['district', 'neighborhood', 'square', 'person'].includes(mode) && (
            <label>
              İlçe
              <select value={districtId} onChange={(e) => update({ district: e.target.value, neighborhood: '' })}>
                <option value="">İstanbul geneli</option>
                {data.catalog.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          {districtId && !['neighborhood', 'square'].includes(mode) && (
            <label>
              Mahalle
              <select value={neighborhoodId} onChange={(e) => update({ neighborhood: e.target.value })}>
                <option value="">Tüm mahalleler</option>
                {data.catalog.neighborhoods.filter((n) => n.districtId === districtId).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>
          )}
          <label>
            Dönem
            <select
              aria-label="Dönem"
              value={params.get('period') || (data.from === todayKey() && data.to === todayKey() ? 'today' : 'custom')}
              onChange={(e) => { const period = e.target.value; update({ period, ...(period !== 'custom' ? dateRange(period) : {}) }); }}
            >
              <option value="today">Bugün</option>
              <option value="week">Bu hafta</option>
              <option value="month">Bu ay</option>
              <option value="custom">Özel aralık</option>
            </select>
          </label>
          <label>
            Başlangıç
            <input type="date" value={data.from} max={data.to} onChange={(e) => { if (validDate(e.target.value)) update({ from: e.target.value, period: 'custom' }); }} />
          </label>
          <label>
            Bitiş
            <input type="date" value={data.to} min={data.from} onChange={(e) => { if (validDate(e.target.value)) update({ to: e.target.value, period: 'custom' }); }} />
          </label>
          {data.clamped && (
            <span className="cc-pill" title="Mobil performans ve bellek güvenliği için sorgu en fazla 90 gün ile sınırlandırılmıştır." style={{ alignSelf: 'center', fontSize: '0.75rem', color: '#f59e0b', borderColor: '#f59e0b' }}>
              Azami 90 gün
            </span>
          )}
          {!['person', 'reports'].includes(mode) && <label className="cc-search">
            Ara
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mode === 'tasks' ? 'Başlık, sorumlu veya kayıt kodu' : 'Personel, ekip veya görev yeri'}
            />
          </label>}
          {!data.live && <button type="button" className="cc-button" disabled={data.loading} onClick={data.retry} title="Bu sayfa açılışta yüklenen veriyi gösterir; en güncel kayıtlar için yenileyin.">Verileri yenile</button>}
        </section>
      )}

      {/* ─── Loading / Error States ─── */}
      {data.loading && <p role="status" className="cc-notice">Kayıtlar yükleniyor…</p>}
      {data.errors.length > 0 && (
        <div role="alert" className="cc-error">
          <strong>Verilerin tamamı alınamadı.</strong>
          {data.errors.map((e) => <p key={e.key}>{KINDS[e.key === 'openTasks' ? 'tasks' : e.key]?.label || 'Personel bilgileri'}: {e.message}</p>)}
          <button onClick={data.retry}>Yeniden dene</button>
        </div>
      )}

      {/* ─── Access & Route Guards ─── */}
      {forbidden ? <Empty>Bu alan yalnızca yöneticiye açıktır.</Empty>
      : invalidRoute ? <Empty>Bu konum bulunamadı. Şehir Takip ekranından yeniden seçin.</Empty>
      : (
        <>
          {data.ready && !['import', 'settings', 'faq', 'guide', 'assistant', 'fieldUpdates'].includes(mode) && (
            <DataFreshnessNotice records={freshnessRecords} from={data.from} to={data.to} />
          )}
          {mode === 'fieldUpdates' && <FieldUpdatesView unitMap={unitMap} districts={data.catalog.districts} neighborhoods={data.catalog.neighborhoods} squares={squares} servicePoints={data.catalog.servicePoints} reloadKey={fieldFeedReloadKey} onAdd={canWrite ? () => openForm('fieldUpdates') : null} />}
          {/* ─── Metrics ─── */}
          {data.ready && !['city', 'import', 'settings', 'person', 'faq', 'guide', 'reports'].includes(mode) && (
            <CityMetrics metrics={[
              { label: 'Planlanan personel', value: unitDataWaiting ? undefined : scope.people },
                { label: 'Öne çıkan çalışma', value: unitDataWaiting ? undefined : scope.activities.length },
              { label: 'Açık takip işi', value: unitDataWaiting ? undefined : data.openTasks.filter((r) => inScope(r, filters, false)).length },
            ]} />
          )}

          {/* ─── Import ─── */}
          {mode === 'import' && (
            <Suspense fallback={<div className="cc-loading">İçe aktarma konsolu yükleniyor...</div>}>
              <CommandImport />
            </Suspense>
          )}

          {/* ─── Settings ─── */}
          {mode === 'settings' && (
            <><section className="cc-panel">
              <h2>Görünüm</h2>
              <button onClick={toggleTheme}>{theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}</button>
              {showMaps && <label>
                Varsayılan harita
                <select value={mapMode} onChange={(e) => { setMapMode(e.target.value); localStorage.setItem('syp_default_map_dim', e.target.value); }}>
                  <option value="3d">3 boyutlu</option>
                  <option value="2d">2 boyutlu</option>
                </select>
              </label>}
              <h2>Erişim</h2>
              <p>Admin ayarları yönetir. Personel telefonu yalnız Admin ve Yönetici rollerine açıktır.</p>
              <Link to="/veri-yukleme">Veri Yükleme alanını aç</Link>
            </section><Suspense fallback={<p className="cc-notice">Yönetim ayarları yükleniyor…</p>}><AdminSettings /></Suspense></>
          )}

          {/* ─── FAQ (Sık Sorulan Sorular) ─── */}
          {mode === 'faq' && <FAQView />}

          {/* ─── Guide (Kullanım Kılavuzu) ─── */}
          {mode === 'guide' && <GuideView />}

          {data.ready && mode === 'city' && <>
            <CityMetrics metrics={[
              { label: 'Planlanan personel', value: scope.people },
              { label: 'Öne çıkan çalışma', value: scope.activities.length },
              { label: 'Açık takip işi', value: data.openTasks.filter((r) => inScope(r, filters, false)).length },
              { label: 'Çözüm noktası / şube', value: scopedServicePoints.length || undefined },
            ]} />
            <section className="cc-panel cc-executive-overview" aria-labelledby="cc-executive-overview-title">
              <div className="cc-section-title"><div><p className="cc-eyebrow">Yönetici özeti</p><h2 id="cc-executive-overview-title">Bugün sahada ne oluyor?</h2><p className="cc-muted">Haritadaki dağılımın kısa özeti · {data.from}</p></div></div>
              <div className="cc-cards cc-cards--compact">
                <article className="cc-record"><strong>{new Set(scope.plans.map((p) => p.ilceId).filter(Boolean)).size}</strong><p>Çalışılan ilçe</p></article>
                <article className="cc-record"><strong>{new Set(scope.plans.map((p) => p.mahalleId).filter(Boolean)).size}</strong><p>Çalışılan mahalle</p></article>
                <article className="cc-record"><strong>{scope.activities.length}</strong><p>Öne çıkan çalışma</p></article>
                <article className="cc-record"><strong>{data.unitStatus.filter((s) => !s.veriVar).length}</strong><p>Veri bekleyen birim</p></article>
              </div>
            </section>
            <section className="cc-panel cc-city-field-updates" aria-labelledby="cc-city-field-updates-title">
              <div className="cc-section-title">
                <div><p className="cc-eyebrow">Gün içi saha akışı</p><h2 id="cc-city-field-updates-title">Bugünden bildirilen çalışmalar</h2><p className="cc-muted">Birimlerin panele ilettiği seçilmiş saha bildirimleri · {todayKey()}</p></div>
                <Link className="cc-button" to={`/saha-akisi?from=${todayKey()}&to=${todayKey()}${unit ? `&unit=${encodeURIComponent(unit)}` : ''}${districtId ? `&district=${encodeURIComponent(districtId)}` : ''}`}>Saha akışının tamamı</Link>
              </div>
              {todayFieldUpdates.length ? <>
                <div className="cc-city-field-updates__stats">
                  <article><strong>{todayFieldUpdates.length}</strong><span>Bugünkü bildirim</span></article>
                  <article><strong>{new Set(todayFieldUpdates.map((item) => item.ilceId).filter(Boolean)).size}</strong><span>İlçede kayıt</span></article>
                  <article><strong>{new Set(todayFieldUpdates.map((item) => item.mahalleId).filter(Boolean)).size}</strong><span>Mahallede kayıt</span></article>
                </div>
                <div className="cc-city-field-updates__list">{todayFieldUpdates.slice(0, 3).map((item) => <article key={item.recordId}>
                  <time>{item.saat || 'Saat belirtilmedi'}</time><div><p className="cc-eyebrow">{unitMap[item.birimId] || 'Birim belirtilmedi'}{item.ekip && ` · ${item.ekip}`}</p><h3>{item.baslik}</h3><p>{item.aciklama}</p></div>
                </article>)}</div>
              </> : <Empty>Bugün henüz panele saha bildirimi eklenmedi.</Empty>}
            </section>
            <section className="cc-panel cc-executive-analytics" aria-labelledby="cc-executive-analytics-title">
              <div className="cc-section-title"><div><p className="cc-eyebrow">Karar desteği</p><h2 id="cc-executive-analytics-title">Yönetim görünümü</h2><p className="cc-muted">Seçili tarih ve birim kapsamındaki gerçek kayıtların dağılımı</p></div></div>
              <div className="cc-exec-insights">
                <article className="cc-exec-insight"><span className="cc-exec-insight__label">En yoğun ilçe</span><strong>{executiveAnalytics.topDistrict?.name || 'Veri bekleniyor'}</strong><small>{executiveAnalytics.topDistrict ? `${executiveAnalytics.topDistrict.plans} plan · ${executiveAnalytics.topDistrict.activities} öne çıkan çalışma` : 'İlçe bazlı kayıt oluştuğunda görünür'}</small></article>
                <article className="cc-exec-insight"><span className="cc-exec-insight__label">En çok öne çıkan çalışma</span><strong>{executiveAnalytics.topActivityDistrict?.activities ? executiveAnalytics.topActivityDistrict.name : 'Veri bekleniyor'}</strong><small>{executiveAnalytics.topActivityDistrict?.activities ? `${executiveAnalytics.topActivityDistrict.activities} seçilmiş çalışma` : 'Haftalık öne çıkan çalışma bekleniyor'}</small></article>
                <article className="cc-exec-insight"><span className="cc-exec-insight__label">Faaliyet kaydı bulunan mahalle</span><strong>%{executiveAnalytics.activityCoveragePercent}</strong><small>{executiveAnalytics.coveredNeighbourhoods} / {executiveAnalytics.denominatorNeighbourhoods} mahalle · seçili dönem</small></article>
                <article className="cc-exec-insight"><span className="cc-exec-insight__label">Veri kapsamı</span><strong>{executiveAnalytics.districtRows.length} ilçe</strong><small>{scope.people} tekil personel · {scope.plans.length + scope.activities.length} kayıt</small></article>
              </div>
              <div className="cc-period-comparison"><div><p className="cc-eyebrow">Dönem karşılaştırması</p><h3>Önceki eş döneme göre değişim</h3><p className="cc-muted">Karşılaştırma dönemi: {executiveAnalytics.comparison.label}</p></div><div className="cc-period-comparison__grid">
                {Object.entries(executiveAnalytics.comparison).filter(([key]) => key !== 'label').map(([key, value]) => <article key={key}><span>{({ personnel: 'Saha personeli', activities: 'Öne çıkan çalışma', tasks: 'Açılan takip işi', coverage: 'Çalışma kaydı bulunan mahalle' })[key]}</span><strong>{value.current}</strong><b className={value.current > value.previous ? 'is-up' : value.current < value.previous ? 'is-down' : ''}>{movementLabel(value.current, value.previous)}</b></article>)}
              </div></div>
              <div className="cc-plan-activity-summary"><div><p className="cc-eyebrow">Plan–faaliyet görünümü</p><h3>Planlanan saha çalışmaları</h3><p className="cc-muted">Seçili dönemde plan kaydı bulunup faaliyet kaydı bulunmayan mahalleler</p></div><strong>{executiveAnalytics.planOnlyNeighbourhoods.length}</strong>{executiveAnalytics.planOnlyNeighbourhoods.length ? <div className="cc-plan-activity-summary__list">{executiveAnalytics.planOnlyNeighbourhoods.slice(0, 6).map((item) => <Link key={item.id} to={`/ilce/${item.districtId}/mahalle/${data.catalog.neighborhoods.find((n) => n.id === item.id)?.slug || item.id}${queryString}`}><span>{item.name}</span><small>{item.district} · plan var, faaliyet kaydı yok</small></Link>)}</div> : <p className="cc-muted">Seçili dönemde plan olup faaliyet kaydı bulunmayan mahalle yok.</p>}</div>
              <div className="cc-priority-panel"><div className="cc-section-title"><div><p className="cc-eyebrow">Saha gündemi</p><h3>Öncelikli görünüm</h3><p className="cc-muted">Kayıtların durumuna göre takip edilmesi gereken alanlar</p></div></div>
                {executiveAnalytics.priorityRows.length ? <div className="cc-priority-grid">{executiveAnalytics.priorityRows.slice(0, 6).map((row) => <Link className="cc-priority-item" key={row.id} to={`/ilce/${row.id}${queryString}`}><div><strong>{row.name}</strong><span>Açık takip işi yoğun</span></div><b>{row.open} açık iş</b></Link>)}</div> : <p className="cc-muted">Bu kapsamda yoğun açık takip işi bulunmuyor.</p>}
              </div>
              <div className="cc-analytics-grid">
                <div className="cc-analytics-block"><h3>İlçe yoğunluğu</h3><p className="cc-muted">Plan ve gerçekleşen çalışma toplamı</p>{executiveAnalytics.districtRows.slice(0, 8).map((row) => { const max = executiveAnalytics.districtRows[0]?.plans + executiveAnalytics.districtRows[0]?.activities || 1; const total = row.plans + row.activities; return <div className="cc-analytics-row" key={row.id}><div><span>{row.name}</span><b>{total}</b></div><div className="cc-analytics-bar"><i style={{ width: `${Math.max(4, (total / max) * 100)}%` }} /></div></div>; })}</div>
                <div className="cc-analytics-block"><h3>Mahallelerde erişim</h3><p className="cc-muted">En çok ve en az kayıt görülen mahalleler</p>{executiveAnalytics.neighbourhoodRows.length ? <div className="cc-analytics-list"><div className="cc-analytics-list__headline">En çok kayıt</div><strong>{executiveAnalytics.neighbourhoodRows[0].name}</strong><span>{executiveAnalytics.neighbourhoodRows[0].district} · {executiveAnalytics.neighbourhoodRows[0].plans + executiveAnalytics.neighbourhoodRows[0].activities} kayıt</span><div className="cc-analytics-list__headline">En az kayıt (kayıt bulunanlar içinde)</div><strong>{executiveAnalytics.neighbourhoodRows[executiveAnalytics.neighbourhoodRows.length - 1].name}</strong><span>{executiveAnalytics.neighbourhoodRows[executiveAnalytics.neighbourhoodRows.length - 1].district} · {executiveAnalytics.neighbourhoodRows[executiveAnalytics.neighbourhoodRows.length - 1].plans + executiveAnalytics.neighbourhoodRows[executiveAnalytics.neighbourhoodRows.length - 1].activities} kayıt</span></div> : <Empty>Mahalle bazlı kayıt bekleniyor.</Empty>}</div>
              </div>
              <div className="cc-performance-table"><div className="cc-section-title"><div><h3>İlçe görünümü</h3><p className="cc-muted">Seçili dönemdeki plan, öne çıkan çalışma ve açık iş görünümü</p></div></div><div className="cc-performance-table__head"><span>İlçe</span><span>Plan</span><span>Öne çıkan</span><span>Açık iş</span><span>Çalışma kaydı bulunan mahalle</span></div>{executiveAnalytics.districtRows.filter((r) => r.plans || r.activities || r.open).slice(0, 8).map((row) => <Link className="cc-performance-row" key={row.id} to={`/ilce/${row.id}${queryString}`}><strong>{row.name}</strong><span>{row.plans}</span><span>{row.activities}</span><span className={row.open >= 5 ? 'is-alert' : ''}>{row.open}</span><span>{row.activityNeighbourhoods || '—'}</span></Link>)}</div>
              <div className="cc-unit-performance"><div className="cc-section-title"><div><h3>Birim görünümü</h3><p className="cc-muted">Birimlerin saha planı ve haftalık öne çıkan çalışmaları</p></div></div>{executiveAnalytics.unitRows.length ? <div className="cc-unit-performance__grid">{executiveAnalytics.unitRows.map((row) => <Link key={row.id} to={`${Object.entries(UNIT_PATHS).find(([, id]) => id === row.id)?.[0] || `/birim/${row.id}`}${queryString}`}><p>{row.name}</p><strong>{row.activities}</strong><span>öne çıkan çalışma</span><small>{row.plans} plan · {row.people.size} personel · <b className={row.activities > row.previousActivities ? 'is-up' : row.activities < row.previousActivities ? 'is-down' : ''}>{movementLabel(row.activities, row.previousActivities)}</b></small></Link>)}</div> : <Empty>Birim bazlı öne çıkan çalışma kaydı bekleniyor.</Empty>}</div>
              <p className="cc-muted cc-analytics-note">Harita yalnız coğrafi konumu belli planları gösterir. Yaka, bölge, ekip ve merkez kapsamındaki planlar bu yönetim analizinde korunur.</p>
            </section>
          </>}

          {/* ─── City Map ─── */}
          {mode === 'city' && showMaps && (
            <section
              ref={mapRef}
              className={`cc-map-section ${isMapFocused ? 'is-expanded' : ''}`}
              role={isMapFocused ? 'dialog' : 'region'}
              aria-modal={isMapFocused || undefined}
              aria-labelledby="cc-map-title"
            >
              <div className="cc-section-title">
                <div>
                  <h2 id="cc-map-title">İstanbul saha dağılımı</h2>
                  <p className="cc-map-scope">{district?.name || '39 ilçe'} · {unitMap[unit] || 'Tüm birimler'} · {data.from === data.to ? data.from : `${data.from} – ${data.to}`}</p>
                </div>
                <div className="cc-actions">
                  <div className="cc-map-modes" role="group" aria-label="Harita görünümü">
                    <button aria-pressed={mapMode === '2d'} onClick={() => setMapMode('2d')}>2B</button>
                    <button aria-pressed={mapMode === '3d'} onClick={() => setMapMode('3d')}>3B</button>
                  </div>
                  <button aria-pressed={isMapFocused} onClick={() => setMapExpanded((value) => !value)}>
                    {isMapFocused ? 'Geniş görünümden çık · Esc' : 'Haritayı genişlet'}
                  </button>
                  {!isMapFocused && <Link to={`/birimler${queryString}`}>Birimlere geç</Link>}
                </div>
              </div>
              <div className="cc-map-stage">
              <Suspense fallback={<p className="cc-notice">Harita hazırlanıyor…</p>}>
                {mapMode === '3d' ? (
                  <Istanbul3DMap
                    selectedDistrictId={districtId || null}
                    onSelectDistrict={(d) => update({ district: d?.id || '', neighborhood: '' })}
                    selectedNeighborhoodId={neighborhoodId || null}
                    onSelectNeighborhood={(n) => n && navigate(`/ilce/${district?.id || n.districtId}/mahalle/${n.slug}${queryString}`)}
                    selectedLayer={layer}
                    onSelectLayer={setLayer}
                    availableLayers={COMMAND_MAP_LAYERS}
                    liveMetrics={mapMetrics}
                    onSwitchTo2D={() => setMapMode('2d')}
                  />
                ) : (
                  <Istanbul25DMap
                    selectedDistrictId={districtId || null}
                    onSelectDistrict={(d) => update({ district: d?.id || '', neighborhood: '' })}
                    selectedLayer={layer}
                    onSelectLayer={setLayer}
                    availableLayers={COMMAND_MAP_LAYERS}
                    liveMetrics={mapMetrics}
                  />
                )}
              </Suspense>
              </div>
              <div className="cc-map-footer">
                <p className="cc-map-scope" role="status">
                  {data.ready ? (district ? `${district.name} seçili. Listeler bu ilçeye göre filtreleniyor.` : 'İlçe seçerek görev ve personel listelerini filtreleyin.') : 'Dağılım için kayıtların yüklenmesi bekleniyor.'}
                </p>
                {districtId && <button onClick={() => update({ district: '', neighborhood: '' })}>İstanbul geneline dön</button>}
              </div>
              {district && (
                <div className="cc-actions">
                  <Link className="cc-button" to={`/ilce/${district.id}${queryString}`}>{district.name} ilçe dosyası</Link>
                  {neighborhoodId && (
                    <Link className="cc-button" to={`/ilce/${district.id}/mahalle/${data.catalog.neighborhoods.find((n) => n.id === neighborhoodId)?.slug}${queryString}`}>
                      Mahalle dosyasını aç
                    </Link>
                  )}
                </div>
              )}
            </section>
          )}

          {mode === 'city' && !showMaps && (
            <section className="cc-panel">
              <h2>İlçeler</h2>
              <div className="cc-district-list">
                {data.catalog.districts.filter((d) => !districtId || d.id === districtId).map((d) => (
                  <Link key={d.id} to={`/ilce/${d.id}${queryString}`}>
                    <strong>{d.name}</strong>
                    <span>{mapMetrics.metricsByDistrictId[d.id]?.personnel.active || 0} planlanan personel</span>
                  </Link>
                ))}
              </div>
            </section>
          )}


          {/* ─── Open Items (City) ─── */}
          {data.ready && mode === 'city' && (
            <section className="cc-panel">
              <div className="cc-section-title"><div><p className="cc-eyebrow">Takip</p><h2>Açık işler</h2><p className="cc-muted">Tarih aralığından bağımsız, güncel takip kayıtları.</p></div><Link className="cc-button" to={`/takip-edilen-isler${queryString}`}>Tüm işleri aç</Link></div>
              {[['tasks', 'openTasks', 'Takip edilen işler']].map(([kind, source, label]) => (
                <details key={kind}>
                  <summary>{label} · {data[source].filter((r) => inScope(r, filters, false)).length}</summary>
                  {recordList(kind, data[source].filter((r) => inScope(r, filters, false)))}
                </details>
              ))}
            </section>
          )}

          {data.ready && mode === 'unit' && unit && !data.unitStatus.some((s) => s.birimId === unit && s.veriVar) && (
            <p className="cc-notice" role="status">Bu birim için Veri Bekleniyor.</p>
          )}

          {data.ready && mode === 'unit' && unit && (
            <section className="cc-panel cc-leadership-panel">
              <div className="cc-section-title"><div><h2>Şeflik yönetimi</h2><p className="cc-muted">Şefler ile bölge ve birim sorumluları</p></div><Link className="cc-button" to={`/birim/${unit}/personel${queryString}`}>Personel listesini gör</Link></div>
              {leadershipPersonnel.length ? <div className="cc-cards">{leadershipPersonnel.map((p) => <PersonCard key={p.personelId} person={p} plans={scope.plans.filter((s) => s.personelId === p.personelId)} queryString={queryString} role={role} unitMap={unitMap} onEdit={openForm} />)}</div> : <Empty>Bu şeflik için şef veya sorumlu kaydı bekleniyor.</Empty>}
            </section>
          )}

          {data.ready && mode === 'unit' && unit && (
            <section className="cc-panel cc-unit-description">
              <p className="cc-eyebrow">Birim / Faaliyet</p>
              <h2>{unitMap[unit]}</h2>
              <p>{UNIT_DESCRIPTIONS[unit] || 'Bu şefliğin faaliyet ve sorumlulukları panele veri geldikçe burada özetlenir.'}</p>
            </section>
          )}

          {/* ─── District / Neighborhood Info ─── */}
          {['district', 'neighborhood'].includes(mode) && district && (
            <section className="cc-panel">
              <details>
                <summary>İlçe ve mahalle bilgileri</summary>
                {mode === 'district' ? (
                  <>
                    <p>{CITY_AND_DISTRICT_DOSSIERS[district.id]?.paragraphs?.[0]}</p>
                    <p>
                      Nüfus: {population.find((p) => p.districtId === district.id)?.population?.toLocaleString('tr-TR') || '—'} (TÜİK, 2025) ·
                      Yüzölçümü: {areas.find((p) => p.districtId === district.id)?.areaKm2 || '—'} km²
                    </p>
                  </>
                ) : (
                  <>
                    <p>{neighborhood.muhtarlikName}</p>
                    <p>{neighborhood.address}</p>
                  </>
                )}
              </details>
              {showMaps && <Suspense fallback={<div className="cc-loading">Mahalle haritası yükleniyor...</div>}>
                <DistrictNeighborhoodMap
                  districtSlug={district.id}
                  districtName={district.name}
                  neighborhoods={data.catalog.neighborhoods.filter((n) => n.districtId === district.id)}
                  selectedNeighborhoodId={neighborhoodId || null}
                  operationMetrics={neighborhoodMetrics}
                  coverageNote={!unit ? 'Toplamlar yalnız panele yüklenen kayıtları kapsar; veri beklenen birimler dahil değildir.' : 'Seçili birimin panele yüklenen kayıtları gösterilir.'}
                  unitLabel={unit ? unitMap[unit] : 'Tüm birimler'}
                  onOpenRecord={(kind, record) => kind === 'points'
                    ? navigate(`/cozum-noktalari/noktalar/${encodeURIComponent(record.id)}${queryString}`)
                    : openForm(kind, record)}
                  onOpenNeighborhood={(n) => navigate(`/ilce/${district.id}/mahalle/${n.slug}${queryString}`)}
                  onSelectNeighborhood={(n) => n && navigate(`/ilce/${district.id}/mahalle/${n.slug}${queryString}`)}
                />
              </Suspense>}
              {!showMaps && <div className="cc-neighborhood-links">
                {data.catalog.neighborhoods.filter((n) => n.districtId === district.id).map((n) => (
                  <Link key={n.id} to={`/ilce/${district.id}/mahalle/${n.slug}${queryString}`}>{n.name}</Link>
                ))}
              </div>}
            </section>
          )}

          {data.ready && ['district', 'neighborhood'].includes(mode) && (
            <section className="cc-panel cc-location-summary" aria-label="Saha resmi">
              <div><p className="cc-eyebrow">Saha resmi</p><h2>{mode === 'neighborhood' ? `${neighborhood?.name} Mahallesi` : district?.name} görünümü</h2><p className="cc-muted">Seçili tarih aralığındaki operasyonel kayıtların kısa özeti.</p></div>
              <div className="cc-location-summary__grid">
                <article><strong>{scope.people}</strong><span>Planlanan personel</span></article>
                <article><strong>{scope.activities.length}</strong><span>Öne çıkan çalışma</span></article>
                <article><strong>{locationSummary?.openTasks || 0}</strong><span>Açık takip işi</span></article>
                <article><strong>{(locationSummary?.points || 0) + (locationSummary?.squares || 0)}</strong><span>Fiziksel hizmet alanı</span></article>
              </div>
            </section>
          )}

          {data.ready && ['district', 'neighborhood'].includes(mode) && locationSummary && (
            <section className="cc-panel">
              <ContextNotes contextType={mode} contextId={mode === 'district' ? districtId : neighborhoodId} title={mode === 'district' ? district?.name || 'İlçe' : `${neighborhood?.name || ''} Mahallesi`} />
            </section>
          )}

          {data.ready && ['district', 'neighborhood'].includes(mode) && (!chiefUnitId || chiefUnitId === 'COZUM_NOKTALARI') && (physicalPlaces.points.length > 0 || physicalPlaces.squares.length > 0) && (
            <section className="cc-panel"><div className="cc-section-title"><div><h2>Fiziksel hizmet yerleri</h2><p className="cc-muted">Bu konuma bağlı çözüm noktaları ve meydanlar.</p></div><Link className="cc-button" to={`/cozum-noktalari/noktalar${queryString}`}>Tüm noktalar</Link></div>
              <div className="cc-cards">
                {physicalPlaces.squares.map(s => <Link className="cc-record cc-place-card" key={`square-${s.id}`} to={`/meydan/${s.id}${queryString}`}><span className="cc-badge">Meydan</span><strong>{s.name}</strong><p>{s.district} · {s.kategori}</p></Link>)}
                {physicalPlaces.points.map(p => <Link className="cc-record cc-place-card" key={`point-${p.id}`} to={`/cozum-noktalari/noktalar/${encodeURIComponent(p.id)}${queryString}`}><span className="cc-badge">{p.tip === 'SUBE' ? 'Şube' : 'Çözüm noktası'}</span><strong>{p.name}</strong><p>{p.mahalleId ? data.catalog.neighborhoods.find(n => n.id === p.mahalleId)?.name : 'Mahalle bilgisi bekleniyor'}</p></Link>)}
              </div>
            </section>
          )}

          {/* ─── Square Detail ─── */}
          {mode === 'square' && square && (
            <section className="cc-panel">
              <div className="cc-gallery">
                {(square.images?.length ? square.images : [square.heroImage]).filter(Boolean).map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={square.name} loading="lazy" /></a>
                ))}
              </div>
              <p>{square.aciklama}</p>
              <p>{square.kategori} · {square.alanM2} · {square.yapimYili}</p>
              <p>{square.fonksiyonlar?.join(' · ')}</p>
            </section>
          )}

          {data.ready && mode === 'square' && square && (!chiefUnitId || chiefUnitId === 'COZUM_NOKTALARI') && data.catalog.servicePoints.some(p => p.active && p.meydanId === square.id) && (
            <section className="cc-panel"><h2>Bu meydandaki çözüm noktaları</h2><div className="cc-cards">{data.catalog.servicePoints.filter(p => p.active && p.meydanId === square.id).map(p => <Link className="cc-record" key={p.id} to={`/cozum-noktalari/noktalar/${encodeURIComponent(p.id)}${queryString}`}><strong>{p.name}</strong><p>{data.catalog.districts.find(d => d.id === p.ilceId)?.name || p.ilceId}</p></Link>)}</div></section>
          )}

          {mode === 'units' && <section className="cc-cards">{(data.catalog.units || []).filter(({id}) => !chiefUnitId || id === chiefUnitId).map(({id, name}) => <article className="cc-record cc-unit-card" key={id}><p className="cc-eyebrow">SAHA BİRİMİ</p><h2>{name}</h2><p>{data.personnel.filter((p) => p.birimId === id).length} personel kaydı</p><div className="cc-actions"><Link className="cc-button" to={`${Object.entries(UNIT_PATHS).find(([, unitId]) => unitId === id)?.[0] || `/birim/${id}`}?from=${data.from}&to=${data.to}`}>Birim görünümü</Link><Link className="cc-button cc-primary" to={`/birim/${id}/personel?from=${data.from}&to=${data.to}`}>Personeller</Link></div></article>)}</section>}

          {/* ─── Personnel Catalog ─── */}
          {data.ready && mode === 'personnel' && (
            <>
              <div className="cc-section-title">
                <div><h2>{unitMap[unit] || 'Birim'} personeli</h2><p className="cc-muted">{data.personnelDirectory ? `${Math.min(personnelVisibleCount, orderedPersonnel.length)} kişi listeleniyor · Sunucu sayfalaması açık` : `${filteredPersonnel.length} kayıt · ${Math.min(personnelVisibleCount, orderedPersonnel.length)} kişi gösteriliyor`}</p></div>
                {canWrite && <button onClick={() => openForm('personnel')}>+ Personel ekle</button>}
              </div>
              {data.personnelDirectory && directoryState.key !== personnelListKey && <p role="status" className="cc-notice">Personeller yükleniyor…</p>}
              {data.personnelDirectory && directoryState.key === personnelListKey && directoryState.error && <p role="alert" className="cc-error">{directoryState.error}</p>}
              {filteredPersonnel.length ? (
                <div className="cc-cards">
                  {orderedPersonnel.slice(0, personnelVisibleCount).map((p) => (
                    <PersonCard
                      key={p.personelId}
                      person={p}
                      plans={scope.plans.filter((s) => s.personelId === p.personelId)}
                      queryString={queryString}
                      role={role}
                      unitMap={unitMap}
                      onEdit={openForm}
                    />
                  ))}
                </div>
              ) : data.personnelDirectory && directoryState.key !== personnelListKey ? null : directoryState.error ? null : <Empty>Veri Bekleniyor. Bu birime ait personeller yüklendiğinde her biri kendi detay ekranıyla burada görünecek.</Empty>}
              {(personnelVisibleCount < orderedPersonnel.length || (directoryState.key === personnelListKey && directoryState.hasMore)) && <div className="cc-actions" style={{ justifyContent: 'center', padding: '1rem 0' }}><button className="cc-button" type="button" disabled={directoryState.loadingMore} onClick={loadMorePersonnel}>{directoryState.loadingMore ? 'Yükleniyor…' : '100 kişi daha yükle'}</button></div>}
            </>
          )}

          {data.ready && mode === 'person' && (person ? <PersonnelProfile key={person.personelId} person={person} from={data.from} to={data.to} unitMap={unitMap} onEdit={openForm} revision={data.revision} onSaved={() => data.refresh('personnel')} /> : <Empty>Personel bulunamadı veya bu kayda erişim yetkiniz yok.</Empty>)}

          {/* ─── Tracked work ─── */}
          {data.ready && listKind && (
            <section className="cc-panel">
              <p className="cc-muted">Tarih filtresi kayıt açılış tarihine göre uygulanır. Durumlar kayıtların son durumudur.</p>
              {taskDirectoryState.key !== taskListKey ? <p role="status" className="cc-notice">Takip işleri yükleniyor…</p>
                : taskDirectoryState.error && !taskDirectoryState.rows.length ? <p role="alert" className="cc-error">{taskDirectoryState.error}</p>
                : recordList(mode, taskDirectoryState.rows)}
              {taskDirectoryState.error && taskDirectoryState.rows.length > 0 && <p role="alert" className="cc-error">{taskDirectoryState.error}</p>}
              {taskDirectoryState.key === taskListKey && taskDirectoryState.hasMore && <div className="cc-actions" style={{ justifyContent: 'center', padding: '1rem 0' }}><button className="cc-button" type="button" disabled={taskDirectoryState.loadingMore} onClick={loadMoreTasks}>{taskDirectoryState.loadingMore ? 'Yükleniyor…' : '100 iş daha yükle'}</button></div>}
            </section>
          )}

          {/* ─── Tabbed Content (City/Unit/District/Neighborhood/Square) ─── */}
          {data.ready && ['unit', 'district', 'neighborhood', 'square'].includes(mode) && (mode !== 'unit' || unitHasOperationalData) && (
            <section id="cc-results" className="cc-panel">
              <nav className="cc-tabs" aria-label="İçerik">
                {tabs.map(([id, label]) => (
                  <button key={id} aria-pressed={tab === id} onClick={() => update({ tab: id })}>{label}</button>
                ))}
              </nav>
              {tab === 'plans' ? plansView
                : tab === 'squares' ? squaresView
                : tab === 'points' ? pointsView
                : ['activities', 'tasks'].includes(tab) ? recordList(tab, scope[tab])
                : plansView}
            </section>
          )}

          {/* ─── Charts ─── */}
          {showMaps && data.ready && ['city', 'unit', 'district', 'neighborhood', 'tasks'].includes(mode) && (
            <Suspense fallback={<div className="cc-loading">Grafikler yükleniyor...</div>}>
              <OperationCharts scope={scope} districts={data.catalog.districts} from={data.from} to={data.to} />
            </Suspense>
          )}

          {/* ─── Assistant ─── */}
          {data.ready && mode === 'reports' && (
            <Suspense fallback={<div className="cc-loading">Rapor hazırlanıyor...</div>}>
              <CommandReports data={data} scope={scope} filters={filters} unitMap={unitMap} />
            </Suspense>
          )}

          {/* ─── Assistant ─── */}
          {data.ready && mode === 'assistant' && (
            <Suspense fallback={<div className="cc-loading">Asistan yükleniyor...</div>}>
              <CommandAssistant data={data} scope={scope} filters={filters} unitMap={unitMap} />
            </Suspense>
          )}
        </>
      )}

      {/* ─── Record Form Dialog ─── */}
      {(form || linkedForm) && (
        <Suspense fallback={null}>
          <CommandRecordForm {...(form || linkedForm)} onClose={() => { setForm(null); if (params.get('record')) update({ record: '' }); }} onSaved={async () => { const savedKind = (form || linkedForm)?.kind; await data.refresh(savedKind); if (savedKind === 'fieldUpdates') setFieldFeedReloadKey((value) => value + 1); if (savedKind === 'personnel') setDirectoryReloadKey(value => value + 1); if (savedKind === 'tasks') setTaskReloadKey(value => value + 1); }} />
        </Suspense>
      )}

      {/* ─── Footer ─── */}
      <footer className="cc-page-footer">
        Kaynak: Saha Komuta Merkezi kayıtları · Görev yerleri haftalık plana dayanır.
      </footer>
    </main>
  );
}
