import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  SunIcon,
  MoonIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { formatLongDateTime } from './utils/date';
import { useTheme } from './context/themeState.js';

export default function Header({ onLogout = null }) {
  const { theme, toggleTheme } = useTheme();
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isLoginPage = location.pathname === '/login';
  const isSplashPage = location.pathname === '/splash';

  const displayDate = now.getFullYear() < 2026
    ? new Date(2026, 8, 22, now.getHours(), now.getMinutes(), now.getSeconds())
    : now;
  
  const { dateLabel } = formatLongDateTime(displayDate);
  // Time formatting specifically for the header "12:50" format
  const timeLabel = displayDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  // Minimal and Premium Header Design
  return (
    <header className="global-premium-header" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.85rem 1.5rem',
      background: 'var(--syp-card-bg, #ffffff)',
      borderBottom: '1px solid var(--syp-border-color, #e2e8f0)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.02)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      fontFamily: 'var(--font-sans)',
    }}>
      {/* LEFT SECTION: Branding & Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div 
          role="button" 
          tabIndex={0} 
          onClick={() => navigate('/')}
          onKeyDown={(e) => { if(e.key === 'Enter') navigate('/'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', outline: 'none' }}
        >
          {/* Logo Box */}
          <div style={{
            background: 'linear-gradient(135deg, #00498e 0%, #0284c7 100%)',
            color: 'white',
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '1rem',
            letterSpacing: '1px',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
          }}>
            SYP
          </div>
          {/* App Title */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ 
              fontSize: '1.05rem', 
              fontWeight: '800', 
              color: 'var(--syp-text-main, #0f172a)',
              letterSpacing: '-0.3px',
              lineHeight: '1.2'
            }}>
              SYP SAHA YÖNETİM PANELİ
            </strong>
          </div>
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '24px', background: 'var(--syp-border-color, #e2e8f0)' }} />

        {/* Context / Subtitle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ 
            fontSize: '0.9rem', 
            fontWeight: '700', 
            color: 'var(--syp-primary-blue, #00498e)' 
          }}>
            Şehir Takip
          </span>
          <span style={{ color: 'var(--syp-text-dim, #94a3b8)' }}>/</span>
          <span style={{ 
            fontSize: '0.85rem', 
            fontWeight: '600', 
            color: 'var(--syp-text-muted, #64748b)' 
          }}>
            Güncel Veri • {dateLabel}
          </span>
        </div>
      </div>

      {/* RIGHT SECTION: Controls & User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        {/* Clock */}
        <div style={{
          fontSize: '1.15rem',
          fontWeight: '700',
          color: 'var(--syp-text-main, #0f172a)',
          fontVariantNumeric: 'tabular-nums'
        }}>
          {timeLabel}
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--syp-text-muted, #64748b)',
            cursor: 'pointer',
            padding: '0.4rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'background 0.2s, color 0.2s'
          }}
          title={theme === 'dark' ? 'Açık Moda Geç' : 'Koyu Moda Geç'}
        >
          {theme === 'dark' ? (
            <SunIcon width={22} height={22} />
          ) : (
            <MoonIcon width={22} height={22} />
          )}
        </button>

        {/* Live Badge */}
        {!isSplashPage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '0.3rem 0.75rem',
            borderRadius: '20px',
            color: '#059669',
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#10b981',
              borderRadius: '50%',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)'
            }} />
            <span style={{ fontSize: '0.75rem', fontWeight: '800', letterSpacing: '0.5px' }}>
              CANLI
            </span>
          </div>
        )}

        {/* Logout Button */}
        {onLogout && !isLoginPage && (
          <button
            type="button"
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'transparent',
              border: '1px solid var(--color-danger, #dc2626)',
              color: 'var(--color-danger, #dc2626)',
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <span>Çıkış</span>
            <ArrowRightOnRectangleIcon width={16} height={16} />
          </button>
        )}
      </div>
    </header>
  );
}
