/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import Questions from './components/Questions';
import Header from './components/Header';
import Leaderboard from './components/Leaderboard';
import Calendar from './components/Calendar';
import AdminDashboard from './components/AdminDashboard';
import Login from './components/Login';
import Simulados from './components/Simulados';
import Materiais from './components/Materiais';
import Mural from './components/Mural';
import Settings from './components/Settings';
import ErrorsBook from './components/ErrorsBook';
import CookieBanner from './components/CookieBanner';
import PrivacyPolicy from './components/PrivacyPolicy';
import CookiePolicy from './components/CookiePolicy';
import Maintenance from './components/Maintenance';
import ComingSoon from './components/ComingSoon';
import { UserProfile } from './types';
import { Sun, Moon, ShieldCheck, User as UserIcon, BookOpen, PenTool, Sparkles } from 'lucide-react';
import { userService } from './services/userService';
import { initConsentMode } from './lib/consentManager';
import { calculateLevelAndProgression } from './utils/xpUtils';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
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
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);
  
  const handleLogin = async (loggedUser: UserProfile) => {
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
        return user.role === 'admin' ? <AdminDashboard user={user} onLogout={handleLogout} /> : <Dashboard user={user} onEarnXp={handleEarnXp} />;
      case 'profile':
        return <Settings user={user} onUpdateUser={setUser} onClose={() => handleTabChange('dashboard')} />;
      default:
        return <Dashboard user={user} onEarnXp={handleEarnXp} />;
    }
  };

  const isFullPageTab = ['admin', 'privacidade', 'cookies'].includes(activeTab) || user.role === 'admin';

  // Toggle this flag to true to enable the maintenance screen and block the entire system
  const IS_UNDER_MAINTENANCE = false;

  if (IS_UNDER_MAINTENANCE) {
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
          />
          <Navigation 
            activeTab={activeTab} 
            setActiveTab={handleTabChange} 
            isAdmin={user.role === 'admin'} 
            onLogout={handleLogout}
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
            {renderContent()}
            
            {/* Footer / Cookie Button */}
            {isLoggedIn && !isFullPageTab && (
               <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-border-color/50 mt-12 mb-20 md:mb-12 flex flex-col md:flex-row justify-center items-center gap-6">
                  <p className="text-[9px] font-black uppercase text-text-secondary/30 tracking-[0.3em]">Neva • Educando com Inteligência</p>
               </footer>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      
      <CookieBanner />
    </div>
  );
}
