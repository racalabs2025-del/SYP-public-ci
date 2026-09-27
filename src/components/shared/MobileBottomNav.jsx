import { Link, NavLink, useLocation } from 'react-router-dom';
import { MapIcon, MapPinIcon, BriefcaseIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { navigationSearch } from '../../domain/commandCenter.js';
import './MobileBottomNav.css';

const CITY_PATHS = ['/', '/ilce-operasyonlari', '/dashboard', '/operasyon-haritasi'];
const LINKS = [
  { path: '/birimler', label: 'Birimler', icon: MapPinIcon },
  { path: '/takip-edilen-isler', label: 'İşler', icon: BriefcaseIcon },
  { path: '/raporlar', label: 'Raporlar', icon: ChartBarIcon },
];

export default function MobileBottomNav({ isInert = false }) {
  const location = useLocation();
  const search = navigationSearch(location.pathname, location.search);
  const isCityActive = CITY_PATHS.includes(location.pathname)
    || location.pathname.startsWith('/ilce/')
    || location.pathname.startsWith('/mahalle/');

  return (
    <nav className="cc-mobile-nav" aria-label="Mobil ana menü" inert={isInert || undefined} aria-hidden={isInert || undefined}>
      <Link to={`/ilce-operasyonlari${search}`} aria-current={isCityActive ? 'page' : undefined}>
        <MapIcon aria-hidden="true" />
        <span>Şehir</span>
      </Link>
      {LINKS.map(({ path, label, icon: Icon }) => (
        <NavLink key={path} to={`${path}${search}`}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
