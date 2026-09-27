import { useCallback, useEffect, useState } from 'react';
import { addContextNote, loadContextNotes } from '../../services/supabaseCommandCenterService.js';
import { usePanelAccess } from '../../hooks/usePanelAccess.js';

export default function ContextNotes({ contextType, contextId, title, hideWhenEmpty = false }) {
  const { canAddNotes } = usePanelAccess();
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    setLoading(true); setError('');
    loadContextNotes(contextType, contextId,
      rows => { setNotes(rows); setLoading(false); },
      err => { setNotes([]); setError(err.message || 'Notlar alınamadı.'); setLoading(false); });
  }, [contextType, contextId]);
  useEffect(() => { reload(); }, [reload]);
  async function save() {
    if (!canAddNotes || !text.trim() || busy) return;
    setBusy(true); setError('');
    try { await addContextNote(contextType, contextId, text); setText(''); reload(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  if (hideWhenEmpty && !notes.length && !canAddNotes) return null;
  return <section className="cc-context-notes" aria-label={`${title} yönetici notları`}>
    <div><p className="cc-eyebrow">Yönetici notları</p><h3>{title} için notlar</h3></div>
    {loading ? <p role="status" className="cc-muted">Notlar yükleniyor…</p> : notes.length ? <div className="cc-context-notes__list">{notes.map((note) => <article key={note.id}><p>{note.note}</p><small>{note.author_label} · {new Date(note.created_at).toLocaleString('tr-TR')}</small></article>)}</div> : !error && !hideWhenEmpty && <p className="cc-muted">Henüz not eklenmedi.</p>}
    {canAddNotes && <div className="cc-context-notes__form"><textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} placeholder="Bu konumla ilgili yönetici notunuzu yazın…" aria-label="Yönetici notu" /><button type="button" disabled={busy || !text.trim()} onClick={save}>{busy ? 'Ekleniyor…' : 'Not ekle'}</button></div>}
    {error && <p className="cc-error" role="alert">{error}</p>}
  </section>;
}
