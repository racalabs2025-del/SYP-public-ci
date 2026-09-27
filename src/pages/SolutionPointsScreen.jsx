import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useCommandCenter } from '../hooks/useCommandCenter.js';
import { usePanelAccess } from '../hooks/usePanelAccess.js';
import { SOLUTION_POINTS_UNIT, normalizeText, personnelPath } from '../domain/commandCenter.js';
import { saveServicePoint, setServicePointActive } from '../services/supabaseCommandCenterService.js';
import RecordHistory from '../components/operations/RecordHistory.jsx';
import CommandRecordForm from '../components/operations/CommandRecordForm.jsx';
import './SolutionPointsScreen.css';

function PointForm({ initial, catalog, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => initial || {
    id: `CN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    name: '', tip: 'NOKTA', ilceId: '', mahalleId: '', meydanId: '', adres: '', aciklama: '', latitude: '', longitude: '', calismaSaatleri: { haftaIci: '', haftaSonu: '' },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  const update = (field, value) => setDraft(old => ({ ...old, [field]: value,
    ...(field === 'ilceId' ? { mahalleId: '', meydanId: '' } : {}),
  }));
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await saveServicePoint(draft, initial, catalog); await onSaved(); onClose(); }
    catch (err) { setError(err.message || 'Nokta kaydedilemedi.'); }
    finally { setBusy(false); }
  }
  return <dialog className="cc-dialog sp-dialog" ref={dialog} aria-labelledby="sp-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit}>
      <header><h2 id="sp-dialog-title">{initial ? 'Çözüm noktasını düzenle' : 'Çözüm noktası ekle'}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Kapat">✕</button></header>
      <p className="cc-muted">Noktaya ait doğrulanmış konumu girin. Mahalle veya meydan bilgisi henüz gelmediyse boş bırakabilirsiniz.</p>
      <fieldset disabled={busy} className="cc-form-grid">
        <label>Nokta kodu<input value={draft.id} onChange={e => update('id', e.target.value)} required readOnly={Boolean(initial)} maxLength={100} /></label>
        <label>Hizmet yeri türü<select value={draft.tip || 'NOKTA'} onChange={e => update('tip', e.target.value)}><option value="NOKTA">Çözüm noktası</option><option value="SUBE">Şube</option></select></label>
        <label>Adı<input value={draft.name} onChange={e => update('name', e.target.value)} required maxLength={160} placeholder="Doğrulanmış hizmet yeri adı" /></label>
        <label>İlçe<select value={draft.ilceId} onChange={e => update('ilceId', e.target.value)} required><option value="">İlçe seçin</option>{catalog.districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Mahalle<select value={draft.mahalleId} onChange={e => update('mahalleId', e.target.value)} disabled={!draft.ilceId}><option value="">Mahalle bilgisi yok</option>{catalog.neighborhoods.filter(n => n.districtId === draft.ilceId).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
        <label>Meydan<select value={draft.meydanId} onChange={e => update('meydanId', e.target.value)} disabled={!draft.ilceId}><option value="">Meydan bilgisi yok</option>{catalog.squares.filter(s => s.districtId === draft.ilceId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Enlem (isteğe bağlı)<input type="number" inputMode="decimal" step="any" value={draft.latitude ?? ''} onChange={e => update('latitude', e.target.value)} placeholder="40.000000" /></label>
        <label>Boylam (isteğe bağlı)<input type="number" inputMode="decimal" step="any" value={draft.longitude ?? ''} onChange={e => update('longitude', e.target.value)} placeholder="29.000000" /></label>
        <label className="cc-wide">Adres / yer tarifi<textarea rows={2} value={draft.adres} onChange={e => update('adres', e.target.value)} maxLength={500} /></label>
        <label>Hafta içi saatleri<input value={draft.calismaSaatleri?.haftaIci || ''} onChange={e => update('calismaSaatleri', { ...(draft.calismaSaatleri || {}), haftaIci: e.target.value })} placeholder="08:00–20:00 veya AVM" /></label>
        <label>Hafta sonu saatleri<input value={draft.calismaSaatleri?.haftaSonu || ''} onChange={e => update('calismaSaatleri', { ...(draft.calismaSaatleri || {}), haftaSonu: e.target.value })} placeholder="08:30–20:30 veya AVM" /></label>
        <label className="cc-wide">Açıklama<textarea rows={3} value={draft.aciklama} onChange={e => update('aciklama', e.target.value)} maxLength={2000} /></label>
      </fieldset>
      {error && <p role="alert" className="cc-error">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>Vazgeç</button><button type="submit" className="cc-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></footer>
    </form>
  </dialog>;
}

export default function SolutionPointsScreen() {
  const { pointId } = useParams();
  const [params, setParams] = useSearchParams();
  const data = useCommandCenter();
  const { role, canWrite, canOverridePlan, unitId } = usePanelAccess();
  const [search, setSearch] = useState('');
  const [district, setDistrict] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const blocked = role === 'chief' && unitId !== SOLUTION_POINTS_UNIT;
  const points = data.catalog.servicePoints || [];
  const activePoints = points.filter(p => p.active);
  const point = pointId ? points.find(p => p.id === pointId && (p.active || role === 'admin')) : null;
  const districtName = id => data.catalog.districts.find(d => d.id === id)?.name || id;
  const neighborhoodName = id => data.catalog.neighborhoods.find(n => n.id === id)?.name || id;
  const squareName = id => data.catalog.squares.find(s => s.id === id)?.name || id;
  const pointKind = params.get('kind') || 'nokta';
  const isAvm = p => normalizeText(p.name).includes('avm');
  const pointTypeLabel = p => p.tip === 'SUBE' ? 'ŞUBE' : isAvm(p) ? 'AVM' : 'ÇÖZÜM NOKTASI';
  const pointTypeClass = p => p.tip === 'SUBE' ? 'sp-kind--branch' : isAvm(p) ? 'sp-kind--avm' : 'sp-kind--point';
  const pointCounts = activePoints.reduce((counts, p) => {
    const kind = p.tip === 'SUBE' ? 'sube' : isAvm(p) ? 'avm' : 'nokta';
    counts[kind] += 1;
    return counts;
  }, { nokta: 0, sube: 0, avm: 0 });
  const listed = points.filter(p => (p.active || (role === 'admin' && showInactive)) && (pointKind === 'sube' ? p.tip === 'SUBE' : pointKind === 'avm' ? isAvm(p) : p.tip !== 'SUBE' && !isAvm(p)) && (!district || p.ilceId === district) && (!search || normalizeText(`${p.name} ${p.adres} ${districtName(p.ilceId)} ${neighborhoodName(p.mahalleId)}`).includes(normalizeText(search))));
  const roster = point ? data.personnel.filter(p => p.cozumNoktasiId === point.id && p.birimId === SOLUTION_POINTS_UNIT) : [];
  const shifts = point ? data.plans.filter(p => p.cozumNoktasiId === point.id && !p.iptal && !p.arsivli && p.tarih >= data.from && p.tarih <= data.to).sort((a,b) => a.tarih.localeCompare(b.tarih) || a.baslangic.localeCompare(b.baslangic)) : [];
  const activities = point ? data.activities.filter(a => a.cozumNoktasiId === point.id && !a.arsivli && a.tarih >= data.from && a.tarih <= data.to) : [];
  const query = `?from=${data.from}&to=${data.to}`;
  const setDate = (key, value) => setParams(old => { const next = new URLSearchParams(old); if (value) next.set(key, value); else next.delete(key); return next; });
  async function toggleActive() {
    if (!point || busy) return;
    setBusy(true); setMessage('');
    try { await setServicePointActive(point.id, !point.active, point.version); await data.refresh('servicePoints'); setMessage(point.active ? 'Nokta pasife alındı; geçmişi korunuyor.' : 'Nokta yeniden etkinleştirildi.'); }
    catch (err) { setMessage(err.message || 'Durum değiştirilemedi.'); }
    finally { setBusy(false); }
  }
  if (blocked) return <main className="cc-workspace"><p role="alert" className="cc-error">Bu şefliğin çözüm noktalarına erişim yetkisi yok.</p></main>;
  return <main className="cc-workspace sp-workspace">
    <header className="cc-page-header"><div><p className="cc-eyebrow">Çözüm Noktaları ve Şubeleri Şefliği</p><h1>{point ? point.name : 'Çözüm noktaları ve şubeler'}</h1><p>Hizmet yerleri, bağlı personel ve görev planları</p></div><div className="cc-actions"><button type="button" className="cc-button" disabled={data.loading} onClick={data.retry}>Verileri yenile</button>{!pointId && canWrite && <button type="button" className="cc-primary" disabled={!data.ready} onClick={() => setEditing({})}>+ Hizmet yeri ekle</button>}</div></header>
    <nav className="cc-breadcrumb" aria-label="Konum"><Link to={`/${query}`}>Şehir Takip</Link><Link to={`/cozum-noktalari${query}`}>Şeflik</Link>{pointId ? <><Link to={`/cozum-noktalari/noktalar${query}`}>Noktalar</Link><span>{point?.name || 'Nokta'}</span></> : <span>Noktalar</span>}</nav>
    {data.errors.length > 0 && <p role="alert" className="cc-error">Veriler okunamadı: {data.errors.map(e => e.message).join(' ')}</p>}
    {data.loading && <p role="status" className="cc-muted">Kayıtlar yükleniyor…</p>}
    {!pointId ? <>
      <section className="cc-panel sp-intro"><div><p className="cc-eyebrow">İSTANBUL GENELİ</p><h2>{activePoints.length ? `${activePoints.length} hizmet yeri` : 'Çözüm noktası ve şube verisi bekleniyor'}</h2><p>Vatandaşların 153 işlemlerini yaptığı fiziksel çözüm noktaları ve şubeler burada izlenir. Başvuru kayıtları bu ekranda tutulmaz.</p><div className="sp-type-summary" aria-label="Hizmet yeri dağılımı"><span className="sp-kind sp-kind--point"><strong>{pointCounts.nokta}</strong> Çözüm noktası</span><span className="sp-kind sp-kind--branch"><strong>{pointCounts.sube}</strong> Şube</span><span className="sp-kind sp-kind--avm"><strong>{pointCounts.avm}</strong> AVM noktası</span></div></div></section>
      <section className="cc-filters" aria-label="Nokta filtreleri"><label>Nokta ara<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nokta, adres veya ilçe" /></label><label>İlçe<select value={district} onChange={e => setDistrict(e.target.value)}><option value="">Tüm ilçeler</option>{data.catalog.districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>{role === 'admin' && <label className="sp-inline-check"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Pasif noktaları göster</label>}</section>
      {!data.loading && (listed.length ? <div className="sp-point-grid">{listed.map(p => {
        const personnelCount = data.personnel.filter(person => person.cozumNoktasiId === p.id).length;
        const plannedCount = new Set(data.plans.filter(plan => plan.cozumNoktasiId === p.id && !plan.iptal && !plan.arsivli && plan.tarih >= data.from && plan.tarih <= data.to).map(plan => plan.personelId)).size;
        const missingAddress = !p.adres && !p.meydanId;
        const missingHours = !p.calismaSaatleri?.haftaIci && !p.calismaSaatleri?.haftaSonu;
        return <Link className="sp-point-card" key={p.id} to={`/cozum-noktalari/noktalar/${encodeURIComponent(p.id)}${query}`}><div className="sp-card-meta"><span className={`sp-kind ${pointTypeClass(p)}`}>{pointTypeLabel(p)}</span><span className="cc-eyebrow">{districtName(p.ilceId)}{p.mahalleId ? ` · ${neighborhoodName(p.mahalleId)}` : ''}</span></div><h2>{p.name}</h2><p>{p.meydanId ? squareName(p.meydanId) : p.adres || 'Konum ayrıntısı bekleniyor'}</p>{(p.calismaSaatleri?.haftaIci || p.calismaSaatleri?.haftaSonu) && <p className="cc-muted">Hafta içi {p.calismaSaatleri.haftaIci || '—'} · Hafta sonu {p.calismaSaatleri.haftaSonu || '—'}</p>}<div className="sp-point-counts"><span>{personnelCount ? `${personnelCount} bağlı personel` : 'Personel verisi bekleniyor'}</span><span>{plannedCount ? `${plannedCount} planlı kişi` : 'Görev planı bekleniyor'}</span></div><div className="sp-card-status">{missingAddress && <span className="cc-badge cc-badge--warning">Konum teyidi bekleniyor</span>}{missingHours && <span className="cc-badge cc-badge--muted">Çalışma saati yok</span>}{!p.active && <span className="cc-badge">Pasif</span>}</div></Link>;
      })}</div> : <p className="cc-empty">{(search || district) && activePoints.length ? 'Bu filtrelerle eşleşen çözüm noktası bulunamadı.' : 'Veri Bekleniyor. Nokta bilgileri yüklendiğinde burada ilçe ve mahalle bazında listelenecek.'}</p>)}
    </> : !data.loading && (!point ? <p className="cc-empty">Çözüm noktası bulunamadı veya erişim yetkiniz yok.</p> : <>
      <section className="cc-panel sp-detail-hero"><div><p className="cc-eyebrow">{districtName(point.ilceId)}{point.mahalleId ? ` · ${neighborhoodName(point.mahalleId)}` : ''}</p><h2>{point.name}</h2><p>{point.meydanId ? squareName(point.meydanId) : 'Meydan bilgisi bekleniyor'}</p>{point.adres && <p>{point.adres}</p>}{(point.calismaSaatleri?.haftaIci || point.calismaSaatleri?.haftaSonu) && <p>Çalışma saatleri · Hafta içi {point.calismaSaatleri.haftaIci || '—'} · Hafta sonu {point.calismaSaatleri.haftaSonu || '—'}</p>}{point.aciklama && <p>{point.aciklama}</p>}{!point.active && <span className="cc-badge">Pasif kayıt</span>}</div><div className="cc-actions">{canWrite && point.active && <button type="button" onClick={() => setEditing(point)}>Bilgileri düzenle</button>}{role === 'admin' && <button type="button" disabled={busy} onClick={toggleActive}>{point.active ? 'Pasife al' : 'Yeniden etkinleştir'}</button>}</div></section>
      {message && <p role="status" className="cc-notice">{message}</p>}
      <section className="sp-location-links" aria-label="Bağlı konumlar"><Link to={`/ilce/${point.ilceId}${query}`}>{districtName(point.ilceId)} ilçesi</Link>{point.mahalleId && <Link to={`/ilce/${point.ilceId}/mahalle/${encodeURIComponent(data.catalog.neighborhoods.find(n => n.id === point.mahalleId)?.slug || point.mahalleId)}${query}`}>{neighborhoodName(point.mahalleId)} mahallesi</Link>}{point.meydanId && <Link to={`/meydan/${point.meydanId}${query}`}>{squareName(point.meydanId)}</Link>}</section>
      <section className="cc-filters" aria-label="Görev tarihi"><label>Başlangıç<input type="date" value={data.from} onChange={e => setDate('from', e.target.value)} /></label><label>Bitiş<input type="date" value={data.to} onChange={e => setDate('to', e.target.value)} /></label><p className="cc-muted">Görevler yalnız seçili tarih aralığında gösterilir.</p></section>
      <div className="sp-summary"><div><strong>{roster.length || '—'}</strong><span>{roster.length ? 'Bağlı personel' : 'Personel verisi bekleniyor'}</span></div><div><strong>{shifts.length ? new Set(shifts.map(p => p.personelId)).size : '—'}</strong><span>{shifts.length ? 'Planlı kişi' : 'Görev verisi bekleniyor'}</span></div><div><strong>{shifts.length || '—'}</strong><span>Görev planı</span></div><div><strong>{activities.length || '—'}</strong><span>Çalışma kaydı</span></div></div>
      <section className="cc-panel"><div className="cc-section-title"><div><h2>Bu noktaya bağlı personel</h2><p className="cc-muted">Personelin bağlı noktası burada görünür; başka noktadaki vardiyası ayrıca kendi görev planında kalır.</p></div><div className="cc-actions">{canWrite && point.active && <button type="button" onClick={() => setCreating('personnel')}>+ Personel ekle</button>}<Link className="cc-button" to={`/birim/${SOLUTION_POINTS_UNIT}/personel${query}`}>Tüm şeflik personeli</Link></div></div>{roster.length ? <div className="sp-personnel-grid">{roster.map(person => <Link key={person.personelId} className="sp-person" to={`${personnelPath(person)}${query}`}><strong>{person.adSoyad}</strong><span>{person.unvan || person.ekip || 'Birim personeli'}</span></Link>)}</div> : <p className="cc-empty">Bu noktaya bağlı personel bulunmuyor.</p>}</section>
      <section className="cc-panel"><div className="cc-section-title"><h2>Seçili dönemin vardiyaları</h2>{(canWrite || canOverridePlan) && point.active && <button type="button" onClick={() => setCreating('plans')}>+ Vardiya ekle</button>}</div>{shifts.length ? <div className="sp-shifts">{shifts.map(shift => <article key={shift.recordId} className="sp-shift"><div><strong>{shift.tarih}</strong><span>{shift.baslangic}–{shift.bitis}</span></div><div><strong>{data.personnel.find(person => person.personelId === shift.personelId)?.adSoyad || shift.personelId}</strong><p>{shift.gorevYeri}</p></div><Link to={`/birim/${SOLUTION_POINTS_UNIT}/personel/${encodeURIComponent(shift.personelId)}?from=${shift.tarih}&to=${shift.tarih}&record=${encodeURIComponent(shift.recordId)}`}>Görev ayrıntısı</Link></article>)}</div> : <p className="cc-empty">Seçili dönemde vardiya bulunmuyor.</p>}</section>
      <section className="cc-panel"><div className="cc-section-title"><div><h2>Gerçekleşen çalışmalar</h2><p className="cc-muted">Teyit edilerek girilen faaliyet geçmişi; 153 başvuru kayıtları burada yer almaz.</p></div>{canWrite && point.active && <button type="button" onClick={() => setCreating('activities')}>+ Çalışma ekle</button>}</div>{activities.length ? <div className="sp-shifts">{activities.map(activity => <article key={activity.recordId} className="sp-shift"><strong>{activity.tarih}</strong><div><strong>{activity.yapilanIs}</strong><p>{activity.sonuc}</p></div><Link to={`/cozum-noktalari?from=${activity.tarih}&to=${activity.tarih}&tab=activities&record=${encodeURIComponent(activity.recordId)}`}>Çalışma ayrıntısı</Link></article>)}</div> : <p className="cc-empty">Seçili dönemde teyit edilmiş çalışma bulunmuyor.</p>}</section>
      <details className="cc-panel"><summary>Değişiklik geçmişi</summary><RecordHistory kind="servicePoints" id={point.id} /></details>
    </>)}
    {editing && <PointForm initial={editing.id ? editing : null} catalog={data.catalog} onClose={() => setEditing(null)} onSaved={() => data.refresh('servicePoints')} />}
    {creating && point && <CommandRecordForm kind={creating} defaults={{ birimId: SOLUTION_POINTS_UNIT, cozumNoktasiId: point.id, ilceId: point.ilceId, mahalleId: point.mahalleId, meydanId: point.meydanId, gorevYeri: point.name }} onClose={() => setCreating(null)} onSaved={() => data.refresh(creating)} />}
  </main>;
}
