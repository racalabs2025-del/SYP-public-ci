import { useEffect, useRef, useState } from 'react';
import { KINDS, LABELS, SOLUTION_POINTS_UNIT, STATES, UNITS, buildPreview, normalizeRecord, todayKey } from '../../domain/commandCenter.js';
import { addRecordNote, loadRecordNotes, loadUnitFieldSchema, readImportContext, saveRecord, setRecordArchived } from '../../services/supabaseCommandCenterService.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { usePanelAccess } from '../../hooks/usePanelAccess.js';
import { prepareRecordPhoto } from '../../services/recordPhoto.js';
import RecordPhoto from './RecordPhoto.jsx';
import RecordHistory from './RecordHistory.jsx';

export default function CommandRecordForm({ kind, initial, defaults = {}, onClose, onSaved }) {
  const { catalog } = useCommandCenter();
  const { role, canWrite, canManageTasks, canOverridePlan, canViewPhone, canAddNotes } = usePanelAccess();
  const writable = !initial?.arsivli && (canWrite || (kind === 'tasks' && canManageTasks) || (kind === 'plans' && canOverridePlan));
  const [draft, setDraft] = useState(() => normalizeRecord(kind, initial || { recordId: crypto.randomUUID(), tarih: todayKey(), durum: 'Bekliyor', birimId: 'MEYDAN', ...defaults, ...(kind === 'personnel' ? { personelId: 'P-' + crypto.randomUUID() } : {}) }));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [photo, setPhoto] = useState(null);
  const [customFields, setCustomFields] = useState([]);
  const [notes, setNotes] = useState([]), [noteText, setNoteText] = useState(''), [noteBusy, setNoteBusy] = useState(false);
  const [notesLoading, setNotesLoading] = useState(Boolean(initial)), [notesError, setNotesError] = useState('');
  const dialog = useRef(null);
  useEffect(() => { const el = dialog.current; el.showModal(); return () => el.close(); }, []);
  useEffect(() => {
    if (kind !== 'personnel' || !draft.birimId) return undefined;
    let active = true;
    loadUnitFieldSchema(draft.birimId, fields => { if (active) setCustomFields(fields.filter(f => f.active !== false)); }, err => { if (active) setError(`Birim alanları okunamadı: ${err.message}`); });
    return () => { active = false; };
  }, [kind, draft.birimId]);
  useEffect(() => {
    if (!initial) return undefined;
    let active = true;
    setNotesLoading(true); setNotesError('');
    loadRecordNotes(
      kind,
      initial.recordId || initial.personelId,
      rows => { if (active) { setNotes(rows); setNotesLoading(false); } },
      err => { if (active) { setNotesError(`Notlar okunamadı: ${err.message}`); setNotesLoading(false); } },
    );
    return () => { active = false; };
  }, [kind, initial]);
  async function saveNote() {
    if (!canAddNotes || !initial || !noteText.trim() || noteBusy) return;
    setNoteBusy(true); setError(''); setNotesError('');
    try {
      await addRecordNote(kind, initial.recordId || initial.personelId, noteText);
      setNoteText(''); setNotesLoading(true);
      loadRecordNotes(
        kind,
        initial.recordId || initial.personelId,
        rows => { setNotes(rows); setNotesLoading(false); },
        err => { setNotesError(`Notlar yenilenemedi: ${err.message}`); setNotesLoading(false); },
      );
    } catch (err) { setError(err.message); } finally { setNoteBusy(false); }
  }
  const change = (field, value) => setDraft((d) => {
    const point = field === 'cozumNoktasiId' ? catalog.servicePoints?.find((p) => p.id === value && p.active) : null;
    return { ...d, [field]: value,
      ...(field === 'birimId' && value !== SOLUTION_POINTS_UNIT ? { cozumNoktasiId: '' } : {}),
      ...(field === 'ilceId' ? { mahalleId: '', meydanId: '', cozumNoktasiId: '' } : {}),
      ...(field === 'meydanId' && value ? { gorevYeri: catalog.squares.find((s) => s.id === value)?.name || d.gorevYeri } : {}),
      ...(point && kind !== 'personnel' ? { ilceId: point.ilceId, mahalleId: point.mahalleId, meydanId: point.meydanId, gorevYeri: point.name } : {}),
    };
  });
  async function save(e) {
    e.preventDefault(); if (!writable || busy) return;
    setBusy(true); setError('');
    try {
      const missingField = kind === 'personnel' && customFields.find((f) => f.required && !String(draft.ozelAlanlar?.[f.id] || '').trim());
      if (missingField) throw new Error(`${missingField.label} zorunludur.`);
      const existing = kind === 'plans' ? await readImportContext(kind, null, { personnelId: draft.personelId }) : initial ? [initial] : [];
      const check = buildPreview(kind, [draft], existing, catalog, { role })[0];
      if (check.errors.length) throw new Error(check.errors.join(' '));
      await saveRecord(kind, draft, initial || null, catalog, { photo, role });
      if (onSaved) await onSaved();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function togglePlan() {
    if (busy || !canWrite) return;
    setBusy(true); setError('');
    try {
      if (initial.iptal) {
        const existing = await readImportContext('plans', null, { personnelId: initial.personelId });
        const check = buildPreview('plans', [initial], existing, catalog, { role })[0];
        if (check.errors.length) throw new Error(check.errors.join(' '));
      }
      await saveRecord('plans', initial, initial, catalog, { cancelled: !initial.iptal, role });
      if (onSaved) await onSaved();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function toggleArchive() {
    if (busy || role !== 'admin' || !initial) return;
    setBusy(true); setError('');
    try {
      await setRecordArchived(kind, initial.recordId || initial.personelId, !initial.arsivli);
      if (onSaved) await onSaved();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const choice = (field, options, placeholder = 'Seçin') => <select id={`cc-${field}`} disabled={kind === 'personnel' && field === 'birimId' && Boolean(initial)} value={draft[field]} onChange={(e) => change(field, e.target.value)}><option value="">{placeholder}</option>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>;
  return <dialog ref={dialog} className="cc-dialog" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="cc-form-title">
    <form onSubmit={save}>
      <header><div><h2 id="cc-form-title">{KINDS[kind].label} · {initial ? (writable ? 'Düzenle' : 'Ayrıntı') : 'Yeni kayıt'}</h2>{kind === 'activities' && <p>Bu alan 153 CRM kaydı değildir. Birimlerin haftalık olarak öne çıkarmak istediği çalışmalar için kullanılır.</p>}</div><button type="button" onClick={onClose} disabled={busy} aria-label="Kapat">✕</button></header>
      <fieldset disabled={busy || !writable} className="cc-form-grid">
        {KINDS[kind].fields.filter((field) => field !== 'recordId' && !(kind === 'personnel' && field === 'personelId') && field !== 'fotoUrl' && (field !== 'telefon' || canViewPhone) && (field !== 'cozumNoktasiId' || draft.birimId === SOLUTION_POINTS_UNIT)).map((field) => <label key={field} htmlFor={`cc-${field}`} className={['not', 'aciklama', 'kapanisNotu', 'sonuc', 'yapilanIs', 'cakismaAciklamasi'].includes(field) ? 'cc-wide' : ''}>
          <span>{field === 'cakismaAciklamasi' && kind === 'plans' ? 'Çakışan görev için yönetici açıklaması' : LABELS[field]}{kind === 'activities' && ['teyitEden', 'teyitTarihi'].includes(field) ? ' *' : ['mahalleId', 'meydanId'].includes(field) || (field === 'ilceId' && kind === 'plans' && draft.planKapsami !== 'ILCE') ? ' (isteğe bağlı)' : ''}</span>
          {field === 'birimId' ? choice(field, Object.entries(catalog.unitMap || UNITS))
            : field === 'cozumNoktasiId' ? choice(field, (catalog.servicePoints || []).filter(p => p.active || p.id === draft.cozumNoktasiId).map(p => [p.id, p.name]), 'Nokta belirtilmedi')
            : field === 'planKapsami' ? choice(field, [['ILCE', 'İlçe'], ['YAKA', 'Yaka'], ['BOLGE', 'Bölge'], ['EKIP', 'Ekip'], ['MERKEZ', 'Merkez / Yönetim']])
              : field === 'ilceId' ? choice(field, catalog.districts.map((d) => [d.id, d.name]), draft.planKapsami === 'ILCE' ? 'İlçe seçin' : 'İlçe belirtilmedi')
              : field === 'mahalleId' ? choice(field, catalog.neighborhoods.filter((n) => n.districtId === draft.ilceId).map((n) => [n.id, n.name]), 'Mahalle belirtilmedi')
                : field === 'meydanId' ? choice(field, catalog.squares.filter((s) => s.districtId === draft.ilceId).map((s) => [s.id, s.name]), 'Meydan seçilmedi')
                  : field === 'personelId' && kind !== 'personnel' ? choice(field, catalog.personnel.filter((p) => p.birimId === draft.birimId).map((p) => [p.personelId, `${p.adSoyad} · ${p.personelId}`]))
                    : field === 'katilimciBirimleri' ? <select id={`cc-${field}`} multiple value={(draft[field] || '').split(',').filter(Boolean)} onChange={(event) => change(field, Array.from(event.target.selectedOptions, (option) => option.value).join(','))}>{Object.entries(catalog.unitMap || UNITS).filter(([id]) => id !== draft.birimId).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
                    : field === 'durum' ? choice(field, STATES.map((s) => [s, s]))
                      : ['not', 'aciklama', 'kapanisNotu', 'sonuc', 'yapilanIs', 'cakismaAciklamasi'].includes(field) ? <textarea id={`cc-${field}`} rows={3} maxLength={4000} value={draft[field]} onChange={(e) => change(field, e.target.value)} required={field === 'kapanisNotu' && draft.durum === 'Tamamlandı'} placeholder={field === 'kapanisNotu' ? 'Kimin bilgisi dahilinde, hangi sonuçla tamamlandı?' : field === 'cakismaAciklamasi' ? 'Yalnız çakışan görevde Yönetici için zorunludur.' : ''} />
                        : <input id={`cc-${field}`} type={['tarih', 'hedefTarih', 'teyitTarihi'].includes(field) ? 'date' : ['baslangic', 'bitis', 'saat'].includes(field) ? 'time' : field === 'telefon' ? 'tel' : 'text'} value={draft[field]} onChange={(e) => change(field, e.target.value)} readOnly={Boolean(initial) && ['recordId', ...(kind === 'personnel' ? ['personelId'] : [])].includes(field)} required={kind === 'activities' && ['teyitEden', 'teyitTarihi'].includes(field)} maxLength={4000} />}
        </label>)}
      </fieldset>
      {kind === 'personnel' && customFields.length > 0 && <fieldset disabled={busy || !writable} className="cc-form-grid"><legend>Birime özel alanlar</legend>{customFields.map((field) => <label key={field.id} htmlFor={`cc-custom-${field.id}`}><span>{field.label}{field.required ? ' *' : ''}</span><input id={`cc-custom-${field.id}`} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={draft.ozelAlanlar?.[field.id] || ''} required={field.required} onChange={(e) => setDraft((old) => ({ ...old, ozelAlanlar: { ...old.ozelAlanlar, [field.id]: e.target.value } }))} /></label>)}</fieldset>}
      {(KINDS[kind].fields.includes('fotoUrl') || kind === 'fieldUpdates') && <section className="cc-photo-editor"><h3>Fotoğraf <small>İsteğe bağlı</small></h3>
        {photo ? <img src={photo.dataUrl} className="cc-record-photo" alt="Yüklenecek fotoğraf" /> : draft.fotoUrl && <RecordPhoto value={draft.fotoUrl} className="cc-record-photo" alt="Kayıt fotoğrafı" />}
        {writable && <div className="cc-actions"><label className="cc-button">Fotoğraf seç<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(''); try { setPhoto(await prepareRecordPhoto(file)); change('fotoUrl', 'syp-photo:' + crypto.randomUUID()); } catch (err) { setError(err.message); } finally { setBusy(false); event.target.value = ''; } }} /></label>{draft.fotoUrl && <button type="button" disabled={busy} onClick={() => { setPhoto(null); change('fotoUrl', ''); }}>Fotoğrafı kaldır</button>}</div>}
      </section>}
      {kind === 'plans' && <p className="cc-muted">Bitiş saati başlangıçtan küçükse görev ertesi gün sona erer. Bu kayıt görev planıdır.</p>}
      {kind === 'plans' && initial && canWrite && <p><button type="button" disabled={busy} onClick={togglePlan}>{initial.iptal ? 'Görevi yeniden etkinleştir' : 'Görevi iptal et'}</button> Geçmiş kayıt korunur; iptal edilen görev dağılımda sayılmaz.</p>}
      {initial && role === 'admin' && <p><button type="button" disabled={busy} onClick={toggleArchive}>{initial.arsivli ? 'Arşivden geri yükle' : 'Kaydı pasife al'}</button></p>}
      {error && <p role="alert" className="cc-error">{error}</p>}
      {initial && <section className="cc-record-notes"><h3>Yönetici notları</h3>{notesLoading ? <p className="cc-muted" role="status">Notlar yükleniyor…</p> : notesError ? <p className="cc-error" role="alert">{notesError}</p> : notes.length ? notes.map(n => <article key={n.id}><p>{n.note}</p><small>{n.author_label} · {new Date(n.created_at).toLocaleString('tr-TR')}</small></article>) : <p className="cc-muted">Henüz not eklenmedi.</p>}{canAddNotes && <div className="cc-actions"><textarea value={noteText} onChange={e => setNoteText(e.target.value)} maxLength={4000} placeholder="Bu kayıtla ilgili notunuzu yazın…" aria-label="Yönetici notu" /><button type="button" disabled={noteBusy || !noteText.trim()} onClick={saveNote}>{noteBusy ? 'Ekleniyor…' : 'Not ekle'}</button></div>}</section>}
      {initial && <details><summary>Değişiklik geçmişi</summary><RecordHistory kind={kind} id={initial.recordId || initial.personelId} /></details>}
      <footer><button type="button" disabled={busy} onClick={onClose}>{writable ? 'Vazgeç' : 'Kapat'}</button>{writable && <button className="cc-primary" disabled={busy}>{busy ? 'İşleniyor…' : 'Kaydet'}</button>}</footer>
    </form>
  </dialog>;
}
