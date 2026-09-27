import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bars3Icon } from '@heroicons/react/24/outline';
import AppSidebar from './AppSidebar';
import MobileBottomNav from '../shared/MobileBottomNav';
import './AppLayout.css';

/**
 * Tüm operasyonel ekranlar için evrensel ana düzen (Master Shell)
 * Sol menüyü sabit tutar ve içerik alanını standart kurumsal formatta sunar.
 */
export default function AppLayout({ onLogout }) {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const [openMenu, setOpenMenu] = useState(null);
  const contentRef = useRef(null);
  const previousPathRef = useRef(location.pathname);
  const closeSidebar = useCallback(() => setOpenMenu(null), []);
  const isSidebarOpen = isMobile && openMenu?.pathname === location.pathname;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const handleChange = (event) => {
      setIsMobile(event.matches);
      closeSidebar();
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [closeSidebar]);

  useEffect(() => {
    if (!isSidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isSidebarOpen]);

  // Yalnız içerik solar; Outlet ve içindeki form/harita durumları korunur.
  useEffect(() => {
    if (previousPathRef.current === location.pathname) return undefined;
    previousPathRef.current = location.pathname;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const animation = contentRef.current?.animate?.(
      [{ opacity: 0.55 }, { opacity: 1 }],
      { duration: 200, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    );
    return () => animation?.cancel();
  }, [location.pathname]);

  return (
    <div className="syp-desktop-dashboard">
      {/* Mobil Cihazlar İçin Üst Bar (Sadece dar ekranlarda görünür) */}
      <div className="syp-mobile-header">
        <div className="syp-mobile-header__brand">
          <div className="syp-mobile-header__logo">SYP</div>
          <span className="syp-mobile-header__title">Saha Yönetim</span>
        </div>
        <button 
          type="button"
          className="syp-mobile-header__menu-btn"
          onClick={() => setOpenMenu({ pathname: location.pathname })}
          aria-label="Menüyü Aç"
          aria-expanded={isSidebarOpen}
          aria-controls="syp-main-navigation"
        >
          <Bars3Icon width={24} height={24} />
        </button>
      </div>

      <AppSidebar 
        onLogout={onLogout} 
        isOpen={isSidebarOpen} 
        isMobile={isMobile}
        onClose={closeSidebar}
      />
      
      {/* Mobil menü açıkken arkaplanı karartan katman */}
      {isSidebarOpen && (
        <div 
          className="syp-sidebar-overlay" 
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <div ref={contentRef} className="syp-main-content" inert={isSidebarOpen || undefined}>
        <Outlet />
      </div>
      <MobileBottomNav isInert={isSidebarOpen} />
    </div>
  );
}
