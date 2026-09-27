import { inScope } from './commandCenter.js';

export const NEIGHBORHOOD_LAYERS = [
  { id: 'people', label: 'Planlanan personel', unit: 'kişi', note: 'Seçili dönemde görev planı olan tekil kişiler. Canlı konum değildir.' },
  { id: 'activities', label: 'Öne çıkan çalışma', unit: 'çalışma', note: 'Birimlerin seçerek paylaştığı haftalık çalışmalar. Ortak çalışmalar bir kez sayılır.' },
  { id: 'tasks', label: 'Açık takip işi', unit: 'iş', note: 'Tarih aralığından bağımsız, halen açık takip işleri.' },
  { id: 'points', label: 'Çözüm noktası', unit: 'nokta', note: 'Aktif çözüm noktası ve şube envanteri. Tarih aralığından bağımsızdır.' },
];
const empty = () => ({ people: new Set(), plans: 0, activities: 0, tasks: 0, points: 0 });
const counts = b => ({ ...b, people: b.people.size });

/** Counts only explicit geographic links. Missing links are never guessed from a name or a map point. */
export function buildNeighborhoodMapMetrics({ districtId, neighborhoods = [], plans = [], activities = [], tasks = [], servicePoints = [], from, to, unit = '', status = 'waiting' }) {
  const buckets = new Map(neighborhoods.filter(n => n.districtId === districtId).map(n => [n.id, empty()]));
  const district = empty(), districtOnly = empty(), unmatched = empty();
  const recordsById = Object.fromEntries([...buckets.keys()].map(id => [id, { plans: [], activities: [], tasks: [], points: [] }]));
  const filters = { district: districtId, from, to, unit };
  const groups = [
    ['plans', plans, r => !r.iptal && inScope(r, filters)],
    ['activities', activities, r => inScope(r, filters)],
    ['tasks', tasks, r => r.durum !== 'Tamamlandı' && inScope(r, filters, false)],
    ['points', servicePoints, r => r.active && inScope(r, filters, false)],
  ];
  for (const [kind, rows, matches] of groups) {
    const seen = new Set();
    for (const row of rows) {
      if (row.arsivli || !matches(row)) continue;
      const id = row.recordId || row.id;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const bucket = row.mahalleId ? buckets.get(row.mahalleId) || unmatched : districtOnly;
      if (buckets.has(row.mahalleId)) recordsById[row.mahalleId][kind].push(row);
      for (const target of [district, bucket]) {
        target[kind]++;
        if (kind === 'plans' && row.personelId) target.people.add(row.personelId);
      }
    }
  }
  return { status, from, to, unit, recordsById, byId: Object.fromEntries([...buckets].map(([id,b]) => [id, counts(b)])), district: counts(district), districtOnly: counts(districtOnly), unmatched: counts(unmatched) };
}

export function neighborhoodScale(values) {
  const max = Math.max(0, ...values.filter(Number.isFinite));
  const thresholds = [...new Set([1, Math.ceil(max / 3), Math.ceil(max * 2 / 3)].filter(n => n > 0 && n <= max))];
  return { max, thresholds };
}
export function neighborhoodColorLevel(value, scale, available = true) {
  if (!available || !Number.isFinite(value)) return -1;
  if (value === 0) return 0;
  return 1 + scale.thresholds.slice(1).filter(threshold => value >= threshold).length;
}
