import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { KINDS, UNITS, clampDateRange, previousDateRange, todayKey } from '../domain/commandCenter.js';
import { getRows, invalidateRowsCache, subscribeProductRows } from '../services/supabaseCommandCenterService.js';
import { ISTANBUL_DISTRICTS_DATA } from '../data/istanbulDistrictsData.js';
import { ALL_ISTANBUL_NEIGHBORHOODS } from '../data/istanbulNeighborhoodsData.js';
import { squares, adaptPlan } from '../domain/commandCatalog.js';
import { CommandCenterContext } from '../hooks/useCommandCenter.js';
import { usePanelAccess } from '../hooks/usePanelAccess.js';
import { isLiveOperationDataset } from '../domain/liveDataPolicy.js';

export default function CommandCenterProvider({ children }) {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const { role, unitId, canViewPhone } = usePanelAccess();
  const { from, to, clamped } = clampDateRange(params.get('from') || '', params.get('to') || '', 90);
  const today = todayKey();
  const [sources, setSources] = useState({});
  const [epoch, setEpoch] = useState(0);
  const [revisions, setRevisions] = useState({});
  const chief = role === 'chief';
  const personnelDirectory = /^\/birim\/[^/]+\/personel\/?$/.test(pathname);
  const trackedWorkDirectory = /^\/takip-edilen-isler\/?$/.test(pathname);
  const liveOperations = ['/', '/dashboard', '/ilce-operasyonlari', '/operasyon-haritasi'].includes(pathname);
  const previousRange = useMemo(() => previousDateRange(from, to), [from, to]);
  const scope = `${chief ? `chief/${unitId}/` : ''}${from}/${to}`;
  const defs = useMemo(() => ({
    units: ['units', {}],
    servicePoints: ['servicePoints', {}],
    ...(!personnelDirectory ? { personnel: ['personnel', { includeArchived: true, ...(chief ? { unitId } : {}) }] } : {}),
    unitStatus: ['unitStatus', chief ? { unitId } : {}],
    ...(canViewPhone && !personnelDirectory ? { phones: ['phones', {}] } : {}),
    plans: ['plans', { from, to, ...(chief ? { unitId } : {}) }],
    activities: ['activities', { from, to, ...(chief ? { participantUnitId: unitId } : {}) }],
    ...(liveOperations ? {
      previousPlans: ['plans', { from: previousRange.from, to: previousRange.to, ...(chief ? { unitId } : {}) }],
      previousActivities: ['activities', { from: previousRange.from, to: previousRange.to, ...(chief ? { participantUnitId: unitId } : {}) }],
      previousTasks: ['tasks', { from: previousRange.from, to: previousRange.to, ...(chief ? { participantUnitId: unitId } : {}) }],
    } : {}),
    ...(['/', '/dashboard'].includes(pathname)
      ? { fieldUpdates: ['fieldUpdates', { from: today, to: today, ...(chief ? { unitId } : {}) }] }
      : pathname === '/asistan' ? { fieldUpdates: ['fieldUpdates', { from, to, ...(chief ? { unitId } : {}) }] } : {}),
    ...(!trackedWorkDirectory ? {
      tasks: ['tasks', { from, to, ...(chief ? { participantUnitId: unitId } : {}) }],
      openTasks: ['tasks', { openOnly: true, includeArchived: false, ...(chief ? { participantUnitId: unitId } : {}) }],
      closedTasks: ['tasks', { closedFrom: from, closedTo: to, includeArchived: false, ...(chief ? { participantUnitId: unitId } : {}) }],
    } : {}),
  }), [chief, unitId, canViewPhone, from, to, pathname, today, personnelDirectory, trackedWorkDirectory, liveOperations, previousRange]);

  useEffect(() => {
    if (chief && !unitId) return undefined;
    let active = true;
    const unsub = Object.entries(defs).map(([key, [kind, filters]]) => {
      const scopedKeys = ['plans','activities','tasks','openTasks','closedTasks','fieldUpdates','previousPlans','previousActivities','previousTasks'];
      setSources(old => ({ ...old, [key]: { rows: [], loading: true, scope: scopedKeys.includes(key) ? scope : '' } }));
      const update = rows => setSources(old => ({ ...old, [key]: { rows, loading: false, scope: scopedKeys.includes(key) ? scope : '' } }));
      const fail = error => setSources(old => ({ ...old, [key]: { rows: [], loading: false, scope: scopedKeys.includes(key) ? scope : '', error: error.message || 'Veri alınamadı.' } }));
      if (!liveOperations || !isLiveOperationDataset(kind)) {
        getRows(kind, filters).then(rows => { if (active) update(rows); }).catch(error => { if (active) fail(error); });
        return () => {};
      }
      return subscribeProductRows(kind, filters,
        update, fail);
    });
    return () => { active = false; unsub.forEach(fn => fn()); };
  }, [epoch, chief, unitId, scope, pathname, liveOperations, defs]);

  const refresh = useCallback(async (kind) => {
    const matches = Object.entries(defs).filter(([, [dataset]]) =>
      dataset === kind && (!liveOperations || !isLiveOperationDataset(dataset)));
    invalidateRowsCache(kind);
    await Promise.all(matches.map(async ([key, [dataset, filters]]) => {
      try {
        const rows = await getRows(dataset, filters);
        setSources(old => ({ ...old, [key]: { rows, loading: false, scope: ['plans','activities','tasks','openTasks','closedTasks'].includes(key) ? scope : '' } }));
      } catch (error) {
        setSources(old => ({ ...old, [key]: { rows: [], loading: false, scope: ['plans','activities','tasks','openTasks','closedTasks'].includes(key) ? scope : '', error: error.message || 'Veri alınamadı.' } }));
      }
    }));
    if (matches.length) setRevisions(old => ({ ...old, [kind]: (old[kind] || 0) + 1 }));
  }, [liveOperations, defs, scope]);

  const value = useMemo(() => {
    const entries = ['units', 'servicePoints', ...(!personnelDirectory ? ['personnel'] : []), 'unitStatus', 'plans', 'activities', ...(liveOperations ? ['previousPlans', 'previousActivities', 'previousTasks'] : []), ...(!trackedWorkDirectory ? ['tasks', 'openTasks', 'closedTasks'] : []), ...(['/', '/dashboard', '/asistan'].includes(pathname) ? ['fieldUpdates'] : []), ...(canViewPhone && !personnelDirectory ? ['phones'] : [])];
    const waiting = entries.filter(k => !sources[k] || (['plans','activities','tasks','openTasks','closedTasks','fieldUpdates','previousPlans','previousActivities','previousTasks'].includes(k) && sources[k].scope !== scope) || sources[k].loading);
    const errors = entries.filter(k => sources[k]?.error).map(key => ({ key, message: sources[key].error }));
    const raw = key => sources[key]?.rows || [];
    const phones = new Map((personnelDirectory ? [] : raw('phones')).map(p => [p.id, p.telefon]));
    const allPersonnel = (personnelDirectory ? [] : raw('personnel')).map(p => ({ ...p, personelId: p.id, telefon: canViewPhone ? phones.get(p.id) || '' : '' }));
    const personnel = allPersonnel.filter(p => !p.arsivli);
    const archivedPersonnelIds = new Set(allPersonnel.filter(p => p.arsivli).map(p => p.personelId));
    const units = raw('units').filter(u => u.active).map(u => ({ ...u, name: UNITS[u.id] || u.name }));
    const unitMap = { ...Object.fromEntries(units.map(u => [u.id, u.name])), ...UNITS };
    return {
      from, to, clamped, personnel, allPersonnel,
      personnelDirectory, trackedWorkDirectory,
      revision: revisions.plans || 0,
      live: liveOperations,
      plans: raw('plans').map(adaptPlan).filter(p => !archivedPersonnelIds.has(p.personelId)),
      activities: raw('activities'), fieldUpdates: raw('fieldUpdates'), tasks: raw('tasks'),
      previousFrom: previousRange.from, previousTo: previousRange.to,
      previousPlans: raw('previousPlans').map(adaptPlan).filter(p => !archivedPersonnelIds.has(p.personelId)),
      previousActivities: raw('previousActivities'), previousTasks: raw('previousTasks'),
      openTasks: raw('openTasks').filter(t => !t.arsivli && t.durum !== 'Tamamlandı'), unitStatus: raw('unitStatus'),
      closedTasks: raw('closedTasks').filter(t => !t.arsivli && t.durum === 'Tamamlandı' && t.closedAt?.slice(0, 10) >= from && t.closedAt?.slice(0, 10) <= to),
      loading: waiting.length > 0, errors, ready: waiting.length === 0 && !errors.length,
      retry: () => setEpoch(n => n + 1), refresh,
      catalog: { personnel, units, unitMap, servicePoints: raw('servicePoints'), districts: ISTANBUL_DISTRICTS_DATA, neighborhoods: ALL_ISTANBUL_NEIGHBORHOODS, squares },
    };
  }, [sources, from, to, clamped, canViewPhone, scope, revisions, refresh, liveOperations, pathname, personnelDirectory, trackedWorkDirectory, previousRange]);
  return <CommandCenterContext.Provider value={value}>{children}</CommandCenterContext.Provider>;
}
