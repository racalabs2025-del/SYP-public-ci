const METRIC_ICONS = [
  // Personel
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  // Çalışma
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5Z" /><path d="M6 9.01V9" /><path d="m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19" /></svg>,
  // Bekleyen
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  // Gündem
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
];

const METRIC_ACCENTS = [
  'var(--cc-accent-blue, #3b82f6)',
  'var(--cc-accent-emerald, #10b981)',
  'var(--cc-accent-amber, #f59e0b)',
  'var(--cc-accent-rose, #f43f5e)',
];

export default function CityMetrics({ metrics = [] }) {
  return (
    <div className="cc-metrics-grid">
      {metrics.map(({ label, value }, i) => (
        <div className="cc-metric-card" key={label} style={{ '--accent': METRIC_ACCENTS[i % METRIC_ACCENTS.length] }}>
          <div className="cc-metric-card__icon">{METRIC_ICONS[i % METRIC_ICONS.length]}</div>
          <div className="cc-metric-card__content">
            <strong className="cc-metric-card__value">{typeof value === 'number' ? value.toLocaleString('tr-TR') : '—'}</strong>
            <span className="cc-metric-card__label">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
