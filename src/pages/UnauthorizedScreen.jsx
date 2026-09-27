/**
 * @file src/pages/UnauthorizedScreen.jsx
 * @description SYP Yetkisiz Kullanıcı Bilgilendirme Ekranı (Unauthorized Screen).
 *
 * Faz 5 Standartları:
 * - Authenticated ancak yetki rolü tanımlanmamış / devre dışı bırakılmış kullanıcılar için gösterilir.
 * - Sonsuz redirect loop oluşturmaz.
 * - Güvenli çıkış (Logout) seçeneği sağlar.
 * - Kullanıcının yöneticisiyle iletişime geçebilmesi için UID bilgisini güvenle gösterir.
 */

import Header from '../Header';
import SypCircularLogo from '../components/shared/SypCircularLogo';
import {
  ShieldExclamationIcon,
  ArrowRightOnRectangleIcon,
  UserIcon,
  IdentificationIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

export default function UnauthorizedScreen({ user = null, onLogout = null, requiredRole = null }) {
  const email = user?.email || 'Bilinmiyor';
  const uid = user?.uid || '—';

  return (
    <div className="login-screen" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header onLogout={onLogout} />

      <main className="login-screen__main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <section
          className="login-card"
          aria-label="Yetkilendirme Durumu"
          style={{ maxWidth: '480px', width: '100%', margin: '0 auto' }}
        >
          <div className="login-card__logo-wrapper" style={{ marginBottom: '1.25rem' }}>
            <SypCircularLogo size={88} variant="minimal" />
          </div>

          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              marginBottom: '0.75rem',
            }}>
              <ShieldExclamationIcon width={28} height={28} />
            </div>

            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem' }}>
              Bu Alana Erişim Yetkiniz Bulunmuyor
            </h2>

            <p style={{ fontSize: '0.92rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              {requiredRole ? (
                <span>Bu işlem için <strong>{requiredRole}</strong> rolü gereklidir.</span>
              ) : (
                <span>Saha Yönetim Paneli oturumunuz açık, ancak hesabınıza tanımlanmış aktif bir yetki rolü bulunamadı.</span>
              )}
            </p>
          </div>

          {/* Kullanıcı Detay Kutusu */}
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
              <UserIcon width={16} height={16} style={{ color: '#94a3b8' }} />
              <span style={{ color: '#64748b' }}>E-posta:</span>
              <strong style={{ color: '#f1f5f9', wordBreak: 'break-all' }}>{email}</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
              <IdentificationIcon width={16} height={16} style={{ color: '#94a3b8' }} />
              <span style={{ color: '#64748b' }}>Kullanıcı Kimliği (UID):</span>
              <code style={{ color: '#38bdf8', fontSize: '0.78rem', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>
                {uid}
              </code>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1' }}>
              <InformationCircleIcon width={16} height={16} style={{ color: '#eab308' }} />
              <span style={{ color: '#64748b' }}>Durum:</span>
              <span style={{ color: '#eab308', fontWeight: 600 }}>Yetki Tanımı Bekleniyor</span>
            </div>
          </div>

          {/* Destek Notu */}
          <div style={{
            fontSize: '0.8rem',
            color: '#64748b',
            lineHeight: 1.45,
            marginBottom: '1.5rem',
            textAlign: 'center',
          }}>
            Erişim yetkisi almak için lütfen sistem yöneticiniz ile iletişime geçiniz ve yukarıdaki Kullanıcı Kimliğinizi (UID) bildiriniz.
          </div>

          {/* Çıkış Butonu */}
          {onLogout ? (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={onLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                fontSize: '0.92rem',
                fontWeight: 600,
              }}
            >
              <ArrowRightOnRectangleIcon width={18} height={18} />
              <span>Güvenli Çıkış Yap</span>
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
