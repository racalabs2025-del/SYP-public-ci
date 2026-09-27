import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MapIcon,
  MapPinIcon,
  BriefcaseIcon,
  ShieldCheckIcon,
  UsersIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '../../context/themeState.js';
import { usePanelAccess } from '../../hooks/usePanelAccess';
import { useEscapeHandler } from '../../hooks/useEscapeHandler';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './AppSidebar.css';
import { navigationSearch, normalizeText, UNITS } from '../../domain/commandCenter.js';
import { ISTANBUL_DISTRICTS_DATA } from '../../data/istanbulDistrictsData.js';
import { ALL_ISTANBUL_NEIGHBORHOODS } from '../../data/istanbulNeighborhoodsData.js';

const NAV_ITEMS = [
  { key: 'sehir-takip', label: 'Şehir Takip', path: '/ilce-operasyonlari', matchPaths: ['/', '/ilce-operasyonlari', '/dashboard', '/operasyon-haritasi'], matchPrefixes: ['/ilce/', '/mahalle/'], icon: MapIcon },
  { key: 'saha-akisi', label: 'Saha Akışı', path: '/saha-akisi', matchPaths: ['/saha-akisi'], icon: ChartBarIcon },
  { key: 'meydan-yonetimi', label: UNITS.MEYDAN, unitId: 'MEYDAN', path: '/meydan-yonetimi', matchPaths: ['/meydan-yonetimi'], matchPrefixes: ['/meydan/', '/birim/MEYDAN/'], icon: MapPinIcon, children: [{ key: 'meydan-avrupa', label: 'AVRUPA YAKASI MEYDANLARI', path: '/meydan-yonetimi?subunit=avrupa' }, { key: 'meydan-anadolu', label: 'ANADOLU YAKASI MEYDANLARI', path: '/meydan-yonetimi?subunit=anadolu' }, { key: 'meydanlar', label: 'TÜM MEYDANLAR', path: '/meydan-yonetimi' }, { key: 'meydan-personel', label: 'PERSONEL', path: '/birim/MEYDAN/personel' }] },
  { key: 'yerinde-cozum', label: UNITS.YERINDE_COZUM, unitId: 'YERINDE_COZUM', path: '/yerinde-cozum', matchPaths: ['/yerinde-cozum'], matchPrefixes: ['/birim/YERINDE_COZUM/'], icon: BriefcaseIcon, children: [{ key: 'yerinde-avrupa', label: 'AVRUPA EKİPLERİ', path: '/birim/YERINDE_COZUM/personel?subunit=avrupa' }, { key: 'yerinde-anadolu', label: 'ANADOLU EKİPLERİ', path: '/birim/YERINDE_COZUM/personel?subunit=anadolu' }, { key: 'yerinde-personel', label: 'TÜM PERSONEL', path: '/birim/YERINDE_COZUM/personel' }] },
  { key: 'saha-hizmetleri', label: UNITS.SAHA_HIZMETLERI, unitId: 'SAHA_HIZMETLERI', path: '/saha-hizmetleri', matchPaths: ['/saha-hizmetleri'], matchPrefixes: ['/birim/SAHA_HIZMETLERI/'], icon: ShieldCheckIcon, children: [{ key: 'saha-kampuste', label: 'KAMPÜSTE ÇÖZÜM BİRİMİ', path: '/birim/SAHA_HIZMETLERI/personel?subunit=kampuste' }, { key: 'saha-mahallede', label: 'MAHALLEDE ÇÖZÜM BİRİMİ', path: '/birim/SAHA_HIZMETLERI/personel?subunit=mahallede' }, { key: 'saha-kamuoyu', label: 'KAMUOYU ARAŞTIRMALARI VE YERİNDE BİLGİLENDİRME BİRİMİ', path: '/birim/SAHA_HIZMETLERI/personel?subunit=kamuoyu' }, { key: 'saha-bolge-1', label: '1. BÖLGE', path: '/birim/SAHA_HIZMETLERI/personel?subunit=bolge-1' }, { key: 'saha-bolge-2', label: '2. BÖLGE', path: '/birim/SAHA_HIZMETLERI/personel?subunit=bolge-2' }, { key: 'saha-bolge-3', label: '3. BÖLGE', path: '/birim/SAHA_HIZMETLERI/personel?subunit=bolge-3' }, { key: 'saha-personel', label: 'TÜM PERSONEL', path: '/birim/SAHA_HIZMETLERI/personel' }] },
  { key: 'cozum-noktalari', label: UNITS.COZUM_NOKTALARI, unitId: 'COZUM_NOKTALARI', path: '/cozum-noktalari', matchPaths: ['/cozum-noktalari'], matchPrefixes: ['/cozum-noktalari/', '/birim/COZUM_NOKTALARI/'], icon: BuildingOffice2Icon, children: [{ key: 'cozum-noktalari-listesi', label: 'NOKTALAR', path: '/cozum-noktalari/noktalar?kind=nokta' }, { key: 'cozum-noktalari-subeler', label: 'ŞUBELER', path: '/cozum-noktalari/noktalar?kind=sube' }, { key: 'cozum-noktalari-avm', label: 'AVM’LER', path: '/cozum-noktalari/noktalar?kind=avm' }, { key: 'cozum-noktalari-nokta-personel', label: 'NOKTA PERSONELİ', path: '/birim/COZUM_NOKTALARI/personel?subunit=nokta' }, { key: 'cozum-noktalari-sube-personel', label: 'ŞUBE PERSONELİ', path: '/birim/COZUM_NOKTALARI/personel?subunit=sube' }, { key: 'cozum-noktalari-avm-personel', label: 'AVM PERSONELİ', path: '/birim/COZUM_NOKTALARI/personel?subunit=avm' }] },
  { key: 'takip', label: 'Takip Edilen İşler', path: '/takip-edilen-isler', matchPaths: ['/takip-edilen-isler'], icon: BriefcaseIcon },
  { key: 'raporlar', label: 'Raporlar', path: '/raporlar', matchPaths: ['/raporlar'], icon: ChartBarIcon },
  { key: 'asistan', label: 'Saha Asistanı', path: '/asistan', matchPaths: ['/asistan'], icon: ShieldCheckIcon },
  { key: 'veri-yukleme', label: 'Veri Yükleme', path: '/veri-yukleme', matchPaths: ['/veri-yukleme'], icon: BriefcaseIcon, roles: ['admin', 'data_entry'] },
];

// Sorted districts for sidebar list
const SORTED_DISTRICTS = [...ISTANBUL_DISTRICTS_DATA].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

export default function AppSidebar({ onLogout = null, activeKey = null, isOpen = false, isMobile = false, onClose = () => {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const search = navigationSearch(location.pathname, location.search);
  const { user, role } = usePanelAccess();
  const { theme, toggleTheme } = useTheme();
  const sidebarRef = useRef(null);
  const isDrawerOpen = isMobile && isOpen;
  useEscapeHandler(isDrawerOpen, onClose);
  useFocusTrap(isDrawerOpen, sidebarRef);

  // İlçeler bölümü state
  const [districtsOpen, setDistrictsOpen] = useState(false);
  const [districtSearch, setDistrictSearch] = useState('');

  const goTo = (path) => {
    const target = new URL(path, window.location.origin);
    target.searchParams.delete('record');
    if (['/', '/ilce-operasyonlari', '/meydan-yonetimi', '/yerinde-cozum', '/saha-hizmetleri', '/cozum-noktalari'].includes(target.pathname) || target.pathname.startsWith('/birim/')) {
      for (const key of ['unit', 'district', 'neighborhood', 'tab']) target.searchParams.delete(key);
    }
    navigate(target.pathname + target.search);
    onClose();
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Kullanıcı';
  const roleLabel = ({ admin: 'Admin', manager: 'Yönetici', data_entry: 'Veri Giriş Personeli', chief: 'Şef', viewer: 'İzleyici' })[role] || 'Kullanıcı';
  const avatarInitials = (displayName || 'K').slice(0, 2).toUpperCase();

  // Active district from URL
  const activeDistrictId = location.pathname.match(/^\/ilce\/([^/]+)/)?.[1] || '';
  const activeNeighborhoodSlug = location.pathname.match(/^\/ilce\/[^/]+\/mahalle\/([^/]+)/)?.[1] || '';

  const isItemActive = (item) => {
    if (activeKey) return activeKey === item.key;
    if (item.matchPaths.includes(location.pathname)) return true;
    if (item.matchPrefixes?.some((prefix) => location.pathname.startsWith(prefix))) return true;
    return false;
  };

  // Filter districts by search
  const filteredDistricts = districtSearch
    ? SORTED_DISTRICTS.filter((d) => normalizeText(d.name).includes(normalizeText(districtSearch)))
    : SORTED_DISTRICTS;

  // Get neighborhoods for active district
  const activeNeighborhoods = activeDistrictId
    ? ALL_ISTANBUL_NEIGHBORHOODS.filter((n) => n.districtId === activeDistrictId).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    : [];

  return (
    <aside 
      ref={sidebarRef}
      id="syp-main-navigation"
      className={`syp-sidebar ${isOpen ? 'is-open' : ''}`} 
      aria-label="Ana Gezinme Menüsü"
      role={isDrawerOpen ? 'dialog' : undefined}
      aria-modal={isDrawerOpen || undefined}
      aria-hidden={isMobile && !isOpen ? true : undefined}
      inert={(isMobile && !isOpen) || undefined}
    >
      <div className="syp-sidebar__top">
        {/* Mobil Kapatma Butonu */}
        <button 
          type="button"
          className="syp-sidebar__mobile-close" 
          onClick={onClose}
          aria-label="Menüyü Kapat"
        >
          <XMarkIcon width={24} height={24} />
        </button>

        {/* SYP Kurumsal Marka Rozeti */}
        <button
          type="button"
          className="syp-sidebar__brand"
          onClick={() => goTo(`/ilce-operasyonlari${search}`)}
          title="Şehir Takip Ana Ekranına Git"
        >
          <span className="syp-sidebar__logo-badge">SYP</span>
          <span className="syp-sidebar__brand-text">
            <span className="syp-sidebar__brand-title">SYP</span>
            <span className="syp-sidebar__brand-sub">Saha Yönetim Paneli</span>
          </span>
        </button>

        {/* Ana Navigasyon Öğeleri */}
        <nav className="syp-sidebar__nav" aria-label="Operasyonel Modüller">
          {NAV_ITEMS.filter((item) => (!item.adminOnly || role === 'admin') && (!item.roles || item.roles.includes(role)) && (role !== 'chief' || !item.unitId || item.unitId === user?.unitId)).map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item);
            
            // Dinamik alt sekmeler
            let dynamicChildren = [...(item.children || [])];
            if (active && item.key === 'sehir-takip' && location.pathname.startsWith('/ilce/')) {
              const parts = location.pathname.split('/');
              const ilceSlug = parts[2];
              if (ilceSlug) {
                const districtData = ISTANBUL_DISTRICTS_DATA.find((d) => d.id === ilceSlug);
                dynamicChildren.push({ key: `dyn-ilce-${ilceSlug}`, label: (districtData?.name || ilceSlug).toUpperCase() + ' İLÇESİ', path: `/ilce/${ilceSlug}` });
                if (parts[3] === 'mahalle' && parts[4]) {
                  const nhData = ALL_ISTANBUL_NEIGHBORHOODS.find((n) => n.slug === parts[4] || n.id === parts[4]);
                  dynamicChildren.push({ key: `dyn-mah-${parts[4]}`, label: (nhData?.name || parts[4]).toUpperCase() + ' MAH.', path: `/ilce/${ilceSlug}/mahalle/${parts[4]}` });
                }
              }
            } else if (active && item.key === 'personel' && location.pathname.startsWith('/personel/detay/')) {
              dynamicChildren.push({ key: 'dyn-pers-detay', label: 'PERSONEL DETAYI', path: location.pathname });
            }

            return (
              <div key={item.key} className="syp-sidebar__nav-group">
                <button
                  type="button"
                  className={`syp-sidebar__link ${active ? 'is-active' : ''}`}
                  onClick={() => goTo(`${item.path}${search}`)}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  aria-expanded={dynamicChildren.length > 0 ? active : undefined}
                  aria-controls={active && dynamicChildren.length > 0 ? `subnav-${item.key}` : undefined}
                >
                  <Icon className="syp-sidebar__icon" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
                
                {active && dynamicChildren.length > 0 && (
                  <div 
                    id={`subnav-${item.key}`} 
                    className="syp-sidebar__subnav"
                    role="region"
                    aria-label={`${item.label} Alt Menüsü`}
                  >
                    {dynamicChildren.map(child => {
                      const isChildActive = location.pathname === child.path || (location.search && child.path.includes(location.search));
                      return (
                        <button
                          key={child.key}
                          type="button"
                          className={`syp-sidebar__sublink ${isChildActive ? 'is-active' : ''}`}
                          onClick={() => goTo(child.path)}
                          aria-current={isChildActive ? 'page' : undefined}
                        >
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ─── İlçeler / Mahalleler Collapsible Bölümü ─── */}
        <div className="syp-sidebar__section">
          <button
            type="button"
            className={`syp-sidebar__section-toggle ${districtsOpen ? 'is-open' : ''}`}
            onClick={() => setDistrictsOpen(!districtsOpen)}
            aria-expanded={districtsOpen}
            aria-controls="sidebar-districts"
          >
            <MapPinIcon className="syp-sidebar__icon" aria-hidden="true" />
            <span>İlçeler</span>
            <span className="syp-sidebar__district-count">{ISTANBUL_DISTRICTS_DATA.length}</span>
            <ChevronDownIcon className="syp-sidebar__chevron" aria-hidden="true" />
          </button>

          {districtsOpen && (
            <div id="sidebar-districts" className="syp-sidebar__districts" role="region" aria-label="İlçe Listesi">
              <div className="syp-sidebar__district-search">
                <MagnifyingGlassIcon className="syp-sidebar__search-icon" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="İlçe ara..."
                  value={districtSearch}
                  onChange={(e) => setDistrictSearch(e.target.value)}
                  className="syp-sidebar__search-input"
                  aria-label="İlçe ara"
                />
              </div>
              <div className="syp-sidebar__district-list">
                {filteredDistricts.map((d) => {
                  const isActive = activeDistrictId === d.id;
                  return (
                    <div key={d.id} className="syp-sidebar__district-item">
                      <button
                        type="button"
                        className={`syp-sidebar__district-btn ${isActive ? 'is-active' : ''}`}
                        onClick={() => goTo(`/ilce/${d.id}${search}`)}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span className={`syp-sidebar__yaka-dot ${d.yaka === 'anadolu' ? 'is-anadolu' : 'is-avrupa'}`} />
                        <span>{d.name}</span>
                      </button>
                      {/* Seçili ilçenin mahalleleri */}
                      {isActive && activeNeighborhoods.length > 0 && (
                        <div className="syp-sidebar__neighborhoods">
                          {activeNeighborhoods.slice(0, 20).map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              className={`syp-sidebar__neighborhood-btn ${activeNeighborhoodSlug === n.slug || activeNeighborhoodSlug === n.id ? 'is-active' : ''}`}
                              onClick={() => goTo(`/ilce/${d.id}/mahalle/${n.slug}${search}`)}
                            >
                              {n.name}
                            </button>
                          ))}
                          {activeNeighborhoods.length > 20 && (
                            <span className="syp-sidebar__more-label">+{activeNeighborhoods.length - 20} mahalle daha</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredDistricts.length === 0 && (
                  <p className="syp-sidebar__empty">Eşleşen ilçe bulunamadı.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Alt Kullanıcı ve Sistem Alanı */}
      <div className="syp-sidebar__footer">
        {/* SSS ve Kılavuz Bağlantıları */}
        <div className="syp-sidebar__help-links">
          <button
            type="button"
            className={`syp-sidebar__help-btn ${location.pathname === '/kilavuz' ? 'is-active' : ''}`}
            onClick={() => goTo('/kilavuz')}
            title="Panel Nasıl Kullanılır?"
          >
            <BookOpenIcon className="syp-sidebar__help-icon" aria-hidden="true" />
            <span>Kullanım Kılavuzu</span>
          </button>
          <button
            type="button"
            className={`syp-sidebar__help-btn ${location.pathname === '/sss' ? 'is-active' : ''}`}
            onClick={() => goTo('/sss')}
            title="Sık Sorulan Sorular"
          >
            <QuestionMarkCircleIcon className="syp-sidebar__help-icon" aria-hidden="true" />
            <span>Sık Sorulan Sorular</span>
          </button>
        </div>

        <div className="syp-sidebar__quick-actions">
          {role === 'admin' && <button
            type="button"
            className={`syp-sidebar__link syp-sidebar__settings-btn ${location.pathname === '/ayarlar' || activeKey === 'ayarlar' ? 'is-active' : ''}`}
            onClick={() => goTo('/ayarlar')}
            aria-current={location.pathname === '/ayarlar' || activeKey === 'ayarlar' ? 'page' : undefined}
            title="Sistem Ayarları ve Veri Yönetimi"
          >
            <Cog6ToothIcon className="syp-sidebar__icon" aria-hidden="true" />
            <span>Ayarlar</span>
          </button>}

          <button
            type="button"
            className="syp-sidebar__theme-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
            aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
          >
            {theme === 'dark' ? (
              <SunIcon className="syp-sidebar__theme-icon" />
            ) : (
              <MoonIcon className="syp-sidebar__theme-icon" />
            )}
          </button>
        </div>

        {/* Oturum Sahibi Profil Kartı */}
        <div className="syp-sidebar__user">
          <div className="syp-sidebar__avatar" aria-hidden="true">
            {avatarInitials}
          </div>
          <div className="syp-sidebar__user-info">
            <span className="syp-sidebar__user-name" title={displayName}>
              {displayName}
            </span>
            <span className="syp-sidebar__user-role">{roleLabel}</span>
          </div>

          {onLogout && (
            <button
              type="button"
              className="syp-sidebar__logout-mini-btn"
              onClick={onLogout}
              title="Güvenli Çıkış Yap"
              aria-label="Çıkış Yap"
            >
              <ArrowRightOnRectangleIcon width={16} height={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
