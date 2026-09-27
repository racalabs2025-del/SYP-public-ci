import { useEffect, useState } from 'react';
import { LABELS } from '../../domain/commandCenter.js';
import { loadRecordHistory } from '../../services/supabaseCommandCenterService.js';

export default function RecordHistory({ kind, id }) {
  const [state, setState] = useState({ rows: null, hasMore: false, loadingMore: false, error: '' });
  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    setState({ rows: null, hasMore: false, loadingMore: false, error: '' });
    loadRecordHistory(kind, id).then((page) => {
      if (active) setState({ ...page, loadingMore: false, error: '' });
    }).catch((error) => {
      if (active) setState({ rows: [], hasMore: false, loadingMore: false, error: error.message });
    });
    return () => { active = false; };
  }, [kind, id]);
  async function loadMore() {
    if (state.loadingMore || !state.hasMore) return;
    setState(current => ({ ...current, loadingMore: true, error: '' }));
    try {
      const page = await loadRecordHistory(kind, id, state.rows.length);
      setState(current => ({ ...current, rows: [...current.rows, ...page.rows], hasMore: page.hasMore, loadingMore: false }));
    } catch (error) {
      setState(current => ({ ...current, loadingMore: false, error: error.message }));
    }
  }
  if (state.error) return <p role="alert" className="cc-error">Geçmiş alınamadı: {state.error}</p>;
  if (!state.rows) return <p role="status" className="cc-muted">Geçmiş yükleniyor…</p>;
  if (!state.rows.length) return <p className="cc-empty">Henüz değişiklik kaydı bulunmuyor.</p>;
  return <><ol className="cc-timeline">{state.rows.map((entry) => <li key={entry.id}>
    <div className="cc-timeline__dot" aria-hidden="true" />
    <div><strong>{entry.action || 'Güncellendi'}</strong><p>{entry.byName || entry.by || 'Sistem'} · <time>{new Date(entry.at).toLocaleString('tr-TR')}</time></p>
      {entry.note && <p>{entry.note}</p>}
      {entry.changes && <dl className="cc-change-list">{Object.entries(entry.changes).filter(([key]) => key !== 'telefon').map(([key, change]) => <div key={key}><dt>{LABELS[key] || key}</dt><dd>{String(change.before ?? '—')} → {String(change.after ?? '—')}</dd></div>)}</dl>}
    </div>
  </li>)}</ol>{state.hasMore && <button type="button" className="cc-button" onClick={loadMore} disabled={state.loadingMore}>{state.loadingMore ? 'Yükleniyor…' : 'Daha eski değişiklikleri yükle'}</button>}{state.error && <p role="alert" className="cc-error">Daha eski kayıtlar alınamadı: {state.error}</p>}</>;
}
