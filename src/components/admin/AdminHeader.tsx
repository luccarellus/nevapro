import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  LayoutGrid,
  Calendar,
  Library,
  Megaphone,
  Users,
  Sun,
  Moon,
  UserCircle,
  LogOut,
  PanelLeftClose,
  Upload,
  Loader2
} from 'lucide-react';
import Logo from '../Logo';
import { userService } from '../../services/userService';

interface AdminHeaderProps {
  activeTab: 'panorama' | 'eventos' | 'materiais' | 'mural' | 'alunos';
  onTabChange: (tab: 'panorama' | 'eventos' | 'materiais' | 'mural' | 'alunos') => void;
  user: { name?: string; email?: string; avatarUrl?: string; avatar?: string };
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onUpdateUser: (user: any) => void;
  materialsCount: number;
  recadosCount: number;
  eventosCount: number;
}

export default function AdminHeader({
  activeTab,
  onTabChange,
  user,
  onLogout,
  isDarkMode,
  onToggleDarkMode,
  onUpdateUser,
  materialsCount,
  recadosCount,
  eventosCount
}: AdminHeaderProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAdminPreferences, setShowAdminPreferences] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState('');
  const adminAvatarUrl = user.avatarUrl || user.avatar || '';

  const handleAdminAvatarUpload = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarUploadError('Envie uma imagem PNG, JPG ou GIF.');
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json().catch(() => null);
        throw new Error(errorData?.error || 'Falha ao enviar foto.');
      }

      const uploadData = await uploadRes.json();
      const avatarUrl = uploadData.url;
      
      const response = await userService.updateProfile({
        email: user.email,
        name: user.name,
        avatarUrl
      });
      const updatedUser = { ...user, ...(response.user || {}), avatarUrl };
      localStorage.setItem('neva_student_session', JSON.stringify(updatedUser));
      onUpdateUser(updatedUser);
    } catch (error: any) {
      setAvatarUploadError(error?.message || 'Nao foi possivel salvar a foto.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const tabs = [
    { id: 'panorama' as const, label: 'Painel', icon: LayoutGrid, count: null },
    { id: 'eventos' as const, label: 'Eventos', icon: Calendar, count: eventosCount },
    { id: 'materiais' as const, label: 'Materiais', icon: Library, count: materialsCount },
    { id: 'mural' as const, label: 'Mural', icon: Megaphone, count: recadosCount },
    { id: 'alunos' as const, label: 'Alunos', icon: Users, count: null },
  ];

  return (
    <>
      {/* Top Header Bar */}
      <header className="h-16 md:h-20 bg-bg-sidebar border-b border-border-color flex items-center justify-between px-6 md:px-12 shrink-0 z-50 transition-colors duration-300">
        <div className="flex items-center gap-6">
          <div className="text-text-main flex items-center">
            <Logo className="h-8 md:h-10 justify-start" />
          </div>
          <div className="hidden sm:flex bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded-lg items-center gap-1.5">
            <ShieldCheck size={14} className="text-yellow-500" />
            <span className="text-[10px] font-black tracking-wide text-yellow-500">Super-admin Neva Pro</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1.5 font-bold">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-text-main/10 text-text-main'
                  : 'text-text-secondary hover:bg-text-main/5 hover:text-text-main'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="bg-text-main/10 text-text-main text-[9px] px-1.5 py-0.5 rounded-md">{tab.count}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User Info / Profile & Logout */}
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleDarkMode}
            className="p-2.5 bg-bg-card/50 rounded-xl text-text-secondary hover:text-text-main transition-all cursor-pointer"
            title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
            aria-label={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAdminPreferences((current) => !current)}
              className={`flex items-center gap-3 border rounded-xl px-4 py-2 text-text-main transition-all cursor-pointer ${
                showAdminPreferences
                  ? 'bg-blue-600/15 border-blue-500/30'
                  : 'bg-text-main/5 hover:bg-text-main/10 border-border-color'
              }`}
              title="Abrir preferencias do admin"
              aria-label="Abrir preferencias do admin"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-black text-xs text-white overflow-hidden">
                {adminAvatarUrl ? (
                  <img src={adminAvatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.name?.charAt(0) || 'A'
                )}
              </div>
              <span className="hidden sm:inline text-xs font-bold text-text-main">{user.name}</span>
              <UserCircle size={15} className="text-text-secondary" />
            </button>

            <AnimatePresence>
              {showAdminPreferences && (
                <>
                  <motion.button
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowAdminPreferences(false)}
                    className="fixed inset-0 z-[70] cursor-default"
                    aria-label="Fechar preferencias"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-full mt-3 w-[min(340px,calc(100vw-2rem))] z-[80] rounded-2xl border border-border-color bg-bg-sidebar shadow-2xl shadow-black/20 overflow-hidden"
                  >
                    <div className="p-5 border-b border-border-color bg-text-main/[0.03]">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm overflow-hidden">
                          {adminAvatarUrl ? (
                            <img src={adminAvatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            user.name?.charAt(0) || 'A'
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-text-main font-black text-sm truncate">{user.name || 'Administrador'}</p>
                          <p className="text-text-secondary font-bold text-[10px] truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <input
                          id="admin-profile-photo"
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/gif"
                          className="hidden"
                          onChange={(event) => {
                            handleAdminAvatarUpload(event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                        <label
                          htmlFor="admin-profile-photo"
                          className={`w-full rounded-xl border border-border-color bg-text-main/5 px-3 py-2.5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                            isUploadingAvatar
                              ? 'text-text-secondary opacity-60 pointer-events-none'
                              : 'text-text-main hover:bg-text-main/10 cursor-pointer'
                          }`}
                        >
                          {isUploadingAvatar ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Upload size={13} />
                          )}
                          {isUploadingAvatar ? 'Enviando foto' : adminAvatarUrl ? 'Trocar foto de perfil' : 'Enviar foto de perfil'}
                        </label>
                        {avatarUploadError && (
                          <p className="mt-2 text-[10px] font-bold text-red-400">{avatarUploadError}</p>
                        )}
                      </div>
                    </div>

                    <div className="p-4 border-t border-border-color bg-bg-main/30 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary opacity-70">
                        <ShieldCheck size={13} />
                        Preferencias do admin
                      </div>
                      <button
                        type="button"
                        onClick={onLogout}
                        className="text-[10px] font-black text-red-400 hover:text-red-300 flex items-center gap-1.5 cursor-pointer"
                      >
                        <LogOut size={13} />
                        Sair
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={onLogout}
            className="p-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-500 transition-all cursor-pointer"
            title="Sair do sistema"
          >
            <LogOut size={16} />
          </button>

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="md:hidden p-2.5 bg-text-main/5 hover:bg-text-main/10 border border-border-color rounded-xl text-text-secondary hover:text-text-main cursor-pointer"
            title="Alternar menu"
            aria-label="Alternar menu"
          >
            <PanelLeftClose size={18} className={isSidebarOpen ? "" : "rotate-180"} />
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] mt-16 md:mt-20"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="md:hidden fixed inset-y-0 left-0 w-72 bg-bg-sidebar border-r border-border-color flex flex-col z-[60] mt-16 md:mt-20 p-6 space-y-4"
            >
              <div className="text-[10px] font-black text-text-secondary opacity-50 tracking-wide uppercase mb-2">Navegação</div>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { onTabChange(tab.id); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm cursor-pointer ${
                    activeTab === tab.id ? 'bg-text-main/10 text-text-main' : 'text-text-secondary hover:bg-text-main/5'
                  }`}
                >
                  <tab.icon size={18} /> {tab.label}
                </button>
              ))}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
