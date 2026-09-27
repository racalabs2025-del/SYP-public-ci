import { Component, lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { onIdTokenChanged } from 'firebase/auth';
import './styles/activeShell.css';
import { SypCircularLoader } from './components/shared/SypCircularLogo';
import { auth } from './firebaseAuth';
import { PanelAccessContext } from './hooks/usePanelAccess';
import { permissionsForRole } from './utils/permissions.js';
import { resolveUserAuthorization, signOutSession } from './service/authService.js';
import UnauthorizedScreen from './pages/UnauthorizedScreen';
import AppLayout from './components/layout/AppLayout';

function safeLazy(importFn) {
  return lazy(async () => {
    try {
      const module = await importFn();
      sessionStorage.removeItem('syp_chunk_reload_attempt');
      return module;
    } catch (error) {
      console.error('Lazy chunk load failed:', error);
      const chunkReloadKey = 'syp_chunk_reload_attempt';
      const hasReloaded = sessionStorage.getItem(chunkReloadKey);
      if (!hasReloaded) {
        sessionStorage.setItem(chunkReloadKey, 'true');
        window.location.reload();
      }
      throw error;
    }
  });
}

const CommandCenterScreen = safeLazy(() => import('./pages/CommandCenterScreen'));
const SolutionPointsScreen = safeLazy(() => import('./pages/SolutionPointsScreen.jsx'));
const CommandCenterProvider = safeLazy(() => import('./context/CommandCenterContext.jsx'));
const LoginScreen = safeLazy(() => import('./pages/LoginScreen'));
const SplashScreen = safeLazy(() => import('./pages/SplashScreen'));

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Sistem Hatası Yakalandı:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page" style={{ padding: '2rem', textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '2rem', background: '#1e293b', color: '#f8fafc', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '1rem', color: '#f43f5e' }}>Arayüz Yükleme Hatası</h2>
            <p style={{ fontSize: '0.95rem', color: '#94a3b8', marginBottom: '1.5rem', wordBreak: 'break-word', lineHeight: '1.5' }}>
              Uygulama arayüzü yüklenemedi. Sayfayı yenileyin; sorun sürerse panel yöneticinize bildirin.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteLoading() {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <SypCircularLoader text="Sayfa hazırlanıyor..." size="md" />
    </div>
  );
}

function NavigationGuard({ authenticated }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    function handlePopState() {
      if (!authenticated && location.pathname !== '/login' && location.pathname !== '/splash') {
        navigate('/login', { replace: true });
      }
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [authenticated, location.pathname, navigate]);

  return null;
}

function ProtectedRoute({ authState, onLogout, children, requiredRole = null }) {
  const { authReady, authenticated, authorized, role, user } = authState;

  if (!authReady) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <SypCircularLoader text="Oturum doğrulanıyor..." size="md" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!authorized || !role) {
    return <UnauthorizedScreen user={user} onLogout={onLogout} />;
  }

  if (requiredRole && role !== requiredRole && role !== 'admin') {
    return <UnauthorizedScreen user={user} onLogout={onLogout} requiredRole={requiredRole} />;
  }

  return children;
}

function PublicRoute({ authState, children }) {
  const { authReady, authenticated } = authState;

  if (!authReady) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <SypCircularLoader text="Oturum kontrol ediliyor..." size="md" />
      </div>
    );
  }

  if (authenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  const [authState, setAuthState] = useState({
    authReady: false,
    authenticated: false,
    authorized: false,
    user: null,
    role: null,
    authError: null,
  });

  const { authenticated, role, user } = authState;

  useEffect(() => {
    let revision = 0;
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      const currentRevision = ++revision;
      
      if (!firebaseUser) {
        if (currentRevision === revision) {
          setAuthState({
            authReady: true,
            authenticated: false,
            authorized: false,
            user: null,
            role: null,
            authError: null,
          });
        }
        return;
      }

      try {
        const authResult = await resolveUserAuthorization(null, firebaseUser);
        if (currentRevision === revision) {
          setAuthState({
            authReady: true,
            authenticated: true,
            authorized: authResult.authorized,
            user: authResult.user || { uid: firebaseUser.uid, email: firebaseUser.email },
            role: authResult.role,
            authError: null,
          });
        }
      } catch (err) {
        if (currentRevision === revision) {
          setAuthState({
            authReady: true,
            authenticated: true,
            authorized: false,
            user: { uid: firebaseUser.uid, email: firebaseUser.email },
            role: null,
            authError: err?.message || 'Yetkilendirme doğrulanamadı.',
          });
        }
      }
    });

    return () => {
      revision++;
      unsubscribe();
    };
  }, []);

  async function handleLogout() {
    sessionStorage.removeItem('dev_bypass');
    await signOutSession(auth);
  }

  return (
    <PanelAccessContext.Provider value={{ role, user, ...permissionsForRole(role, user?.unitId) }}>
    <ErrorBoundary>
      <NavigationGuard authenticated={authenticated} />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route element={<ProtectedRoute authState={authState} onLogout={handleLogout}><CommandCenterProvider key={`${user?.uid}:${role}:${user?.unitId || ''}`}><AppLayout onLogout={handleLogout} /></CommandCenterProvider></ProtectedRoute>}>
            <Route path="/" element={<CommandCenterScreen mode="city" />} />
            <Route path="/ilce-operasyonlari" element={<CommandCenterScreen mode="city" />} />
            <Route path="/dashboard" element={<CommandCenterScreen mode="city" />} />
            <Route path="/operasyon-haritasi" element={<CommandCenterScreen mode="city" />} />
            <Route path="/saha-akisi" element={<CommandCenterScreen mode="fieldUpdates" />} />
            <Route path="/ilce/:ilceSlug" element={<CommandCenterScreen mode="district" />} />
            <Route path="/ilce/:ilceSlug/mahalle/:mahalleSlug" element={<CommandCenterScreen mode="neighborhood" />} />
            <Route path="/mahalle/:mahalleSlug" element={<CommandCenterScreen mode="neighborhood" />} />
            <Route path="/birimler" element={<CommandCenterScreen mode="units" />} />
            <Route path="/birim/:birimId" element={<CommandCenterScreen mode="unit" />} />
            <Route path="/meydan-yonetimi" element={<CommandCenterScreen mode="unit" />} />
            <Route path="/yerinde-cozum" element={<CommandCenterScreen mode="unit" />} />
            <Route path="/saha-hizmetleri" element={<CommandCenterScreen mode="unit" />} />
            <Route path="/cozum-noktalari" element={<CommandCenterScreen mode="unit" />} />
            <Route path="/cozum-noktalari/noktalar" element={<SolutionPointsScreen />} />
            <Route path="/cozum-noktalari/noktalar/:pointId" element={<SolutionPointsScreen />} />
            <Route path="/meydan/:id" element={<CommandCenterScreen mode="square" />} />
            <Route path="/meydan/:id/not" element={<CommandCenterScreen mode="square" />} />
            <Route path="/birim/:birimId/personel/:personelId" element={<CommandCenterScreen mode="person" />} />
            <Route path="/birim/:birimId/personel" element={<CommandCenterScreen mode="personnel" />} />
            <Route path="/personel/detay/:personelId" element={<CommandCenterScreen mode="person" />} />
            <Route path="/personel/:personelAdi" element={<CommandCenterScreen mode="person" />} />
            <Route path="/takip-edilen-isler" element={<CommandCenterScreen mode="tasks" />} />
            <Route path="/raporlar" element={<CommandCenterScreen mode="reports" />} />
            <Route path="/asistan" element={<CommandCenterScreen mode="assistant" />} />
            <Route path="/veri-yukleme" element={<CommandCenterScreen mode="import" />} />
            <Route path="/ayarlar" element={<CommandCenterScreen mode="settings" />} />
            <Route path="/kilavuz" element={<CommandCenterScreen mode="guide" />} />
            <Route path="/sss" element={<CommandCenterScreen mode="faq" />} />
          </Route>
          <Route path="/splash" element={<PublicRoute authState={authState}><SplashScreen /></PublicRoute>} />
          <Route path="/login" element={<PublicRoute authState={authState}><LoginScreen /></PublicRoute>} />
          <Route path="/unauthorized" element={<UnauthorizedScreen user={user} onLogout={handleLogout} />} />
          <Route path="/settings" element={<Navigate to="/ayarlar" replace />} />
          <Route path="/nasil-kullanilir" element={<Navigate to="/kilavuz" replace />} />
          <Route path="/yardim" element={<Navigate to="/sss" replace />} />
          <Route path="/veri-yonetimi" element={<Navigate to="/veri-yukleme" replace />} />
          <Route path="/personel" element={<Navigate to="/meydan-yonetimi" replace />} />
          <Route path="/ust-yonetim-gundemi" element={<Navigate to="/takip-edilen-isler" replace />} />
          <Route path="/saha-yonetimi" element={<Navigate to="/veri-yukleme" replace />} />
          <Route path="/saha-yonetim-konsolu" element={<Navigate to="/veri-yukleme" replace />} />
          <Route path="/yonetim-konsolu" element={<Navigate to="/veri-yukleme" replace />} />
          <Route path="*" element={<Navigate to={authenticated ? '/' : '/splash'} replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
    </PanelAccessContext.Provider>
  );
}

import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppRoutes />
      </Router>
    </ThemeProvider>
  );
}
