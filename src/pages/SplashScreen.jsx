import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/premium.css';
export default function SplashScreen() {
  const navigate = useNavigate();
  useEffect(() => { const timeout = setTimeout(() => navigate('/login', { replace: true }), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650); return () => clearTimeout(timeout); }, [navigate]);
  return <main className="syp-welcome" aria-label="Saha Yönetim Paneli"><span className="syp-welcome-mark">SYP</span><h1>Saha Yönetim Paneli</h1><p>İstanbul için ortak bir görünüm.</p><span role="status" className="syp-welcome-progress">Giriş ekranı açılıyor…</span></main>;
}
