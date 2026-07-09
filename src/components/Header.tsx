import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon, Bell, Check, X, ClipboardList, BookOpen, MessageSquare, Calendar as CalendarIcon } from 'lucide-react';
import Logo from './Logo';

import { UserProfile } from '../types';

interface HeaderProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isAdmin: boolean;
  onTabChange?: (tab: string) => void;
  userEmail?: string;
  user?: UserProfile;
}

export default function Header({ isDarkMode, toggleDarkMode, isAdmin, onTabChange, userEmail, user }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleNotificationClick = async (n: any) => {
    if (!n.read) {
      try {
        const response = await fetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
        if (response.ok) {
          setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif));
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.warn('Falha amortecida ao marcar notificação como lida:', err);
      }
    }

    if (onTabChange) {
      if (n.type === 'material') {
        onTabChange('materiais');
      } else if (n.type === 'mural') {
        onTabChange('mural');
      } else if (n.type === 'evento') {
        onTabChange('calendar');
      }
    }
    setShowNotifications(false);
  };

  const fetchNotifications = async () => {
    try {
      const url = userEmail ? `/api/notifications?email=${encodeURIComponent(userEmail)}` : '/api/notifications';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
        setUnreadCount(data.filter((n: any) => !n.read).length);
      }
    } catch (err) {
      console.warn('Falha amortecida ao buscar notificações:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [userEmail]);

  const markAllAsRead = async () => {
    try {
      const url = userEmail ? `/api/notifications/read-all?email=${encodeURIComponent(userEmail)}` : '/api/notifications/read-all';
      const response = await fetch(url, { method: 'POST' });
      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.warn('Falha amortecida ao marcar como lidas:', err);
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 1) return 'Agora';
    if (diffInMinutes < 60) return `Há ${diffInMinutes} min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `Há ${diffInHours}h`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'material': return <BookOpen size={14} className="text-emerald-500" />;
      case 'mural': return <MessageSquare size={14} className="text-purple-500" />;
      case 'evento': return <CalendarIcon size={14} className="text-blue-500" />;
      default: return <Bell size={14} className="text-brand-primary" />;
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-bg-main/50 backdrop-blur-xl">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="lg:hidden">
          <Logo className="h-14" />
        </div>
        <div className="flex-1 lg:flex justify-end hidden">
           {/* In desktop the logo is in the sidebar, so we leave space or add search */}
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
            {/* User Avatar / Badge */}
            {isAdmin && (
              <>
                <button
                  onClick={() => onTabChange?.('profile')}
                  className="flex items-center gap-2 p-1.5 pr-3 rounded-xl bg-bg-card/50 hover:bg-bg-card/80 transition-all group"
                  title="Configurações"
                >
                  <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
                    {user?.avatarUrl || user?.avatar ? (
                      <img 
                        src={user?.avatarUrl || user?.avatar || ''} 
                        alt="" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-brand-primary flex items-center justify-center text-white font-black text-xs">
                        {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                      </div>
                    )}
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-bold text-yellow-400">
                    Admin
                  </span>
                </button>
                <div className="h-8 w-px bg-transparent mx-1" />
              </>
            )}
           
           <div className="relative">
             <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={`p-2.5 bg-bg-card/50 rounded-xl transition-all relative group ${showNotifications ? 'text-brand-primary' : 'text-text-secondary hover:text-text-main'}`}
              title="Notificações"
             >
               <Bell size={18} />
               {unreadCount > 0 && (
                 <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-brand-primary rounded-full border-2 border-bg-main animate-pulse" />
               )}
             </button>

             <AnimatePresence>
               {showNotifications && (
                 <>
                   <div 
                     className="fixed inset-0 z-[-1]" 
                     onClick={() => setShowNotifications(false)} 
                   />
                   <motion.div
                     initial={{ opacity: 0, y: 10, scale: 0.95 }}
                     animate={{ opacity: 1, y: 0, scale: 1 }}
                     exit={{ opacity: 0, y: 10, scale: 0.95 }}
                     className="absolute right-0 mt-4 w-[calc(100vw-2rem)] sm:w-[400px] bg-[#0d1425] border border-white/5 rounded-[32px] shadow-2xl overflow-hidden shadow-black/80 z-50 transition-all duration-300"
                      style={{ transformOrigin: 'top right' }}
                   >
                     <div className="p-6 border-b border-white/5 flex justify-between items-center">
                       <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00e5ff] leading-none mb-1">Notificações</h4>
                        <p className="text-[9px] text-text-secondary mt-0.5 font-bold opacity-40 uppercase tracking-widest">{unreadCount} mensagens</p>
                       </div>
                       <button onClick={() => setShowNotifications(false)} className="text-text-secondary hover:text-white p-1 rounded-lg hover:bg-white/5">
                         <X size={14} />
                       </button>
                     </div>
                     <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                       {notifications.length === 0 ? (
                         <div className="p-10 text-center">
                            <div className="w-16 h-16 bg-white/[0.02] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/5 rotate-12 transition-transform group-hover:rotate-0">
                                <Bell className="text-white/10" size={28} />
                             </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary opacity-20">Você está em dia!</p>
                         </div>
                       ) : (
                         notifications.map(n => (
                           <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-5 border-b border-white/5 last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors group relative ${!n.read ? 'bg-white/[0.02]' : ''}`}>
                             {!n.read && (
                               <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00e5ff]" />
                             )}
                             <div className="flex justify-between items-start mb-2">
                               <div className="flex items-center gap-2">
                                 {getIconForType(n.type)}
                                 <h5 className={`font-black text-[13px] tracking-tight leading-none uppercase ${!n.read ? 'text-white' : 'text-text-secondary opacity-50'} group-hover:text-[#00e5ff] transition-colors`}>{n.title}</h5>
                               </div>
                               <span className="text-[8px] font-bold text-white/20 whitespace-nowrap">{getTimeAgo(n.createdAt)}</span>
                             </div>
                             <p className={`text-xs leading-relaxed ${!n.read ? 'text-text-main font-medium' : 'text-text-secondary'}`}>{n.message}</p>
                           </div>
                         ))
                       )}
                     </div>
                     {notifications.length > 0 && (
                        <div className="p-4 bg-white/[0.02] text-center border-t border-white/5">
                          <button 
                            onClick={markAllAsRead}
                            className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-[#00e5ff] hover:text-black text-white text-[10px] font-black uppercase tracking-[0.3em] transition-all"
                          >
                            Marcar como concluídas
                          </button>
                        </div>
                     )}
                   </motion.div>
                 </>
               )}
             </AnimatePresence>
           </div>

           <button 
            onClick={toggleDarkMode}
            className="p-2.5 bg-bg-card/50 rounded-xl text-text-secondary hover:text-text-main transition-all"
            title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
           >
             {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
           </button>
        </div>
      </div>
    </header>
  );
}
