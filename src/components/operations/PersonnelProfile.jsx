import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KINDS, UNITS, planLocationLabel, planScopeLabel } from '../../domain/commandCenter.js';
import { adaptPlan } from '../../domain/commandCatalog.js';
import { getRows, setRecordArchived } from '../../services/supabaseCommandCenterService.js';
import { usePanelAccess } from '../../hooks/usePanelAccess.js';
import RecordPhoto from './RecordPhoto.jsx';
import RecordHistory from './RecordHistory.jsx';

export default function PersonnelProfile({ person, from, to, unitMap = UNITS, onEdit, revision = 0, onSaved }) {
  const { role, canWrite, canViewPhone, unitId } = usePanelAccess();
  const [section, setSection] = useState('plans');
  const [state, setState] = useState({ id: '', rows: [], error: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setState(old => ({ ...old, id: person.personelId, error: '' }));
    getRows('plans', { personnelId: person.personelId, ...(unitId ? { unitId } : {}) })
      .then(rows => { if (active) setState({ id: person.personelId, rows: rows.map(adaptPlan).sort((a, b) => b.tarih.localeCompare(a.tarih)), error: '' }); })
      .catch(err => { if (active) setState({ id: person.personelId, rows: [], error: err.message }); });
    return () => { active = false; };
  }, [person.personelId, unitId, revision]);
  const rows = state.id === person.personelId ? [...state.rows].sort((a, b) => {
    const aSelected = a.tarih >= from && a.tarih <= to;
    const bSelected = b.tarih >= from && b.tarih <= to;
    return Number(bSelected) - Number(aSelected) || b.tarih.localeCompare(a.tarih);
  }) : [];
  const selected = rows.filter((p) => !p.iptal && !p.arsivli && p.tarih >= from && p.tarih <= to);
  const photo = person.fotoUrl;
  async function archive() {
    setBusy(true); setMessage('');
    try { await setRecordArchived('personnel', person.personelId, !person.arsivli); if (onSaved) await onSaved(); }
    catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }
  return <div className="cc-profile">
    <section className="cc-profile-hero">
      <div className="cc-profile-avatar">{photo ? <RecordPhoto value={photo} /> : person.adSoyad.split(' ').filter(Boolean).map((s) => s[0]).slice(0, 2).join('')}</div>
      <div className="cc-profile-identity"><p className="cc-eyebrow">{unitMap[person.birimId] || person.birimId}</p><h2>{person.adSoyad}</h2><p>{[person.unvan, person.ekip].filter(Boolean).join(' · ') || 'Birim personeli'}</p><span className={`cc-badge ${person.arsivli ? '' : 'cc-done'}`}>{person.arsivli ? 'Pasif kayıt' : 'Aktif kayıt'}</span><span className="cc-profile-code">{person.sistemPersonelKodu || person.personelId}</span></div>
      <div className="cc-actions">
        {canViewPhone && person.telefon && <a className="cc-button cc-primary" href={`tel:${person.telefon.replace(/[^\d+]/g, '')}`}>{person.telefon}</a>}
        {canWrite && !person.arsivli && <button onClick={() => onEdit('personnel', person)}>Bilgileri düzenle</button>}
        {role === 'admin' && <button disabled={busy} onClick={archive}>{busy ? 'İşleniyor…' : person.arsivli ? 'Yeniden etkinleştir' : 'Pasife al'}</button>}
      </div>
    </section>
    {person.arsivli && <p className="cc-notice">Bu kişi pasif. Personel bilgileri ve görev geçmişi korunur; yeni görev için önce yeniden etkinleştirin.</p>}
    {message && <p role="alert" className="cc-error">{message}</p>}
    <div className="cc-profile-stats"><div><span>Seçili dönemde</span><strong>{selected.length} görev</strong></div><div><span>Seçili tarih aralığı</span><strong>{from} — {to}</strong></div><div><span>Personel son güncelleme</span><strong>{person.updatedAt ? new Date(person.updatedAt).toLocaleString('tr-TR') : 'Bilgi yok'}</strong></div></div>
    <section className="cc-panel"><nav className="cc-tabs" aria-label="Personel ayrıntıları"><button aria-pressed={section === 'plans'} onClick={() => setSection('plans')}>Birim çalışma planları</button><button aria-pressed={section === 'history'} onClick={() => setSection('history')}>Değişiklik geçmişi</button></nav>
      {section === 'history' ? <RecordHistory kind="personnel" id={person.personelId} /> : <>
        <div className="cc-section-title"><div><h2>Birim çalışma planları</h2><p className="cc-muted">Merkezi ekip tarafından yüklenen planlar · {rows.length} kayıt. Her plan kendi tarihi için geçerlidir.</p></div>{canWrite && !person.arsivli && <button className="cc-primary" onClick={() => onEdit('plans')}>Çalışma planı ekle</button>}</div>
        {state.error ? <p role="alert" className="cc-error">{state.error}</p> : state.id !== person.personelId ? <p role="status">Görevler yükleniyor…</p> : !rows.length ? <p className="cc-empty">Seçili dönemde bu personele ait görev planı bulunmuyor.</p> : <div className="cc-profile-plans">{rows.slice(0, page * 25).map((plan) => <article className="cc-profile-plan" key={plan.recordId}><div className="cc-profile-plan-date"><strong>{plan.tarih}</strong><span>{plan.baslangic}–{plan.bitis}</span></div><div><strong>{planLocationLabel(plan)}</strong><p>{plan.iptal ? 'İptal edildi' : plan.arsivli ? 'Pasif kayıt' : planScopeLabel(plan)} · {unitMap[plan.birimId] || plan.birimId}</p><small>Son güncelleme: {plan.updatedAt ? new Date(plan.updatedAt).toLocaleString('tr-TR') : 'Bilgi yok'}</small></div><button onClick={() => onEdit('plans', plan)}>Ayrıntı ve geçmiş</button></article>)}</div>}
        {rows.length > page * 25 && <button onClick={() => setPage((n) => n + 1)}>Daha fazla göster</button>}
      </>}
    </section>
    <Link to={`/birim/${person.birimId}/personel?from=${from}&to=${to}`}>← {unitMap[person.birimId] || person.birimId} personeline dön</Link>
  </div>;
}
