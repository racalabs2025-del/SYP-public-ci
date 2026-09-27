import { latestRecordTimestamp } from '../../domain/commandCenter.js';
import './DataFreshnessNotice.css';

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul',
  }).format(date);
}

export default function DataFreshnessNotice({ records = [], from, to }) {
  const latest = latestRecordTimestamp(records);
  const period = from && to ? (from === to ? from : `${from} – ${to}`) : '';
  return <aside className="cc-freshness" aria-label="Kayıt güncelliği">
    <div>
      <p className="cc-eyebrow">Kayıt güncelliği</p>
      <strong>{latest ? `Son kayıt güncellemesi: ${formatTimestamp(latest)}` : 'Bu kapsam için güncelleme zamanı bekleniyor'}</strong>
    </div>
    <p>{period && `Seçili dönem: ${period}. `}Bu zaman paneldeki kayıt güncellemesini gösterir; canlı konum veya anlık saha teyidi değildir.</p>
  </aside>;
}
