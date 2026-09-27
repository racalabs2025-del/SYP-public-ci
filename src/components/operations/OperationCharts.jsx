import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area, CartesianGrid
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const STATUS_COLORS = { 'Tamamlandı': '#10b981', 'Bekliyor': '#f59e0b', 'Devam Ediyor': '#3b82f6' };

/**
 * İlçelere göre personel dağılımı, iş durumu ve zaman bazlı çalışma grafikleri.
 * Recharts ile gerçek veriden üretilir.
 */
export default function OperationCharts({ scope, districts, from, to }) {
  const districtData = useMemo(() =>
    [...(scope.districtPeople || [])]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map((d) => ({
        name: districts.find((x) => x.id === d.id)?.name || d.id,
        personel: d.count,
      })),
    [scope.districtPeople, districts]
  );

  const statusData = useMemo(() => {
    const completed = scope.tasks?.filter((t) => t.durum === 'Tamamlandı').length || 0;
    const inProgress = scope.tasks?.filter((t) => t.durum === 'Devam Ediyor').length || 0;
    const pending = scope.tasks?.filter((t) => t.durum === 'Bekliyor').length || 0;
    return [
      { name: 'Tamamlandı', value: completed, color: STATUS_COLORS['Tamamlandı'] },
      { name: 'Devam Ediyor', value: inProgress, color: STATUS_COLORS['Devam Ediyor'] },
      { name: 'Bekliyor', value: pending, color: STATUS_COLORS['Bekliyor'] },
    ].filter((d) => d.value > 0);
  }, [scope.tasks]);

  const trendData = useMemo(() => {
    const days = new Map();
    for (const a of (scope.activities || [])) {
      if (a.tarih) days.set(a.tarih, (days.get(a.tarih) || 0) + 1);
    }
    for (const p of (scope.plans || [])) {
      if (p.tarih && !p.iptal) days.set(p.tarih, (days.get(p.tarih) || 0));
    }
    return [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), çalışma: count }));
  }, [scope.activities, scope.plans]);

  const customTooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '10px',
    padding: '10px 14px',
    color: '#e2e8f0',
    fontSize: '13px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };

  const noData = !districtData.length && !statusData.length && !trendData.length;

  if (noData) {
    return (
      <section className="cc-charts-panel">
        <h2>Dönem Görünümü</h2>
        <p className="cc-muted">Seçili dönemde ({from} – {to}) grafik oluşturacak kayıt bulunmuyor.</p>
      </section>
    );
  }

  return (
    <section className="cc-charts-panel">
      <div className="cc-charts-header">
        <h2>Dönem Görünümü</h2>
        <span className="cc-charts-period">{from} – {to}</span>
      </div>
      <p className="cc-muted">
        Personel aynı ilçede tekil sayılır. İş grafiği seçili dönemde açılan kayıtların güncel durumunu gösterir.
      </p>

      <div className="cc-charts-grid">
        {/* İlçelere göre personel dağılımı */}
        {districtData.length > 0 && (
          <div className="cc-chart-card">
            <h3>İlçelere Göre Personel Dağılımı</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, districtData.length * 36)}>
              <BarChart data={districtData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <XAxis allowDecimals={false} type="number" tick={{ fill: 'var(--syp-text-muted)' , fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fill: 'var(--syp-text-muted)' , fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={customTooltipStyle} cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} />
                <Bar dataKey="personel" fill="url(#barGradient)" radius={[0, 6, 6, 0]} barSize={22}>
                  {districtData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Takip edilen işlerin durumu */}
        {statusData.length > 0 && (
          <div className="cc-chart-card">
            <h3>Takip Edilen İşlerin Durumu</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={customTooltipStyle} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '13px', color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Zaman bazlı çalışma trendi */}
        {trendData.length > 1 && (
          <div className="cc-chart-card cc-chart-wide">
            <h3>Çalışma Trendi</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--syp-text-muted)' , fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--syp-text-muted)' , fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={customTooltipStyle} />
                <Area type="monotone" dataKey="çalışma" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#areaGradient)" dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5, fill: '#60a5fa' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
