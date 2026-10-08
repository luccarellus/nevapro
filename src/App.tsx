/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Navigation from './components/Navigation';
import Header from './components/Header';
import CookieBanner from './components/CookieBanner';
import Maintenance from './components/Maintenance';
import { UserProfile } from './types';
import { PenTool, Sparkles } from 'lucide-react';
import { userService } from './services/userService';
import { initConsentMode } from './lib/consentManager';
import { invalidateRequestCache, prefetchEndpoint } from './lib/requestCache';
import { csrfHeaders, request } from './lib/apiService';
import { calculateLevelAndProgression } from './utils/xpUtils';
import { getSession, saveSession, clearSession } from './lib/sessionStorage';

import Spinner from './components/Spinner';

// Lazy-loaded route components (code splitting)
const Dashboard = lazy(() => import('./components/Dashboard'));
const Questions = lazy(() => import('./components/Questions'));
const Leaderboard = lazy(() => import('./components/Leaderboard'));
const Calendar = lazy(() => import('./components/Calendar'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const Login = lazy(() => import('./components/Login'));
const Simulados = lazy(() => import('./components/Simulados'));
const Materiais = lazy(() => import('./components/Materiais'));
const Mural = lazy(() => import('./components/Mural'));
const Settings = lazy(() => import('./components/Settings'));
const ErrorsBook = lazy(() => import('./components/ErrorsBook'));
const StudyPlan = lazy(() => import('./components/StudyPlan'));
const Performance = lazy(() => import('./components/Performance'));
const Flashcards = lazy(() => import('./components/Flashcards'));
const Metas = lazy(() => import('./components/Metas'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const CookiePolicy = lazy(() => import('./components/CookiePolicy'));
const ComingSoon = lazy(() => import('./components/ComingSoon'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));

const PageLoading = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Spinner size={36} />
  </div>
);

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('neva_dark_mode') !== 'false');
  const [customTheme, setCustomTheme] = useState<string>(() => localStorage.getItem('neva_custom_theme') || 'default');
  const [user, setUser] = useState<UserProfile>({
    id: 'loading',
    name: 'Carregando...',
    email: '',
    level: 1,
    xp: 0,
    nextLevelXp: 500,
    rank: 0,
    streak: 0,
    role: 'student'
  });
  const [isSimulationActive, setIsSimulationActive] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(
    () => Boolean(getSession()),
  );
  const logoutInFlight = useRef<Promise<void> | null>(null);

  const clearLocalSession = () => {
    clearSession();
    invalidateRequestCache();
    setIsLoggedIn(false);
    setActiveTab('dashboard');
  };

  // Prefetch dados adjacentes ao passar o mouse (somente desktop)
  const handleNavHover = (tabId: string) => {
    if (!isLoggedIn || user.role === 'admin') return;
    // Prefetch dados para destinos prováveis
    const prefetchMap: Record<string, string[]> = {
      'dashboard': ['/api/bootstrap'],
      'questions': ['/api/questoes?year=2024&limit=50&offset=0'],
      'ranking': ['/api/leaderboard'],
      'materiais': ['/api/materials'],
      'errors': ['/api/user/errors'],
      'desempenho': ['/api/performance/tri-scores', '/api/performance/subject-mastery'],
    };
    const urls = prefetchMap[tabId];
    if (urls) {
      urls.forEach(url => prefetchEndpoint(url));
    }
  };

  const handleTabChange = (newTab: string) => {
    if (user.role === 'admin') {
      if (['admin', 'privacidade', 'cookies'].includes(newTab)) {
        setActiveTab(newTab);
      }
      return;
    }
    if (isSimulationActive) {
      setPendingTab(newTab);
    } else {
      setActiveTab(newTab);
    }
  };

  const isUnderMaintenance = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

  useEffect(() => {
    if (isUnderMaintenance) {
      return;
    }

    initConsentMode();

    // Check if user is returning from password reset email (via query params)
    const params = new URLSearchParams(window.location.search);
    if (
      (params.get('token') && params.get('email'))
      || window.location.hash.includes('type=recovery')
    ) {
      setIsResettingPassword(true);
    }
    
    // Recovery session for students
    const savedUser = getSession();
    if (savedUser) {
      try {
        const parsedUser = savedUser as UserProfile;
        // Immediately show cached user data (instant UI), then verify in background
        if (parsedUser.email) {
          setUser(prev => ({ ...prev, ...parsedUser }));
          setIsLoggedIn(true);
          // Verify session + prefetch critical data in parallel (non-blocking)
          Promise.allSettled([
            fetchUser(parsedUser.email),
            prefetchEndpoint('/api/bootstrap'),
            prefetchEndpoint(`/api/notifications?email=${encodeURIComponent(parsedUser.email)}`),
          ]).finally(() => setIsRestoringSession(false));
        } else {
          setIsRestoringSession(false);
        }
      } catch {
        clearLocalSession();
        setIsRestoringSession(false);
      }
    } else {
      setIsRestoringSession(false);
    }
  }, []);

  const handleSelectTenant = (tenantId: string) => {
    localStorage.setItem('neva_active_tenant', tenantId);
    setUser(prev => ({ ...prev, tenantId }));
    invalidateRequestCache();
    prefetchEndpoint('/api/bootstrap');
  };

  const fetchUser = async (email?: string): Promise<boolean> => {
    if (!email) return false;
    try {
      const profile = await userService.getProfile(email);
      if (profile) {
        const { nextLevelXp, currentLevelMinXp } = calculateLevelAndProgression(profile.xp || 0);
        const profileWithNextLevel = { ...profile, nextLevelXp, currentLevelMinXp };
        setUser(prev => ({ ...prev, ...profileWithNextLevel }));
        setIsLoggedIn(true);

        if (profile.tenantId && !localStorage.getItem('neva_active_tenant')) {
          localStorage.setItem('neva_active_tenant', profile.tenantId);
        }

        saveSession(profileWithNextLevel);
        
        if (profile.role === 'admin') {
          setActiveTab('admin');
        }
        return true;
      }
    } catch (error: any) {
      if (error.status === 401) {
        clearLocalSession();
      }
    }
    return false;
  };

  useEffect(() => {
    let activeTheme = customTheme;
    if (!customTheme || customTheme === 'default') {
      activeTheme = isDarkMode ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', activeTheme);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const bgColors: Record<string, string> = {
      'dark': '#060a12',
      'light': '#f8fafc',
      'cyberpunk': isDarkMode ? '#08070d' : '#faf8fc',
      'eighties': isDarkMode ? '#080313' : '#fff3fb',
      'forest': isDarkMode ? '#050806' : '#f4f9f6',
      'dracula': isDarkMode ? '#11111b' : '#eff1f5',
      'neva': isDarkMode ? '#060b0d' : '#f0f8fa',
      'minimalist': isDarkMode ? '#09090b' : '#fafafa',
      'retro': isDarkMode ? '#0c0805' : '#f4ecd8'
    };

    const themeMeta = document.getElementById('theme-color-meta');
    if (themeMeta) {
      themeMeta.setAttribute('content', bgColors[activeTheme] || '#060a12');
    }
  }, [customTheme, isDarkMode]);

  const handleCustomThemeChange = (newTheme: string) => {
    setCustomTheme(newTheme);
    localStorage.setItem('neva_custom_theme', newTheme);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('neva_dark_mode', String(next));
      return next;
    });
  };
  
  const handleLogin = (loggedUser: UserProfile) => {
    invalidateRequestCache();
    
    // Calcula a progressão de nível imediatamente com os dados do login
    const { nextLevelXp, currentLevelMinXp } = calculateLevelAndProgression(loggedUser.xp || 0);
    const userWithProgression: UserProfile = { ...loggedUser, nextLevelXp, currentLevelMinXp };

    setIsLoggedIn(true);
    setUser(userWithProgression);

    if (userWithProgression.tenantId && !localStorage.getItem('neva_active_tenant')) {
      localStorage.setItem('neva_active_tenant', userWithProgression.tenantId);
    }
    
    saveSession(userWithProgression);

    if (loggedUser.role === 'admin') {
      setActiveTab('admin');
    } else {
      setActiveTab('dashboard');
    }

    // Prefetch critical data in background (non-blocking)
    if (loggedUser.email) {
      // Prefetch bootstrap data (dashboard needs this immediately)
      prefetchEndpoint('/api/bootstrap');
      // Prefetch user profile (for session sync)
      prefetchEndpoint(`/api/user/profile?email=${encodeURIComponent(loggedUser.email)}`);
      // Prefetch notifications (shown in header)
      prefetchEndpoint(`/api/notifications?email=${encodeURIComponent(loggedUser.email)}`);
    }
  };

  const performLogout = (): Promise<void> => {
    if (logoutInFlight.current) return logoutInFlight.current;

    logoutInFlight.current = (async () => {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', ...csrfHeaders() },
        });
      } catch (err) {
        console.error('Erro ao fazer logout no servidor:', err);
      } finally {
        clearLocalSession();
        logoutInFlight.current = null;
      }
    })();
    return logoutInFlight.current;
  };

  async function handleLogout() {
    if (isSimulationActive) {
      setPendingTab('logout');
      return;
    }
    await performLogout();
  }

  const handleConfirmExit = async () => {
    setIsSimulationActive(false);
    if (pendingTab) {
      if (pendingTab === 'logout') {
        await performLogout();
      } else {
        setActiveTab(pendingTab);
      }
      setPendingTab(null);
    }
  };

  const handleEarnXp = async (
    amount: number, 
    correctIncrement?: number, 
    answeredIncrement?: number, 
    isFlashQuiz?: boolean,
    activityName?: string
  ) => {
    const currentXp = user.xp || 0;
    const newXp = currentXp + amount;
    
    // Dynamically calculate level and cumulative XP limit
    const { level, nextLevelXp, currentLevelMinXp } = calculateLevelAndProgression(newXp);
    
    // Use explicit increments or default to 0 to avoid contaminating question stats
    const corrInc = correctIncrement !== undefined ? correctIncrement : 0;
    const ansInc = answeredIncrement !== undefined ? answeredIncrement : 0;

    const updatedUser = {
      ...user,
      xp: newXp,
      level: level,
      nextLevelXp: nextLevelXp,
      currentLevelMinXp: currentLevelMinXp,
      correctAnswers: (user.correctAnswers || 0) + corrInc,
      answeredQuestions: (user.answeredQuestions || 0) + ansInc,
      isFlashQuizUpdate: isFlashQuiz,
      xpReason: activityName
    };

    // Update locally
    setUser(updatedUser);
    saveSession(updatedUser);

    // Persist to server
    try {
      if (isFlashQuiz) {
        // Flash quiz: guard atômico no servidor concede o XP fixo uma única vez.
        const res = await userService.updateProfile(updatedUser);
        if (res && res.user) {
          const { nextLevelXp: syncNext, currentLevelMinXp: syncMin } = calculateLevelAndProgression(res.user.xp || 0);
          const syncedUser = { ...res.user, nextLevelXp: syncNext, currentLevelMinXp: syncMin };
          setUser(prev => ({ ...prev, ...syncedUser }));
          saveSession(syncedUser);
        }
      } else {
        // XP e contadores são recalculados pelo servidor a partir das respostas
        // registradas — o cliente nunca envia valores (mass assignment).
        const sync = await request<{ success: boolean; answered: number; correct: number; xp: number; level: number }>(
          '/api/user/progress/sync',
          { method: 'POST', body: {} },
        );
        if (sync && sync.success) {
          const { nextLevelXp: syncNext, currentLevelMinXp: syncMin } = calculateLevelAndProgression(sync.xp || 0);
          const syncedUser = {
            ...updatedUser,
            xp: sync.xp,
            level: sync.level,
            correctAnswers: sync.correct,
            answeredQuestions: sync.answered,
            nextLevelXp: syncNext,
            currentLevelMinXp: syncMin,
          };
          setUser(prev => ({ ...prev, ...syncedUser }));
          saveSession(syncedUser);
        }
      }
    } catch (error) {
      console.error('Failed to sync XP with server:', error);
    }
  };

  const renderContent = () => {
    if (activeTab === 'privacidade') return <PrivacyPolicy onBack={() => handleTabChange(user.role === 'admin' ? 'admin' : 'dashboard')} />;
    if (activeTab === 'cookies') return <CookiePolicy onBack={() => handleTabChange(user.role === 'admin' ? 'admin' : 'dashboard')} />;

    if (isResettingPassword) {
      return <ResetPassword onBack={() => {
        setIsResettingPassword(false);
        // Limpa os query params da URL
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        window.history.replaceState({}, '', url.toString());
      }} />;
    }

    if (isRestoringSession) {
      return <PageLoading />;
    }

    if (!isLoggedIn) {
      return <Login onLogin={handleLogin} onTabChange={handleTabChange} />;
    }

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard user={user} onTabChange={handleTabChange} onEarnXp={handleEarnXp} />;
      case 'questions':
        return <Questions onEarnXp={handleEarnXp} user={user} />;
      case 'simulados':
        return (
          <Simulados 
            onEarnXp={handleEarnXp} 
            user={user} 
            onSimulationActiveChange={setIsSimulationActive}
            pendingTab={pendingTab}
            onCancelExit={() => setPendingTab(null)}
            onConfirmExit={handleConfirmExit}
          />
        );
      case 'errors':
        return <ErrorsBook user={user} onEarnXp={handleEarnXp} />;
      case 'plano_estudos':
        return <StudyPlan user={user} onTabChange={handleTabChange} onEarnXp={handleEarnXp} />;
      case 'desempenho':
        return <Performance user={user} onTabChange={handleTabChange} />;
      case 'flashcards':
        return <Flashcards user={user} />;
      case 'metas':
        return <Metas user={user} onTabChange={handleTabChange} />;
      case 'ranking':
        return <Leaderboard user={user} />;
      case 'materiais':
        return <Materiais />;
      case 'mural':
        return <Mural />;
      case 'calendar':
        return <Calendar />;
      case 'redacao':
        return (
          <ComingSoon 
            title="Redação Inteligente" 
            icon={PenTool} 
            description="Nossa inteligência artificial para correção e feedback de redações está sendo preparada para impulsionar suas notas."
            variant="rose"
          />
        );
      case 'professor_ia':
        return (
          <ComingSoon 
            title="Professor IA" 
            icon={Sparkles} 
            description="Um tutor personalizado disponível 24/7 para tirar dúvidas, explicar matérias e ajudar nos seus estudos."
            variant="indigo"
          />
        );
      case 'admin':
        return isUserAdmin ? (
          <AdminDashboard
            user={user}
            onLogout={handleLogout}
            onUpdateUser={setUser}
            theme={customTheme}
            onThemeChange={handleCustomThemeChange}
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleDarkMode}
          />
        ) : <Dashboard user={user} onEarnXp={handleEarnXp} />;
      case 'profile':
        return (
          <Settings 
            user={user} 
            onUpdateUser={setUser} 
            onClose={() => handleTabChange('dashboard')} 
            theme={customTheme}
            onThemeChange={handleCustomThemeChange}
          />
        );
      default:
        return <Dashboard user={user} onEarnXp={handleEarnXp} />;
    }
  };

  const isUserAdmin = Boolean(
    user.isAdmin ||
    user.role === 'admin' ||
    user.roles?.some((r) => ['super_admin', 'tenant_admin'].includes(r))
  );

  const isFullPageTab = ['admin', 'privacidade', 'cookies'].includes(activeTab) || (isUserAdmin && activeTab === 'admin');

  if (isUnderMaintenance) {
    return <Maintenance />;
  }

  return (
    <div className="min-h-[100dvh] bg-bg-main transition-colors duration-300">
      {isLoggedIn && !isFullPageTab && (
        <>
          <Header 
            isDarkMode={isDarkMode} 
            toggleDarkMode={toggleDarkMode} 
            isAdmin={isUserAdmin} 
            onTabChange={handleTabChange}
            userEmail={user.email}
            user={user}
            onSelectTenant={handleSelectTenant}
          />
          <Navigation 
            activeTab={activeTab} 
            setActiveTab={handleTabChange} 
            isAdmin={isUserAdmin} 
            onLogout={handleLogout}
            user={user}
            onTabHover={handleNavHover}
          />
        </>
      )}

      <main className={`transition-all duration-300 ${isLoggedIn && !isFullPageTab ? 'pt-[calc(4.25rem+env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12 lg:pl-64' : ''}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={isLoggedIn ? activeTab : 'login'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Suspense fallback={<PageLoading />}>
              {renderContent()}
            </Suspense>
            
            {/* Footer / Cookie Button */}
            {isLoggedIn && !isFullPageTab && (
               <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-border-color/50 mt-12 mb-20 md:mb-12 flex flex-col md:flex-row justify-center items-center gap-6">
                  <p className="text-[9px] font-black uppercase text-text-secondary/30 tracking-[0.3em]">Neva Pro • Educando com Inteligência</p>
               </footer>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      
      <CookieBanner />
    </div>
  );
}
