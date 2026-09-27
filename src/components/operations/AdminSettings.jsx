import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { KINDS, UNITS } from '../../domain/commandCenter.js';
import { PANEL_ROLES, ROLE_LABELS } from '../../domain/authContracts.js';
import { usePanelAccess } from '../../hooks/usePanelAccess.js';
import { createUnit, getRows, readAdminSettings, saveUnitFieldSchema, setRecordArchived, updateAppUser } from '../../services/supabaseCommandCenterService.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';

export default function AdminSettings() {
  const { role, user } = usePanelAccess();
  const { refresh } = useCommandCenter();
  const [users, setUsers] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [units, setUnits] = useState([]);
  const [archived, setArchived] = useState({});
  const [unit, setUnit] = useState(Object.keys(UNITS)[0]);
  const [label, setLabel] = useState('');
  const [unitIdDraft, setUnitIdDraft] = useState('');
  const [unitNameDraft, setUnitNameDraft] = useState('');
  const [type, setType] = useState('text');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (role !== 'admin') return undefined;
    let active = true;
    Promise.all([
      readAdminSettings(),
      ...['personnel', 'plans', 'activities', 'tasks'].map(kind => getRows(kind, { archivedOnly: true })),
    ]).then(([settings, ...archivedRows]) => {
      if (!active) return;
      setUsers(settings.users); setSchemas(settings.schemas); setUnits(settings.units);
      if (settings.units.length) setUnit(current => settings.units.some(u => u.id === current) ? current : settings.units[0].id);
      setArchived(Object.fromEntries(['personnel', 'plans', 'activities', 'tasks'].map((kind, index) => [kind, archivedRows[index]])));
    }).catch(err => { if (active) setMessage(err.message); });
    return () => { active = false; };
  }, [role]);
  if (role !== 'admin') return null;
  const fields = schemas.find((s) => s.id === unit)?.fields || [];

  async function saveFields(next) {
    setBusy(true); setMessage('');
    try {
      await saveUnitFieldSchema(unit, next, user.uid);
      setSchemas(old => [...old.filter(schema => schema.id !== unit), { id: unit, fields: next }]);
      setMessage('Birim alanları kaydedildi.');
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }

  async function changeUser(target, changes) {
    setBusy(true); setMessage('');
    try {
      await updateAppUser(target.id, changes);
      setUsers(old => old.map(account => account.id === target.id ? { ...account, ...changes, unit_id: changes.unitId ?? account.unit_id, active: changes.disabled === undefined ? account.active : !changes.disabled } : account));
      setMessage('Kullanıcı yetkisi güncellendi.');
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }

  return <>
    <section className="cc-panel">
      <h2>Rol çalışma modeli</h2>
      <p className="cc-muted">Hesap açmadan önce rolü ve kapsamı bu kurala göre belirleyin. Operasyon kayıtlarını yalnız merkezi veri giriş ekibi değiştirir.</p>
      <div className="cc-cards cc-cards--compact">
        {[
          ['Admin', 'Sistem, kullanıcı ve birim ayarlarını yönetir. Telefonları görür.'],
          ['Veri giriş ekibi', 'Merkezden doğrulanmış veriyi yükler ve günceller.'],
          ['Yönetici', 'Tüm görünümü ve telefonları görür; kayıtlar için not ekleyebilir.'],
          ['Şef', 'Yalnız kendi birimini görür; not ekleyebilir, telefon görmez.'],
          ['İzleyici', 'Yalnız görüntüler.'],
        ].map(([title, description]) => <article className="cc-record" key={title}><strong>{title}</strong><p>{description}</p></article>)}
      </div>
    </section>
    <section className="cc-panel">
      <h2>Birim personel alanları</h2>
      <p className="cc-muted">Birim ekleme ve birime özgü personel alanlarını yönetme yalnızca Admin yetkisindedir. Kayıtlı birimler silinmez.</p>
      <div className="cc-actions"><label>Birim kodu <input value={unitIdDraft} onChange={e => setUnitIdDraft(e.target.value.toLocaleUpperCase('tr-TR'))} maxLength={40} placeholder="YENI_BIRIM" /></label><label>Birim adı <input value={unitNameDraft} onChange={e => setUnitNameDraft(e.target.value)} maxLength={100} placeholder="Yeni birim adı" /></label><button type="button" disabled={busy || !unitIdDraft.trim() || !unitNameDraft.trim()} onClick={async () => { setBusy(true); setMessage(''); try { const added = await createUnit(unitIdDraft, unitNameDraft); setUnits(old => [...old, added].sort((a,b) => a.name.localeCompare(b.name, 'tr'))); setUnit(added.id); setUnitIdDraft(''); setUnitNameDraft(''); setMessage('Birim eklendi.'); await refresh('units'); } catch (err) { setMessage(err.message); } finally { setBusy(false); } }}>Birim ekle</button></div>
      <label>Birim <select value={unit} onChange={(e) => setUnit(e.target.value)}>{units.filter(u => u.active).map(({id,name}) => <option key={id} value={id}>{name}</option>)}</select></label>
      <div className="cc-cards">{fields.map((field) => <article className="cc-record" key={field.id}>
        <strong>{field.label}</strong> · {field.type === 'number' ? 'Sayı' : field.type === 'date' ? 'Tarih' : 'Metin'} · {field.required ? 'Zorunlu' : 'İsteğe bağlı'}
        <div className="cc-actions"><button type="button" disabled={busy} onClick={() => saveFields(fields.map((f) => f.id === field.id ? { ...f, required: !f.required } : f))}>Zorunluluğu değiştir</button>
        <button type="button" disabled={busy} onClick={() => saveFields(fields.map((f) => f.id === field.id ? { ...f, active: f.active === false } : f))}>{field.active === false ? 'Etkinleştir' : 'Pasife al'}</button></div>
      </article>)}</div>
      <div className="cc-actions"><label>Alan adı <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} /></label>
      <label>Tür <select value={type} onChange={(e) => setType(e.target.value)}><option value="text">Metin</option><option value="number">Sayı</option><option value="date">Tarih</option></select></label>
      <button type="button" disabled={busy || !label.trim()} onClick={async () => { await saveFields([...fields, { id: 'alan_' + crypto.randomUUID().replace(/-/g, ''), label: label.trim(), type, required: false, active: true }]); setLabel(''); }}>Alan ekle</button></div>
    </section>
    <section className="cc-panel">
      <h2>Kullanıcı yetkileri</h2>
      <p className="cc-muted">Şef hesaplarında birim seçimi zorunludur. Yeni oturum hesabı ayrıca Firebase Authentication üzerinden oluşturulur.</p>
      <div className="cc-cards">{users.map((account) => <article className="cc-record" key={account.id}>
        <strong>{account.display_name || account.email || account.id}</strong>
        <div className="cc-actions"><label>Rol <select disabled={busy || account.id === user.uid} value={account.role || 'viewer'} onChange={(e) => changeUser(account, { role: e.target.value, unitId: e.target.value === 'chief' ? account.unit_id || units[0]?.id : '' })}>{PANEL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
        {account.role === 'chief' && <label>Birim <select disabled={busy} value={account.unit_id || ''} onChange={(e) => changeUser(account, { unitId: e.target.value })}><option value="">Birim seçin</option>{units.filter(u => u.active).map(({id,name}) => <option key={id} value={id}>{name}</option>)}</select></label>}
        <button type="button" disabled={busy || account.id === user.uid} onClick={() => changeUser(account, { disabled: account.active })}>{account.active ? 'Hesabı devre dışı bırak' : 'Hesabı etkinleştir'}</button></div>
      </article>)}</div>
    </section>
    <section className="cc-panel"><h2>Pasife alınan kayıtlar</h2><p className="cc-muted">Geri yükleme işlemi geçmişe kaydedilir.</p>
      <div className="cc-cards">{Object.entries(archived).flatMap(([kind, rows]) => rows.map((record) => <article className="cc-record" key={`${kind}-${record.id}`}><strong>{record.adSoyad || record.baslik || record.gorevYeri || record.id}</strong>{kind === 'personnel' && <Link to={`/birim/${record.birimId}/personel/${record.id}`}>Personel profili ve geçmişi</Link>}<p>{KINDS[kind]?.label} · {record.birimId ? units.find(u => u.id === record.birimId)?.name || UNITS[record.birimId] || record.birimId : 'Genel'}</p><button type="button" disabled={busy} onClick={async () => { setBusy(true); setMessage(''); try { await setRecordArchived(kind, record.id, false); setArchived(old => ({ ...old, [kind]: old[kind].filter(row => row.id !== record.id) })); await refresh(kind); setMessage('Kayıt geri yüklendi.'); } catch (err) { setMessage(err.message); } finally { setBusy(false); } }}>Geri yükle</button></article>))}</div>
    </section>
    {message && <p role="status" className="cc-notice">{message}</p>}
  </>;
}
