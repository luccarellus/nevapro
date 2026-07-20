/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Navigation from './components/Navigation';
import Header from './components/Header';
import CookieBanner from './components/CookieBanner';
import Maintenance from './components/Maintenance';
import { UserProfile } from './types';
import { PenTool, Sparkles } from 'lucide-react';
import { userService } from './services/userService';
import { initConsentMode } from './lib/consentManager';
import { calculateLevelAndProgression } from './utils/xpUtils';
import { invalidateRequestCache } from './lib/requestCache';

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
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const CookiePolicy = lazy(() => import('./components/CookiePolicy'));
const ComingSoon = lazy(() => import('./components/ComingSoon'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));

const PageLoading = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
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

  useEffect(() => {
    initConsentMode();

    // Check if user is returning from password reset email
    if (window.location.hash?.includes('type=recovery')) {
      setIsResettingPassword(true);
    }
    
    // Recovery session for students
    const savedUser = localStorage.getItem('neva_student_session');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setIsLoggedIn(true);
        setUser(parsedUser);
        if (parsedUser.role === 'admin') {
          setActiveTab('admin');
        }
        fetchUser(parsedUser.email);
      } catch (e) {
        localStorage.removeItem('neva_student_session');
      }
    }
  }, []);

  const fetchUser = async (email?: string) => {
    if (!email) return;
    try {
      const profile = await userService.getProfile(email);
      if (profile) {
        const { nextLevelXp, currentLevelMinXp } = calculateLevelAndProgression(profile.xp || 0);
        const profileWithNextLevel = { ...profile, nextLevelXp, currentLevelMinXp };
        setUser(prev => ({ ...prev, ...profileWithNextLevel }));
        // Atualiza a sessão no localStorage para ambos os perfis (aluno e admin) para persistir no F5
        localStorage.setItem('neva_student_session', JSON.stringify(profileWithNextLevel));
        
        if (profile.role === 'admin') {
          setActiveTab('admin');
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch user:', error);
      if (error.status === 401) {
        handleLogout();
      }
    }
  };

  useEffect(() => {
    if (customTheme && customTheme !== 'default') {
      document.documentElement.setAttribute('data-theme', customTheme);
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else {
      if (isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.classList.remove('dark');
      }
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
  
  const handleLogin = async (loggedUser: UserProfile) => {
    invalidateRequestCache();
    setIsLoggedIn(true);
    setUser(loggedUser);
    
    // Persiste a sessão local para ambos os perfis (aluno e admin)
    localStorage.setItem('neva_student_session', JSON.stringify(loggedUser));

    if (loggedUser.role === 'admin') {
      setActiveTab('admin');
    }

    // Carrega e calcula imediatamente os dados corretos de interação e progresso do banco
    if (loggedUser.email) {
      await fetchUser(loggedUser.email);
    }
  };

  async function handleLogout() {
    if (isSimulationActive) {
      setPendingTab('logout');
      return;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Erro ao fazer logout no servidor:', err);
    }
    localStorage.removeItem('neva_student_session');
    invalidateRequestCache();
    setIsLoggedIn(false);
    setActiveTab('dashboard');
  }

  const handleConfirmExit = async () => {
    setIsSimulationActive(false);
    if (pendingTab) {
      if (pendingTab === 'logout') {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
          console.error('Erro ao fazer logout no servidor:', err);
        }
        localStorage.removeItem('neva_student_session');
        invalidateRequestCache();
        setIsLoggedIn(false);
        setActiveTab('dashboard');
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
    
    // Use explicit increments or default gracefully
    const corrInc = correctIncrement !== undefined ? correctIncrement : (amount > 0 ? 1 : 0);
    const ansInc = answeredIncrement !== undefined ? answeredIncrement : (amount > 0 ? 1 : 0);

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

    // Persist to server
    try {
      await userService.updateProfile(updatedUser);
    } catch (error) {
      console.error('Failed to sync XP with server:', error);
    }
  };

  const renderContent = () => {
    if (activeTab === 'privacidade') return <PrivacyPolicy onBack={() => handleTabChange(user.role === 'admin' ? 'admin' : 'dashboard')} />;
    if (activeTab === 'cookies') return <CookiePolicy onBack={() => handleTabChange(user.role === 'admin' ? 'admin' : 'dashboard')} />;

    if (isResettingPassword) {
      return <ResetPassword onBack={() => { setIsResettingPassword(false); window.location.hash = ''; }} />;
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
        return user.role === 'admin' ? (
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

  const isFullPageTab = ['admin', 'privacidade', 'cookies'].includes(activeTab) || user.role === 'admin';

  const isUnderMaintenance = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

  if (isUnderMaintenance) {
    return <Maintenance />;
  }

  return (
    <div className="min-h-screen bg-bg-main transition-colors duration-300">
      {isLoggedIn && !isFullPageTab && (
        <>
          <Header 
            isDarkMode={isDarkMode} 
            toggleDarkMode={toggleDarkMode} 
            isAdmin={user.role === 'admin'} 
            onTabChange={handleTabChange}
            userEmail={user.email}
            user={user}
          />
          <Navigation 
            activeTab={activeTab} 
            setActiveTab={handleTabChange} 
            isAdmin={user.role === 'admin'} 
            onLogout={handleLogout}
            user={user}
          />
        </>
      )}

      <main className={`transition-all duration-300 ${isLoggedIn && !isFullPageTab ? 'lg:pl-64' : ''}`}>
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
