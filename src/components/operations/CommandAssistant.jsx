import { withoutContactDetails } from '../../domain/privacy.js';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KINDS, UNITS, normalizeText, planLocationLabel, planScopeLabel, todayKey, validDate } from '../../domain/commandCenter.js';
import { usePanelAccess } from '../../hooks/usePanelAccess.js';
import CommandRecordForm from './CommandRecordForm.jsx';

export default function CommandAssistant({ data, scope, filters = {}, unitMap = UNITS }) {
  const { canWrite, canManageTasks, canOverridePlan } = usePanelAccess();
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [matches, setMatches] = useState([]);
  const [kind, setKind] = useState(canWrite ? 'activities' : 'tasks');
  const [draft, setDraft] = useState(null);
  const activeDistrict = filters.district ? data.catalog.districts.find((d) => d.id === filters.district) : null;
  const scopedOpen = data.openTasks.filter((r) => (!filters.unit || r.birimId === filters.unit || r.katilimciBirimIds?.includes(filters.unit)) && (!filters.district || r.ilceId === filters.district));
  const summary = `${activeDistrict?.name || unitMap[filters.unit] || 'İstanbul geneli'} · ${data.from} – ${data.to}: ${scope.people} planlı tekil kişi, ${scope.activities.length} gerçekleşen çalışma ve ${scopedOpen.length} açık takip işi.`;
  const canCreateKind = (candidate) => candidate === 'tasks' ? canManageTasks : candidate === 'plans' ? canOverridePlan : canWrite;

  function ask() {
    setError(''); setAnswer(''); setMatches([]);
    const q = normalizeText(text);
    const explicitDistrict = data.catalog.districts.find((d) => q.includes(normalizeText(d.name)));
    const explicitUnit = Object.entries(unitMap).find(([, name]) => q.includes(normalizeText(name)))?.[0];
    const explicitPerson = data.personnel.find((p) => q.includes(normalizeText(p.adSoyad)));
    const explicitDate = q.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const wantedDate = explicitDate || (q.includes('bugun') ? todayKey() : null);
    if (wantedDate && (!validDate(wantedDate) || wantedDate < data.from || wantedDate > data.to)) {
      setError('Soru tarihi seçili aralığın dışında. Önce üstteki tarih filtresini değiştirin.'); return;
    }
    const districtId = explicitDistrict?.id || filters.district || '';
    const unitId = explicitUnit || filters.unit || '';
    const inScope = (record) => (!wantedDate || record.tarih === wantedDate) && (!districtId || record.ilceId === districtId) && (!unitId || record.birimId === unitId || record.katilimciBirimIds?.includes(unitId));
    const wantsTasks = /\b(is|isi|isler|isleri|takip|sorumlu|bekleyen|acik)\b/.test(q);
    const wantsActivities = q.includes('calisma') || q.includes('faaliyet') || q.includes('yapilan');
    const wantsFieldUpdates = q.includes('bildirim') || q.includes('saha akisi') || q.includes('sahadan') || q.includes('iletildi');
    const wantsPlans = q.includes('kim') || q.includes('personel') || q.includes('gorev') || explicitPerson;
    const wantsPoints = q.includes('nokta') || q.includes('sube');
    const all = !wantsTasks && !wantsActivities && !wantsFieldUpdates && !wantsPlans && !wantsPoints;
    const plans = (all || wantsPlans ? data.plans.filter((r) => !r.arsivli && !r.iptal) : []).filter((p) => inScope(p) && (!explicitPerson || p.personelId === explicitPerson.personelId));
    const activities = (all || wantsActivities ? data.activities.filter((r) => !r.arsivli) : []).filter(inScope);
    const tasks = (all || wantsTasks ? (q.includes('acik') || q.includes('bekleyen') ? data.openTasks : data.tasks).filter((r) => !r.arsivli) : []).filter(inScope);
    const fieldUpdates = (all || wantsFieldUpdates ? (data.fieldUpdates || []).filter((r) => !r.arsivli) : []).filter(inScope);
    const points = (all || wantsPoints ? data.catalog.servicePoints.filter(p => p.active) : []).filter(p => (!districtId || p.ilceId === districtId) && (!unitId || p.birimId === unitId) && (!explicitPerson || explicitPerson.cozumNoktasiId === p.id));
    const rows = [
      ...plans.map((p) => ({ kind: 'plan', id: p.recordId, title: data.personnel.find((x) => x.personelId === p.personelId)?.adSoyad || p.adSoyad || 'Görev planı', detail: `${planLocationLabel(p)} · ${planScopeLabel(p)} · ${p.tarih} ${p.baslangic}–${p.bitis}`, url: `/personel/detay/${encodeURIComponent(p.personelId)}?from=${p.tarih}&to=${p.tarih}&record=${encodeURIComponent(p.recordId)}` })),
      ...activities.map((a) => ({ kind: 'activity', id: a.recordId, title: a.yapilanIs, detail: `${a.gorevYeri} · ${a.tarih}`, url: `/?from=${a.tarih}&to=${a.tarih}&tab=activities&record=${encodeURIComponent(a.recordId)}` })),
      ...tasks.map((t) => ({ kind: 'task', id: t.recordId, title: t.baslik, detail: `${t.sorumlu} · ${t.durum}`, url: `/takip-edilen-isler?from=${t.tarih}&to=${t.tarih}&record=${encodeURIComponent(t.recordId)}` })),
      ...fieldUpdates.map((item) => ({ kind: 'field-update', id: item.recordId, title: item.baslik, detail: `${item.ilceId ? data.catalog.districts.find(d => d.id === item.ilceId)?.name || item.ilceId : 'Konum belirtilmedi'} · ${item.tarih} ${item.saat}`, url: `/saha-akisi?from=${item.tarih}&to=${item.tarih}${unitId ? `&unit=${encodeURIComponent(unitId)}` : ''}${districtId ? `&district=${encodeURIComponent(districtId)}` : ''}&record=${encodeURIComponent(item.recordId)}` })),
      ...points.map((p) => ({ kind: 'point', id: p.id, title: p.name, detail: `${data.catalog.districts.find(d => d.id === p.ilceId)?.name || p.ilceId} · Çözüm noktası`, url: `/cozum-noktalari/noktalar/${encodeURIComponent(p.id)}?from=${data.from}&to=${data.to}` })),
    ];
    setMatches(rows.slice(0, 30).map((row) => ({ ...row, title: withoutContactDetails(row.title), detail: withoutContactDetails(row.detail) })));
    setAnswer(`Seçili kayıtlar: ${plans.length} görev planı, ${activities.length} öne çıkan çalışma, ${fieldUpdates.length} saha bildirimi, ${tasks.length} takip işi, ${points.length} çözüm noktası. ${rows.length > 30 ? 'İlk 30 kayıt gösteriliyor.' : ''}`);
  }

  function makeDraft() {
    if (!text.trim() || !canCreateKind(kind)) return;
    const normalized = normalizeText(text);
    const explicitDistrict = data.catalog.districts.find((d) => normalized.includes(normalizeText(d.name)));
    const explicitUnit = Object.entries(unitMap).find(([, name]) => normalized.includes(normalizeText(name)))?.[0];
    const explicitDate = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const safeText = withoutContactDetails(text).slice(0, 4000);
    setDraft({ recordId: crypto.randomUUID(), birimId: explicitUnit || filters.unit || (kind === 'tasks' ? '' : 'MEYDAN'), ilceId: explicitDistrict?.id || filters.district || '', tarih: validDate(explicitDate) ? explicitDate : todayKey(), durum: 'Bekliyor', yapilanIs: kind === 'activities' ? safeText : '', baslik: kind === 'tasks' ? safeText.slice(0, 160) : '', not: kind === 'plans' ? safeText : '' });
  }

  return <section className="cc-panel"><h2>Günlük özet ve saha asistanı</h2><p>{summary}</p><p className="cc-muted">Yanıtlar seçili dönem ve erişim yetkinizdeki gerçek kayıtlardan oluşturulur. Her sonuç kaynak kayda açılır. Girilen saha metni dış yapay zekâ servisine gönderilmez.</p>
    <label>Sorunuz veya gelen saha metni<textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={12000} placeholder="Bugün Kadıköy'de kim var?" /></label>
    <div className="cc-actions"><button type="button" disabled={!text.trim() || !data.ready} onClick={ask}>Kayıtlarda ara</button>{(canWrite || canManageTasks || canOverridePlan) && <><label>Taslak türü<select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).filter(([candidate]) => canCreateKind(candidate)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label><button type="button" disabled={!text.trim() || !data.ready} onClick={makeDraft}>İncelenecek taslak oluştur</button></>}</div>
    {error && <p role="alert" className="cc-error">{error}</p>}
    {answer && <div role="status"><p>{answer}</p>{matches.map((m) => <p key={m.kind + m.id}><Link to={m.url}>{m.title}</Link> · {m.detail}</p>)}</div>}
    {draft && <CommandRecordForm kind={kind} defaults={draft} onClose={() => setDraft(null)} />}
  </section>;
}
