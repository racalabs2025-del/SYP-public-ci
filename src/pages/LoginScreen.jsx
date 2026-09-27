import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, EyeIcon, EyeSlashIcon, SunIcon, MoonIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { signInPanel } from '../auth';
import { useTheme } from '../context/themeState.js';
import { UNITS } from '../domain/commandCenter.js';
import '../styles/premium.css';

export default function LoginScreen() {
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  async function handleLogin(event) {
    event.preventDefault(); if (loading) return;
    setError(''); setLoading(true);
    try { await signInPanel(email, password); navigate('/', { replace: true }); }
    catch (err) { setError(err.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.'); }
    finally { setLoading(false); }
  }
  return <main className="syp-login">
    <header className="syp-login-header"><a href="/login" className="syp-wordmark"><span>SYP</span><div>Saha Yönetim Paneli<small>İstanbul Büyükşehir Belediyesi</small></div></a><button className="syp-theme-button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</button></header>
    <div className="syp-login-layout">
      <section className="syp-login-scene" aria-label="İstanbul saha yönetimi"><img src="/login-scenes/optimized/istanbul-1.webp" alt="İstanbul şehir manzarası" fetchPriority="high" /><div className="syp-login-scene-content"><span className="syp-login-kicker">İSTANBUL İÇİN, BİRLİKTE.</span><h1>Sahanın tamamı.<br />Tek bir bakışta.</h1><p>Ekipler, görevler ve çalışmalar.<br />Şehrin her noktasında ortak bir görünüm.</p><div className="syp-login-units">{Object.entries(UNITS).map(([id, name]) => <span key={id}>{name}</span>)}</div></div></section>
      <section className="syp-login-form-panel" aria-labelledby="login-title"><div className="syp-login-form-inner"><span className="syp-login-symbol"><LockClosedIcon /></span><p className="syp-login-overline">SAHA KOMUTA MERKEZİ</p><h2 id="login-title">Hoş geldiniz.</h2><p className="syp-login-intro">Çalışma alanınıza güvenli giriş yapın.</p>
        <form onSubmit={handleLogin} className="syp-login-form"><label htmlFor="panel-email-input">E-posta adresi<input id="panel-email-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad@kurum.gov.tr" required disabled={loading} /></label>
          <label htmlFor="panel-password-input">Parola<div className="syp-password-input"><input id="panel-password-input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}>{showPassword ? <EyeSlashIcon /> : <EyeIcon />}</button></div></label>
          {error && <p role="alert" className="syp-login-error">{error}</p>}
          <button type="submit" className="syp-login-submit" disabled={loading}>{loading ? 'Giriş yapılıyor…' : 'Çalışma alanını aç'}<ArrowRightIcon /></button>
        </form><p className="syp-login-help">Erişim yetkiniz veya hesabınızla ilgili destek için panel yöneticinizle iletişime geçin.</p></div><footer>SYP · Halkla İlişkiler · Yetkili personel erişimi</footer></section>
    </div>
  </main>;
}
