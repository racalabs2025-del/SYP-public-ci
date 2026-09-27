import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayKey } from '../../domain/commandCenter.js';
import { usePanelAccess } from '../../hooks/usePanelAccess.js';
import { getRowById, getRowsPage } from '../../services/supabaseCommandCenterService.js';
import RecordPhoto from './RecordPhoto.jsx';
import ContextNotes from './ContextNotes.jsx';
import './FieldUpdatesView.css';

const sevenDaysAgo = (today) => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 6); return date.toISOString().slice(0, 10); };

export default function FieldUpdatesView({ unitMap, districts, neighborhoods = [], squares = [], servicePoints = [], onAdd, reloadKey = 0 }) {
  const { canAddNotes } = usePanelAccess();
  const [params] = useSearchParams();
  const today = todayKey();
  const requestedRecordId = params.get('record') || '';
  const [period, setPeriod] = useState(() => params.get('record') && params.get('from') ? 'record' : 'today');
  const [unit, setUnit] = useState(() => params.get('unit') || '');
  const [district, setDistrict] = useState(() => params.get('district') || '');
  const [photo, setPhoto] = useState(null);
  const [notesOpen, setNotesOpen] = useState(null);
  const [rows, setRows] = useState([]);
  const [cursorOffset, setCursorOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestedFrom = params.get('from') || today;
  const requestedTo = params.get('to') || requestedFrom;
  const from = period === 'week' ? sevenDaysAgo(today) : period === 'record' ? requestedFrom : today;
  const through = period === 'record' ? requestedTo : today;
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setRows([]); setCursorOffset(0);
    Promise.all([
      getRowsPage('fieldUpdates', { from, to: through, ...(unit ? { unitId: unit } : {}), ...(district ? { districtId: district } : {}), includeArchived: false, pageSize: 100, offset: 0 }),
      requestedRecordId ? getRowById('fieldUpdates', requestedRecordId) : Promise.resolve(null),
    ])
      .then(([page, requested]) => {
        if (!active) return;
        const requestedMatches = requested && !requested.arsivli && requested.tarih >= from && requested.tarih <= through && (!unit || requested.birimId === unit) && (!district || requested.ilceId === district);
        const merged = requestedMatches && !page.rows.some((item) => item.recordId === requested.recordId) ? [requested, ...page.rows] : page.rows;
        setRows(merged.sort((a, b) => `${b.tarih}T${b.saat}`.localeCompare(`${a.tarih}T${a.saat}`)));
        setCursorOffset(page.rows.length);
        setHasMore(page.hasMore);
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Saha akışı alınamadı.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, through, today, unit, district, reloadKey, requestedRecordId]);
  const loadMore = async () => {
    setLoadingMore(true); setError('');
    try {
      const page = await getRowsPage('fieldUpdates', { from, to: through, ...(unit ? { unitId: unit } : {}), ...(district ? { districtId: district } : {}), includeArchived: false, pageSize: 100, offset: cursorOffset });
      setRows((current) => [...current, ...page.rows].sort((a, b) => `${b.tarih}T${b.saat}`.localeCompare(`${a.tarih}T${a.saat}`)));
      setCursorOffset((current) => current + page.rows.length); setHasMore(page.hasMore);
    } catch (loadError) { setError(loadError.message || 'Daha eski bildirimler alınamadı.'); }
    finally { setLoadingMore(false); }
  };
  const selected = photo ? rows.find((item) => item.recordId === photo) : null;
  const locationLabel = (item) => [
    item.ilceId && districts.find((districtItem) => districtItem.id === item.ilceId)?.name,
    item.mahalleId && neighborhoods.find((neighborhoodItem) => neighborhoodItem.id === item.mahalleId)?.name,
    item.meydanId && squares.find((squareItem) => squareItem.id === item.meydanId)?.name,
    item.cozumNoktasiId && servicePoints.find((point) => point.id === item.cozumNoktasiId)?.name,
  ].filter(Boolean).join(' · ') || 'Konum belirtilmedi';
  return <section className="cc-field-feed" aria-labelledby="field-feed-title">
    <header className="cc-section-title">
      <div><p className="cc-eyebrow">SAHA BİLDİRİMLERİ</p><h2 id="field-feed-title">{period === 'today' ? 'Bugünün Saha Akışı' : period === 'record' ? 'Seçilen Günün Saha Akışı' : 'Son 7 Günün Saha Akışı'}</h2><p className="cc-muted">Birimlerden merkezi panele iletilen kısa saha bildirimleri.</p></div>
      {onAdd && <button className="cc-primary" type="button" onClick={onAdd}>+ Saha bildirimi ekle</button>}
    </header>
    <div className="cc-field-feed__filters" aria-label="Saha akışı filtreleri">
      <label>Dönem<select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="today">Bugün</option><option value="week">Son 7 gün</option>{period === 'record' && <option value="record">{requestedFrom}</option>}</select></label>
      <label>Birim<select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Tüm birimler</option>{Object.entries(unitMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>İlçe<select value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">Tüm ilçeler</option>{districts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    {loading ? <p role="status" className="cc-notice">Saha bildirimleri yükleniyor…</p> : error && !rows.length ? <div role="alert" className="cc-error">{error}</div> : !rows.length ? <div className="cc-empty">Seçili kapsamda saha bildirimi bulunmuyor.</div> : <div className="cc-field-feed__list">{rows.map((item) => <article className={`cc-field-card${item.recordId === requestedRecordId ? ' is-requested' : ''}`} key={item.recordId}>
      {item.fotoUrl && <button type="button" className="cc-field-card__photo" onClick={() => setPhoto(item.recordId)} aria-label={`${item.baslik} fotoğrafını büyüt`}><RecordPhoto value={item.fotoUrl} alt="Saha bildirimi fotoğrafı" /></button>}
      {item.photoRemoved && <div className="cc-field-card__photo-expired">Fotoğraf saklama süresi doldu</div>}
      <div className="cc-field-card__body"><p className="cc-eyebrow">{unitMap[item.birimId] || 'Birim belirtilmedi'}{item.ekip && ` · ${item.ekip}`}</p><h3>{item.baslik}</h3><p>{item.aciklama}</p><p className="cc-muted">{locationLabel(item)} · {item.tarih} · {item.saat}</p>
        {canAddNotes && <button type="button" className="cc-field-card__notes-toggle" onClick={() => setNotesOpen(notesOpen === item.recordId ? null : item.recordId)}>{notesOpen === item.recordId ? 'Notları gizle' : 'Notları gör / Not ekle'}</button>}
        {notesOpen === item.recordId && <ContextNotes contextType="field_updates" contextId={item.recordId} title={item.baslik} hideWhenEmpty />}
      </div>
    </article>)}</div>}
    {error && rows.length > 0 && <p role="alert" className="cc-error">{error}</p>}
    {!loading && hasMore && <div className="cc-field-feed__more"><button className="cc-button" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Yükleniyor…' : 'Daha eski bildirimleri yükle'}</button></div>}
    {selected && <dialog open aria-modal="true" aria-label={`${selected.baslik} fotoğrafı`} className="cc-photo-dialog" onCancel={(event) => { event.preventDefault(); setPhoto(null); }} onKeyDown={(event) => { if (event.key === 'Escape') setPhoto(null); }} onClick={(event) => { if (event.target === event.currentTarget) setPhoto(null); }}><div><button type="button" autoFocus onClick={() => setPhoto(null)} aria-label="Fotoğrafı kapat">✕</button><RecordPhoto value={selected.fotoUrl} alt={selected.baslik} /></div></dialog>}
  </section>;
}
