import RecordPhoto from './RecordPhoto.jsx';
import { Link } from 'react-router-dom';
import { UNITS, personnelPath, planLocationLabel } from '../../domain/commandCenter.js';

/**
 * Tek bir personeli görev planı, iletişim bilgisi ve düzenleme seçenekleriyle gösteren premium kart.
 * Mobilde telefon bağlantısı ve görev bilgisi ön plana çıkar.
 */
export default function PersonCard({ person, plans = [], queryString = '', role = 'viewer', unitMap = UNITS, onEdit }) {
  const photo = person.fotoUrl;
  const initials = (person.adSoyad || '??').slice(0, 2).toLocaleUpperCase('tr-TR');
  const canViewPhone = ['admin', 'manager'].includes(role);

  return (
    <article className="cc-person-card">
      <div className="cc-person-card__header">
        <div className="cc-person-card__avatar-wrap">
          {photo
            ? <RecordPhoto className="cc-person-card__avatar" value={photo} />
            : <span className="cc-person-card__initials" aria-hidden="true">{initials}</span>}
          <span className="cc-person-card__status" aria-label={person.arsivli ? 'Pasif' : 'Kayıtlı'} />
        </div>
        <div className="cc-person-card__identity">
          {person.isVirtual ? <span className="cc-person-card__name">{person.adSoyad}</span> : <Link className="cc-person-card__name" to={`${personnelPath(person)}${queryString}`}>{person.adSoyad}</Link>}
          <span className="cc-person-card__unit">
            {unitMap[person.birimId] || 'Birim bilgisi bekleniyor'}
            {person.unvan && <> · <strong>{person.unvan}</strong></>}
            {person.ekip && person.ekip !== person.unvan && <> · {person.ekip}</>}
          </span>
          <small className="cc-person-card__code">#{person.sistemPersonelKodu || person.personelId}</small>
        </div>
      </div>

      {plans.length > 0 ? (
        <div className="cc-person-card__shifts">
          {plans.map((s) => (
            <div className="cc-person-card__shift" key={s.recordId}>
              <div className="cc-person-card__shift-location">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <span>{planLocationLabel(s)}</span>
              </div>
              <div className="cc-person-card__shift-time">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <span>{s.tarih} · {s.baslangic || '—'} – {s.bitis || '—'}</span>
                {s.ekip && <span className="cc-person-card__team">{s.ekip}</span>}
              </div>
              {s.updatedAt && <small>Plan son güncelleme: {new Date(s.updatedAt).toLocaleString('tr-TR')} · Geçerli tarih: {s.tarih}</small>}
              {s.iptal && <span className="cc-person-card__cancelled">İptal</span>}
              {onEdit && (
                <button className="cc-person-card__edit-shift" onClick={() => onEdit('plans', s)}>
                {['admin', 'manager', 'data_entry'].includes(role) ? 'Düzenle' : 'Ayrıntı'}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="cc-person-card__no-shift">Seçili tarih aralığında görev planı bulunmuyor.</p>
      )}

      <div className="cc-person-card__footer">
        {canViewPhone && person.telefon ? (
          <span className="cc-person-card__contact-actions"><a className="cc-person-card__call" href={`tel:${person.telefon.replace(/[^\d+]/g, '')}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            {person.telefon}
          </a><a className="cc-person-card__whatsapp" href={`https://wa.me/${person.telefon.replace(/\D/g, '').replace(/^0/, '90')}`} target="_blank" rel="noreferrer" aria-label={`${person.adSoyad} WhatsApp`}>WhatsApp</a></span>
        ) : (
          canViewPhone ? <span className="cc-person-card__no-phone">Telefon bilgisi yok</span> : <span className="cc-person-card__no-phone">{person.unvan || 'Birim personeli'}</span>
        )}
        {onEdit && (
          <button className="cc-person-card__detail-btn" onClick={() => onEdit('personnel', person)}>
            {['admin', 'data_entry'].includes(role) ? 'Düzenle' : 'Ayrıntı'}
          </button>
        )}
      </div>
    </article>
  );
}
