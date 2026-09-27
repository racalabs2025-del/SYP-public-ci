import { inScope } from './commandCenter.js';

// Only offer layers backed by the command center's own records.
export const COMMAND_MAP_LAYERS = [
  'Personel Yoğunluğu', 'Gerçekleşen Çalışmalar', 'Takip Edilen İşler', 'Meydanlar',
];

export function buildCommandMapMetrics({ districts, squares, plans, activities = [], tasks, from, to, unit, ready }) {
  const buckets = new Map(districts.map(({ id }) => [id, { people: new Set(), units: new Set(), plans: 0, activities: 0, pending: 0, squares: 0 }]));
  const filters = { from, to, unit };
  for (const plan of plans) {
    const bucket = buckets.get(plan.ilceId);
    if (!bucket || plan.iptal || !inScope(plan, filters)) continue;
    bucket.plans++;
    if (plan.personelId) bucket.people.add(plan.personelId);
    if (plan.birimId) bucket.units.add(plan.birimId);
  }
  for (const activity of activities) {
    const bucket = buckets.get(activity.ilceId);
    if (bucket && !activity.arsivli && inScope(activity, filters)) bucket.activities++;
  }
  for (const task of tasks) {
    const bucket = buckets.get(task.ilceId);
    if (bucket && !task.arsivli && task.durum !== 'Tamamlandı' && inScope(task, filters, false)) bucket.pending++;
  }
  for (const square of squares) {
    const bucket = buckets.get(square.districtId);
    if (bucket) bucket.squares++;
  }
  const maxPeople = Math.max(1, ...[...buckets.values()].map((bucket) => bucket.people.size));
  const metricsByDistrictId = {}, normalizedScores = {};
  for (const [id, bucket] of buckets) {
    metricsByDistrictId[id] = {
      dataStatus: ready ? 'LIVE' : 'UNAVAILABLE',
      personnel: { active: bucket.people.size },
      shifts: { today: bucket.plans },
      activities: { count: bucket.activities },
      chronicIssues: { count: bucket.pending },
      squares: { count: bucket.squares },
      units: bucket.units.size,
    };
    normalizedScores[id] = ready ? Math.round(bucket.people.size / maxPeople * 100) : null;
  }
  return { metricsByDistrictId, normalizedScores };
}
