import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, Trophy, BookOpen, Calendar, ShieldCheck, User, MessageSquare, ClipboardList, FolderOpen, MoreHorizontal, X, LogOut, PenTool, Sparkles } from 'lucide-react';
import Logo from './Logo';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAdmin?: boolean;
  onLogout?: () => void;
}

export default function Navigation({ activeTab, setActiveTab, isAdmin, onLogout }: NavigationProps) {
  const [showMore, setShowMore] = useState(false);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-[#00e5ff]', bgColor: 'bg-[#00e5ff]/10', hex: '#00e5ff' },
    { id: 'questions', label: 'Questões', icon: BookOpen, color: 'text-blue-500', bgColor: 'bg-blue-500/10', hex: '#3b82f6' },
    { id: 'simulados', label: 'Simulados', icon: ClipboardList, color: 'text-sky-400', bgColor: 'bg-sky-400/10', hex: '#38bdf8' },
    { id: 'ranking', label: 'Ranking', icon: Trophy, color: 'text-amber-500', bgColor: 'bg-amber-500/10', hex: '#f59e0b' },
    { id: 'materiais', label: 'Materiais', icon: FolderOpen, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', hex: '#10b981' },
    { id: 'mural', label: 'Mural de recados', icon: MessageSquare, color: 'text-purple-500', bgColor: 'bg-purple-500/10', hex: '#a855f7' },
    { id: 'calendar', label: 'Calendário', icon: Calendar, color: 'text-slate-400', bgColor: 'bg-slate-400/10', hex: '#94a3b8' },
    { id: 'redacao', label: 'Redação', icon: PenTool, color: 'text-rose-400', bgColor: 'bg-rose-400/10', hex: '#fb7185' },
    { id: 'professor_ia', label: 'Professor IA', icon: Sparkles, color: 'text-indigo-400', bgColor: 'bg-indigo-400/10', hex: '#818cf8' },
  ];

  if (isAdmin) {
    tabs.push({ id: 'admin', label: 'Backoffice', icon: ShieldCheck, color: 'text-sky-500', bgColor: 'bg-sky-500/10', hex: '#0ea5e9' });
  }

  const mainMobileTabs = tabs.slice(0, 4);
  const otherTabs = [
    ...tabs.slice(4),
    { id: 'profile', label: 'Preferências', icon: User, color: 'text-slate-400', bgColor: 'bg-slate-400/10', hex: '#94a3b8' },
    { id: 'logout', label: 'Sair', icon: LogOut, color: 'text-red-500', bgColor: 'bg-red-500/10', hex: '#ef4444' }
  ];

  const handleTabClick = (id: string) => {
    if (id === 'logout' && onLogout) {
      onLogout();
    } else {
      setActiveTab(id);
      setShowMore(false);
    }
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-bg-sidebar border-r border-border-color z-50 flex flex-col pt-8 px-4 hidden lg:flex">
        <div className="mb-10 flex justify-center w-full">
          <Logo className="h-14 justify-center w-full" />
        </div>

        <div className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative ${
                  isActive 
                  ? `${tab.color} ${tab.bgColor}` 
                  : 'text-text-secondary hover:bg-text-main/5 hover:text-text-main'
                }`}
              >
                <Icon 
                  size={20} 
                  strokeWidth={isActive ? 2.5 : 2} 
                  className={isActive ? tab.color : 'text-text-secondary group-hover:text-text-main transition-colors'}
                />
                <span className={`text-sm font-bold tracking-tight ${isActive ? 'font-black' : ''}`}>{tab.label}</span>
                
                {isActive && (
                  <motion.div
                    layoutId="activeSideTab"
                    className="absolute left-0 w-1 h-6 rounded-r-full"
                    style={{ 
                      backgroundColor: tab.hex || 'currentColor',
                      boxShadow: `0 0 15px ${tab.hex || 'currentColor'}bb`
                    }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-auto mb-8 space-y-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all ${
              activeTab === 'profile' ? 'bg-slate-400/10 text-slate-400' : 'text-text-secondary hover:bg-text-main/5 hover:text-text-main'
            }`}
          >
            <User size={20} className={activeTab === 'profile' ? 'text-slate-400' : ''} />
            <span className="text-sm font-bold tracking-tight">Preferências</span>
          </button>

          <button
            onClick={onLogout}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all text-red-500/70 hover:bg-red-500/10 hover:text-red-500"
          >
            <LogOut size={20} />
            <span className="text-sm font-bold tracking-tight">Log-off</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation - Expandable */}
      <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-bg-sidebar/95 backdrop-blur-xl z-[100] border-t border-border-color shadow-2xl safe-p-bottom transition-all duration-300">
        <div className="flex flex-col px-2">
          
          <AnimatePresence>
            {showMore && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-4 gap-2 pt-4 pb-2 border-b border-border-color/30">
                  {otherTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabClick(tab.id)}
                        className={`flex flex-col items-center gap-1 py-2 px-1 transition-all ${
                          isActive ? tab.color : tab.id === 'logout' ? 'text-red-500/70 hover:text-red-500' : 'text-text-secondary hover:text-text-main'
                        }`}
                      >
                        <div className={`relative p-2 rounded-xl transition-all ${isActive ? tab.bgColor : tab.id === 'logout' ? 'bg-red-500/10' : 'bg-bg-card'}`}>
                          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                        </div>
                        <span className="text-[10px] font-bold tracking-tight opacity-70 text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">
                          {tab.label.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-around items-center w-full">
            {mainMobileTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`flex flex-col items-center gap-1 py-3 px-2 flex-1 transition-all ${
                    isActive ? tab.color : 'text-text-secondary hover:text-text-main'
                  }`}
                >
                  <div className={`relative p-2 rounded-xl transition-all ${isActive ? tab.bgColor : ''}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && (
                      <motion.div
                        layoutId="activeBottomTab"
                        className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full"
                        style={{ backgroundColor: tab.hex || 'currentColor' }}
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] font-bold tracking-tight opacity-70 text-center whitespace-nowrap">
                    {tab.id === 'dashboard' ? 'Início' : tab.label.split(' ')[0]}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => setShowMore(!showMore)}
              className={`flex flex-col items-center gap-1 py-3 px-2 flex-1 transition-all ${
                showMore ? 'text-brand-primary' : (otherTabs.some(t => t.id === activeTab) ? 'text-brand-primary' : 'text-text-secondary')
              }`}
            >
              <div className="relative p-2 rounded-xl transition-all">
                {showMore ? <X size={20} /> : <MoreHorizontal size={20} />}
                {!showMore && otherTabs.some(t => t.id === activeTab) && (
                  <motion.div
                    layoutId="activeBottomTab"
                    className="absolute inset-x-0 -bottom-1 h-0.5 bg-brand-primary rounded-full"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </div>
              <span className="text-[10px] font-bold tracking-tight opacity-70 text-center whitespace-nowrap">
                {showMore ? 'Menos' : 'Mais opções'}
              </span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
