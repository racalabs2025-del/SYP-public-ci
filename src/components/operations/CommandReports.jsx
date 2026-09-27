import { useMemo, useState } from 'react';
import { withoutContactDetails } from '../../domain/privacy.js';
import { inScope, latestRecordTimestamp, UNITS } from '../../domain/commandCenter.js';
import OperationCharts from './OperationCharts.jsx';
import { downloadWorkbook } from '../../lib/excelWorkbook.js';
import './CommandReports.css';

const safeCell = (value) => {
  if (typeof value === 'number') return value;
  const text = withoutContactDetails(value);
  return /^[=+@-]/.test(text) ? "'" + text : text;
};

export default function CommandReports({ data, scope, filters, unitMap = UNITS }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closed = useMemo(() => data.closedTasks.filter((item) => inScope(item, filters, false)), [data.closedTasks, filters]);
  const openTasks = useMemo(() => data.openTasks.filter((item) => inScope(item, filters, false)), [data.openTasks, filters]);
  const points = (data.catalog.servicePoints || []).filter(p => p.active && (!filters.unit || p.birimId === filters.unit) && (!filters.district || p.ilceId === filters.district) && (!filters.neighborhood || p.mahalleId === filters.neighborhood));
  const districtRows = useMemo(() => {
    const ids = new Set([...scope.districtPeople.map((r) => r.id), ...scope.activities.map((r) => r.ilceId), ...openTasks.map((r) => r.ilceId), ...closed.map((r) => r.ilceId)].filter(Boolean));
    return [...ids].map((id) => ({
      district: data.catalog.districts.find((d) => d.id === id)?.name || id,
      personnel: scope.districtPeople.find((r) => r.id === id)?.count || 0,
      activities: scope.activities.filter((a) => a.ilceId === id).length,
      opened: openTasks.filter((t) => t.ilceId === id).length,
      closed: closed.filter((t) => t.ilceId === id).length,
    })).sort((a, b) => b.personnel - a.personnel);
  }, [scope.districtPeople, scope.activities, openTasks, closed, data.catalog.districts]);
  const reportInsights = useMemo(() => {
    const activityNeighbourhoods = new Set(scope.activities.map((item) => item.mahalleId).filter(Boolean));
    const openHeavy = districtRows.filter((row) => row.opened >= 5);
    const topActivity = [...districtRows].sort((a, b) => b.activities - a.activities || b.personnel - a.personnel)[0];
    const topPersonnel = [...districtRows].sort((a, b) => b.personnel - a.personnel)[0];
    return { activityNeighbourhoods, openHeavy, topActivity, topPersonnel };
  }, [districtRows, scope.activities]);
  const label = [unitMap[filters.unit] || 'Tüm birimler', data.catalog.districts.find((d) => d.id === filters.district)?.name || 'İstanbul geneli', data.from + ' – ' + data.to].join(' · ');
  const latestUpdate = latestRecordTimestamp([...scope.plans, ...scope.activities, ...openTasks]);

  async function exportExcel() {
    setBusy(true); setError('');
    try {
      const sheets = [];
      const sheet = (name, rows) => sheets.push({ name, rows: rows.map((row) => row.map(safeCell)) });
      sheet('Yonetici_Ozeti', [
        ['SYP Yönetici Raporu', label],
        ['Planlı tekil personel', scope.people], ['Haftalık öne çıkan çalışmalar', scope.activities.length],
        ['Güncel açık takip işleri', openTasks.length], ['Dönemde tamamlanan takip işleri', closed.length],
        ['Kayıtlı çözüm noktaları', points.length || 'Veri Bekleniyor'],
        ['Paneldeki son kayıt güncellemesi', latestUpdate || 'Güncelleme zamanı bekleniyor'],
        ['Not', 'Görev planı fiilî konum bilgisi değildir. Bu rapor anlık saha teyidi değildir. Telefon numaraları rapora dahil edilmez.'],
      ]);
      sheet('Ilce_Dagilimi', [['İlçe', 'Planlı kişi', 'Çalışma', 'Açık iş', 'Tamamlanan iş'], ...districtRows.map((r) => [r.district, r.personnel, r.activities, r.opened, r.closed])]);
      const peak = Math.max(1, ...districtRows.map((r) => r.personnel));
      sheet('Grafik_Ozeti', [['İlçe', 'Planlı kişi', 'Dağılım grafiği'], ...districtRows.map((r) => [r.district, r.personnel, '■'.repeat(Math.max(0, Math.round(r.personnel / peak * 30)))])]);
      sheet('One_Cikan_Calismalar', [['Tarih', 'Birim', 'İlçe', 'Mahalle', 'Görev yeri', 'Çalışma başlığı', 'Kısa açıklama', 'Bilgiyi ileten', 'İletim tarihi'], ...scope.activities.map((a) => [a.tarih, unitMap[a.birimId] || a.birimId, a.ilceId, a.mahalleId, a.gorevYeri, a.yapilanIs, a.sonuc, a.teyitEden, a.teyitTarihi])]);
      sheet('Acik_Isler', [['Başlık', 'Sorumlu', 'Açılış tarihi', 'Durum', 'İlçe', 'Birim'], ...openTasks.map((t) => [t.baslik, t.sorumlu, t.tarih, t.durum, t.ilceId, unitMap[t.birimId] || t.birimId])]);
      sheet('Tamamlanan_Isler', [['Başlık', 'Sorumlu', 'Tamamlanma tarihi', 'Kapanış notu', 'İlçe', 'Birim'], ...closed.map((t) => [t.baslik, t.sorumlu, t.closedAt?.slice(0, 10), t.kapanisNotu, t.ilceId, unitMap[t.birimId] || t.birimId])]);
      sheet('Cozum_Noktalari', [['Tür', 'Ad', 'İlçe', 'Mahalle', 'Meydan', 'Bağlı personel', 'Dönemde planlı kişi'], ...points.map(p => [p.tip === 'SUBE' ? 'Şube' : 'Çözüm noktası', p.name, data.catalog.districts.find(d => d.id === p.ilceId)?.name || p.ilceId, data.catalog.neighborhoods.find(n => n.id === p.mahalleId)?.name || p.mahalleId, data.catalog.squares.find(s => s.id === p.meydanId)?.name || p.meydanId, data.personnel.filter(person => person.cozumNoktasiId === p.id).length, new Set(data.plans.filter(plan => plan.cozumNoktasiId === p.id && !plan.iptal && !plan.arsivli && plan.tarih >= data.from && plan.tarih <= data.to).map(plan => plan.personelId)).size])]);
      await downloadWorkbook(sheets, `SYP_Rapor_${data.from}_${data.to}.xlsx`);
    } catch (err) { setError('Rapor hazırlanamadı: ' + err.message); } finally { setBusy(false); }
  }

  return <section id="syp-report" className="cc-report">
    <div className="cc-section-title cc-report-actions"><div><h2>Yönetici raporu</h2><p>{label}</p></div><div className="cc-actions"><button type="button" onClick={() => window.print()}>PDF olarak yazdır</button><button type="button" className="cc-primary" onClick={exportExcel} disabled={busy}>{busy ? 'Hazırlanıyor…' : 'Excel indir'}</button></div></div>
    {error && <p role="alert" className="cc-error">{error}</p>}
    <p className="cc-muted">Açık işler güncel durumuyla, tamamlanan işler kapanış tarihine göre sayılır. Telefon numaraları çıktılara dahil edilmez.</p>
    <div className="cc-report-summary"><div><strong>{scope.people}</strong><span>Seçili dönemde görevli personel</span></div><div><strong>{scope.activities.length}</strong><span>Öne çıkan çalışma</span></div><div><strong>{openTasks.length}</strong><span>Güncel açık takip işi</span></div><div><strong>{reportInsights.activityNeighbourhoods.size}</strong><span>Çalışma kaydı bulunan mahalle</span></div><div><strong>{points.length}</strong><span>Kayıtlı hizmet yeri</span></div></div>
    <section className="cc-report-decision" aria-labelledby="report-decision-title">
      <div className="cc-section-title"><div><p className="cc-eyebrow">Yönetim görünümü</p><h3 id="report-decision-title">Dönemin saha resmi</h3><p className="cc-muted">Öne çıkan çalışmalar, birimlerin haftalık olarak paylaştığı seçilmiş kayıtlardır; tüm saha faaliyetlerini temsil etmez.</p></div></div>
      <div className="cc-report-decision__grid">
        <article><span>En yoğun ilçe</span><strong>{reportInsights.topPersonnel?.district || 'Veri bekleniyor'}</strong><small>{reportInsights.topPersonnel ? `${reportInsights.topPersonnel.personnel} planlı kişi` : 'İlçe bazlı plan kaydı bekleniyor'}</small></article>
        <article><span>En çok öne çıkan çalışma</span><strong>{reportInsights.topActivity?.activities ? reportInsights.topActivity.district : 'Veri bekleniyor'}</strong><small>{reportInsights.topActivity?.activities ? `${reportInsights.topActivity.activities} seçilmiş çalışma` : 'Haftalık kayıt bekleniyor'}</small></article>
        <article><span>Çalışma kaydı bulunan mahalle</span><strong>{reportInsights.activityNeighbourhoods.size}</strong><small>Bu sayı kapsama veya performans oranı değildir.</small></article>
        <article><span>Takip görünümü</span><strong>{reportInsights.openHeavy.length}</strong><small>{reportInsights.openHeavy.length ? `${reportInsights.openHeavy.length} ilçede 5 ve üzeri açık iş` : 'Yoğun açık iş görünmüyor'}</small></article>
      </div>
    </section>
    {points.length > 0 && <section className="cc-panel"><h3>Çözüm noktaları ve şubeler</h3><p className="cc-muted">Kayıtlı fiziksel hizmet yerleri; başvuru sayıları bu raporda bulunmaz.</p><div className="cc-report-table"><table><thead><tr><th>Tür</th><th>Ad</th><th>İlçe</th><th>Mahalle</th><th>Bağlı personel</th></tr></thead><tbody>{points.map(p => <tr key={p.id}><td>{p.tip === 'SUBE' ? 'Şube' : 'Çözüm noktası'}</td><td>{p.name}</td><td>{data.catalog.districts.find(d => d.id === p.ilceId)?.name || p.ilceId}</td><td>{data.catalog.neighborhoods.find(n => n.id === p.mahalleId)?.name || '—'}</td><td>{data.personnel.filter(person => person.cozumNoktasiId === p.id).length}</td></tr>)}</tbody></table></div></section>}
    <OperationCharts scope={scope} districts={data.catalog.districts} from={data.from} to={data.to} />
    <section className="cc-panel"><div className="cc-section-title"><div><p className="cc-eyebrow">İlçe görünümü</p><h3>İlçe dağılımı</h3><p className="cc-muted">Planlı personel, seçilmiş çalışmalar ve güncel açık işler birlikte gösterilir.</p></div></div>{districtRows.length ? <div className="cc-report-table"><table><thead><tr><th>İlçe</th><th>Planlı kişi</th><th>Öne çıkan</th><th>Açık iş</th><th>Tamamlanan iş</th></tr></thead><tbody>{districtRows.map((r) => <tr key={r.district}><td>{r.district}</td><td>{r.personnel}</td><td>{r.activities}</td><td className={r.opened >= 5 ? 'cc-report-alert' : ''}>{r.opened}</td><td>{r.closed}</td></tr>)}</tbody></table></div> : <p>Seçili dönemde raporlanacak kayıt bulunmuyor.</p>}</section>
  </section>;
}
