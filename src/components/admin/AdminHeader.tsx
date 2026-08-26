import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  LayoutGrid,
  Calendar,
  Library,
  Megaphone,
  Users,
  Building2,
  Sun,
  Moon,
  UserCircle,
  LogOut,
  PanelLeftClose,
  Upload,
  GraduationCap,
  Settings as SettingsIcon,
} from 'lucide-react';
import Logo from '../Logo';
import { userService } from '../../services/userService';
import { uploadService } from '../../services/uploadService';
import Spinner from '../Spinner';
import { UserProfile } from '../../types';

export type AdminTab = 'panorama' | 'eventos' | 'materiais' | 'mural' | 'alunos' | 'tenants';

interface AdminHeaderProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  user: UserProfile;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onUpdateUser: (user: any) => void;
  onOpenSettings?: () => void;
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
  onOpenSettings,
  materialsCount,
  recadosCount,
  eventosCount
}: AdminHeaderProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAdminPreferences, setShowAdminPreferences] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState('');
  const adminAvatarUrl = user.avatarUrl || user.avatar || '';

  const isSuperAdmin = user.roles?.includes('super_admin') || user.role === 'admin';
  const isTenantAdmin = user.roles?.includes('tenant_admin');
  const isTeacher = user.roles?.includes('teacher');

  const roleLabel = 'Admin';

  const baseTabs = [
    { id: 'panorama' as const, label: 'Painel', icon: LayoutGrid, count: null, visible: true },
    { id: 'eventos' as const, label: 'Eventos', icon: Calendar, count: eventosCount, visible: true },
    { id: 'materiais' as const, label: 'Materiais', icon: Library, count: materialsCount, visible: true },
    { id: 'mural' as const, label: 'Mural', icon: Megaphone, count: recadosCount, visible: true },
    { id: 'alunos' as const, label: 'Alunos', icon: Users, count: null, visible: true },
    {
      id: 'tenants' as const,
      label: 'Instituições',
      icon: Building2,
      count: null,
      visible: isSuperAdmin || isTenantAdmin,
    },
  ];

  const tabs = baseTabs.filter((t) => t.visible);

  const handleAdminAvatarUpload = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarUploadError('Envie uma imagem PNG, JPG ou GIF.');
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarUploadError('');

    try {
      const avatarUrl = await uploadService.uploadFile(file, 'Falha ao enviar foto.');
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

  const renderNav = (onSelect?: () => void) => (
    <nav className="flex flex-col gap-1.5">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => {
            onTabChange(tab.id);
            onSelect?.();
          }}
          className={`w-full h-12 px-4 rounded-xl text-sm font-black transition-all flex items-center gap-3 cursor-pointer ${
            activeTab === tab.id
              ? 'bg-text-main/10 text-text-main shadow-sm'
              : 'text-text-secondary hover:bg-text-main/5 hover:text-text-main'
          }`}
        >
          <tab.icon size={18} />
          <span className="flex-1 text-left">{tab.label}</span>
          {tab.count !== null && tab.count > 0 && (
            <span className="bg-text-main/10 text-text-main text-[9px] px-1.5 py-0.5 rounded-md">{tab.count}</span>
          )}
        </button>
      ))}
    </nav>
  );

  const profileMenu = (
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
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full mt-2.5 w-[min(340px,calc(100vw-2rem))] z-[80] rounded-2xl border border-border-color bg-bg-sidebar shadow-2xl shadow-black/20 overflow-hidden"
          >
            <div className="p-5 border-b border-border-color bg-text-main/[0.03]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-text-main/10 text-text-main flex items-center justify-center font-black text-sm overflow-hidden border border-border-color">
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
                  {isUploadingAvatar ? <Spinner size={13} /> : <Upload size={13} />}
                  {isUploadingAvatar ? 'Enviando foto' : adminAvatarUrl ? 'Trocar foto de perfil' : 'Enviar foto de perfil'}
                </label>
                {avatarUploadError && (
                  <p className="mt-2 text-[10px] font-bold text-red-400">{avatarUploadError}</p>
                )}
              </div>
            </div>

            {onOpenSettings && (
              <div className="p-3 border-b border-border-color bg-bg-main/20">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminPreferences(false);
                    onOpenSettings();
                  }}
                  className="w-full rounded-xl border border-border-color bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary px-3.5 py-2.5 flex items-center justify-between text-xs font-bold transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <SettingsIcon size={15} />
                    <span>Configurações da Conta</span>
                  </div>
                </button>
              </div>
            )}

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
  );

  const profileButton = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowAdminPreferences((current) => !current)}
        className={`w-full flex items-center gap-3 border rounded-xl px-3 py-2.5 text-text-main transition-all cursor-pointer ${
          showAdminPreferences
            ? 'bg-text-main/15 border-text-main/30'
            : 'bg-text-main/5 hover:bg-text-main/10 border-border-color'
        }`}
        title="Abrir preferencias do admin"
        aria-label="Abrir preferencias do admin"
      >
        <div className="w-8 h-8 rounded-lg bg-text-main/10 text-text-main border border-border-color flex items-center justify-center font-black text-xs overflow-hidden">
          {adminAvatarUrl ? (
            <img src={adminAvatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            user.name?.charAt(0) || 'A'
          )}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-xs font-black text-text-main truncate">{user.name || 'Administrador'}</div>
          <div className="text-[10px] font-bold text-text-secondary truncate">{user.email}</div>
        </div>
        <UserCircle size={15} className="text-text-secondary shrink-0" />
      </button>
      {profileMenu}
    </div>
  );

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-16 sm:h-20 bg-bg-sidebar/95 backdrop-blur-md border-b border-border-color transition-colors duration-300">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Left: Logo & Brand Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <Logo className="h-9 sm:h-10 justify-start" />
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-black uppercase tracking-wider">
              <ShieldCheck size={13} />
              {roleLabel}
            </div>
          </div>

          {/* Center: Centralized Tabs Navigation (Desktop) */}
          <nav className="hidden md:flex items-center gap-1.5 p-1.5 bg-bg-main/60 rounded-2xl border border-border-color/80 shadow-xs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/30 font-black'
                      : 'text-text-secondary hover:text-text-main hover:bg-text-main/5'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                  {tab.count !== null && tab.count > 0 && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        isActive ? 'bg-white/25 text-white' : 'bg-brand-primary/15 text-brand-primary'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Theme Toggle & Admin Profile */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggleDarkMode}
              className="p-2.5 rounded-xl bg-bg-card border border-border-color text-text-secondary hover:text-text-main hover:border-brand-primary/30 transition-all cursor-pointer"
              title={isDarkMode ? 'Modo Claro' : 'Modo Escuro'}
              aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {isDarkMode ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-brand-primary" />}
            </button>

            {profileButton}

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-2.5 bg-bg-card border border-border-color rounded-xl text-text-secondary hover:text-text-main cursor-pointer"
              title="Alternar menu"
              aria-label="Alternar menu"
            >
              <PanelLeftClose size={18} className={isSidebarOpen ? '' : 'rotate-180'} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Centralized Menu Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-[45] mt-16 sm:mt-20"
            />
            <motion.div
              initial={{ y: '-100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-100%', opacity: 0 }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="md:hidden fixed top-16 sm:top-20 left-0 right-0 bg-bg-sidebar border-b border-border-color p-4 z-[50] shadow-2xl space-y-3"
            >
              <div className="grid grid-cols-2 gap-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        onTabChange(tab.id);
                        setIsSidebarOpen(false);
                      }}
                      className={`p-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                        isActive
                          ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/30 font-black'
                          : 'bg-bg-main/50 text-text-secondary border border-border-color hover:text-text-main'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="truncate">{tab.label}</span>
                      {tab.count !== null && tab.count > 0 && (
                        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-bold">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="pt-3 border-t border-border-color flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-black uppercase tracking-wider">
                  <ShieldCheck size={13} />
                  <span>{roleLabel}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-500 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={14} />
                  Sair do sistema
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
