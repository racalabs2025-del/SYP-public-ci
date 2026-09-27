import { useEffect, useState } from 'react';
import { KINDS, LABELS, UNITS, buildPreview, validDate } from '../../domain/commandCenter.js';
import { readCommandWorkbook } from '../../domain/commandImport.js';
import { loadUnitFieldSchema, readImportContext, saveRecordsAtomic } from '../../services/supabaseCommandCenterService.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { usePanelAccess } from '../../hooks/usePanelAccess.js';
import { downloadWorkbook } from '../../lib/excelWorkbook.js';

export default function CommandImport() {
  const { catalog, ready, refresh } = useCommandCenter();
  const { role, canImport, canViewPhone } = usePanelAccess();
  const [kind, setKind] = useState('personnel'), [preview, setPreview] = useState([]), [selected, setSelected] = useState(new Set());
  const [unit, setUnit] = useState(Object.keys(UNITS)[0]), [customFields, setCustomFields] = useState([]);
  useEffect(() => { if (catalog.units?.length && !catalog.unitMap?.[unit]) setUnit(catalog.units[0].id); }, [catalog.units, catalog.unitMap, unit]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [results, setResults] = useState([]);
  useEffect(() => {
    if (kind !== 'personnel') return undefined;
    let active = true;
    loadUnitFieldSchema(unit, fields => { if (active) setCustomFields(fields.filter(f => f.active !== false)); }, err => { if (active) setMessage(err.message); });
    return () => { active = false; };
  }, [kind, unit]);
  const importGuide = {
    personnel: {
      title: '1. Birim personeli',
      description: 'Her şeflik kendi personel listesini gönderir. Personel kodu sonraki planların güvenli eşleştirme anahtarıdır.',
    },
    plans: {
      title: '2. Haftalık plan',
      description: 'İlçe planları şehir ve ilçe haritalarına yansır. Yaka, bölge, ekip ve merkez planları yalnız şeflik/personel görünümünde yer alır.',
    },
    activities: {
      title: '3. Öne çıkan çalışma',
      description: '153 CRM kaydı değildir. Çalışma başlığıyla birlikte bilgiyi ileten kişi/birim ve iletim tarihi zorunludur.',
    },
    tasks: {
      title: '4. Takip edilen iş',
      description: 'Yönetimin izlemesini istediğiniz açık konular içindir. Tamamlandığında kapanış notu eklenir.',
    },
  }[kind];
  async function downloadTemplate() {
    const headers = [...KINDS[kind].fields.map((f) => LABELS[f]), ...(kind === 'personnel' ? customFields.map((f) => f.label) : [])];
    const guide = [
      ['SYP', KINDS[kind].label],
      ['Kullanım', 'Veri sayfasının başlıklarını değiştirmeyin. Her satır tek kayıttır.'],
      ['Kayıt sınırı', 'Tek dosyada en fazla 500 kayıt yüklenebilir.'],
      ['Kod alanları', 'Personel ve kayıt kodlarını metin olarak girin; baştaki sıfırları koruyun.'],
      ['Tarih', 'YYYY-AA-GG'],
      ['Saat', 'SS:DD'],
      ['Plan kapsamı', 'İlçe planında İlçe zorunludur. Yaka, Bölge, Ekip veya Merkez planında Kapsam Adı zorunludur; ilçe boş kalabilir ve kayıt harita toplamına girmez.'],
      ['Öne çıkan çalışma', '153 CRM kaydı değildir. Çalışma Başlığı, Bilgiyi İleten ve İletim Tarihi zorunludur; Kısa Açıklama isteğe bağlıdır.'],
      ['Formül', 'Formül kullanmayın; yalnız doğrulanmış değerleri yapıştırın.'],
      ['Birim kodu', 'Birim adı'],
      ...Object.entries(catalog.unitMap || UNITS),
    ];
    await downloadWorkbook([
      { name: 'Veri', rows: [headers], widths: headers.map(() => 22) },
      { name: 'Rehber', rows: guide, widths: [22, 72] },
    ], `syp-${kind}${kind === 'personnel' ? '-' + unit.toLowerCase() : ''}.xlsx`);
  }
  async function read(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setPreview([]); setResults([]); setMessage('');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Dosya en fazla 8 MB olabilir.');
      const rows = await readCommandWorkbook(await file.arrayBuffer(), kind, kind === 'personnel' ? customFields : []);
      if (kind === 'personnel' && rows.some((row) => row.birimId !== unit)) throw new Error('Dosyadaki tüm personeller seçili birime ait olmalıdır.');
      const filters = {};
      if (kind === 'plans') {
        const dates = rows.map((row) => row.tarih).filter(validDate).sort();
        if (dates.length) {
          const start = new Date(dates[0] + 'T12:00:00Z'), end = new Date(dates.at(-1) + 'T12:00:00Z');
          if (end - start > 90 * 86400000) throw new Error('Tek dosyada en fazla 90 günlük görev planı yükleyin.');
          start.setUTCDate(start.getUTCDate() - 1); end.setUTCDate(end.getUTCDate() + 1);
          filters.from = start.toISOString().slice(0, 10); filters.to = end.toISOString().slice(0, 10);
        }
      }
      const existing = await readImportContext(kind, null, filters);
      const list = buildPreview(kind, rows, existing, catalog, { role });
      setPreview(list); setSelected(new Set(list.filter((p) => p.status === 'Yeni').map((p) => p.row)));
    } catch (err) { setMessage(err.message); } finally { setBusy(false); e.target.value = ''; }
  }
  async function commit() {
    if (!canImport || !ready || busy) return;
    setBusy(true); setMessage('');
    const selectedRows = preview.filter((item) => selected.has(item.row) && !item.errors.length);
    try {
      await saveRecordsAtomic(kind, selectedRows, catalog, { role });
      const saved = selectedRows.map(item => ({ row: item.row, ok: true, text: 'Kaydedildi' }));
      setResults(saved);
      setSelected(new Set());
      setMessage(`${saved.length} kayıt tek işlemde kaydedildi.`);
      setPreview([]);
      await refresh(kind);
    } catch (err) {
      setResults(selectedRows.map(item => ({ row: item.row, ok: false, text: 'Toplu işlem geri alındı.' })));
      setMessage(`Hiçbir kayıt kaydedilmedi: ${err.message}`);
    } finally { setBusy(false); }
  }
  if (!canImport) return <p>Bu alan için veri giriş yetkisi gerekiyor.</p>;
  return <section className="cc-panel">
    <div className="cc-section-title"><div><p className="cc-eyebrow">MERKEZİ VERİ AKIŞI</p><h2>Haftalık veri yükleme</h2><p>Birimler veriyi gönderir; panel ekibi doğrular, önizler ve yayımlar.</p></div></div>
    <div className="cc-cards cc-cards--compact" aria-label="Haftalık veri sırası">
      {[
        ['Personel', 'Önce yalnız yeni veya değişen personel bilgileri'],
        ['Plan', 'Sonra vardiya ve çalışma kapsamı'],
        ['Öne çıkan çalışmalar', 'Yalnız görünür kılınacak seçili çalışmalar'],
        ['Takip edilen işler', 'Yönetimce izlenecek açık konular'],
      ].map(([title, description], index) => <article className="cc-record" key={title}><strong>{index + 1}</strong><p>{title}</p><small>{description}</small></article>)}
    </div>
    <section className="cc-notice"><strong>{importGuide.title}</strong><span>{importGuide.description}</span></section>
    <div className="cc-actions"><label>Veri türü<select value={kind} disabled={busy} onChange={(e) => { setKind(e.target.value); setPreview([]); setResults([]); setSelected(new Set()); setMessage(''); }}>{Object.entries(KINDS).filter(([id]) => id !== 'fieldUpdates').map(([id, k]) => <option key={id} value={id}>{k.label}</option>)}</select></label>{kind === 'personnel' && <label>Birim<select value={unit} disabled={busy} onChange={(e) => { setUnit(e.target.value); setPreview([]); }}>{Object.entries(catalog.unitMap || UNITS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}<button type="button" className="cc-button" onClick={downloadTemplate}>Excel şablonunu indir</button><label className="cc-button">Dosya seç<input aria-label="Excel dosyası seç" type="file" accept=".xlsx" onChange={read} disabled={busy || !ready} /></label></div>
    <p className="cc-muted">Değişen kayıtlar kendiliğinden seçilmez. Panelde yaptığınız düzeltmeyi dosyayla değiştirmek istiyorsanız ilgili satırı inceleyerek seçin. Eksik satırlar mevcut kayıtları silmez.</p>
    {message && <p role="status">{message}</p>}
    {preview.length > 0 && <><p>{preview.length} satır · {preview.filter((p) => p.errors.length).length} hatalı · {selected.size} seçili</p><div className="cc-import-rows">{preview.map((p) => <article className="cc-record" key={p.row}><label><input type="checkbox" disabled={busy || p.status === 'Hatalı' || p.status === 'Aynı'} checked={selected.has(p.row)} onChange={(e) => setSelected((old) => { const next = new Set(old); if (e.target.checked) next.add(p.row); else next.delete(p.row); return next; })} /> Satır {p.row} · {p.record.adSoyad || p.record.yapilanIs || p.record.baslik || p.record.recordId} <strong>{p.status}</strong></label>{p.errors.map((s) => <p className="cc-error" key={s}>{s}</p>)}<details><summary>Alanları {p.previous ? 'karşılaştır' : 'gör'}</summary><dl>{KINDS[kind].fields.filter((f) => f !== 'telefon' || canViewPhone).map((f) => <div key={f}><dt>{LABELS[f]}</dt><dd>{p.previous && p.previous[f] !== p.record[f] ? `${p.previous[f] || '—'} → ` : ''}{p.record[f] || '—'}</dd></div>)}{kind === 'personnel' && customFields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{p.record.ozelAlanlar?.[field.id] || '—'}</dd></div>)}</dl></details></article>)}</div><button className="cc-primary" disabled={busy || !selected.size || !ready} onClick={commit}>{busy ? 'Kaydediliyor…' : `${selected.size} kaydı onayla ve yükle`}</button></>}
    {results.map((r) => <p key={r.row} className={r.ok ? '' : 'cc-error'}>Satır {r.row}: {r.text}</p>)}
  </section>;
}
