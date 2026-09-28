import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Bell, 
  Palette, 
  Shield, 
  X, 
  ChevronDown,
  CheckCircle2,
  Check,
  AlertTriangle,
  Upload,
  Camera
} from 'lucide-react';
import { UserProfile } from '../types';
import { userService } from '../services/userService';
import { uploadService } from '../services/uploadService';
import Spinner from './Spinner';

interface SettingsProps {
  user: UserProfile;
  onUpdateUser: (user: UserProfile) => void;
  onClose: () => void;
  theme: string;
  onThemeChange: (theme: string) => void;
}

type SettingsTab = 'perfil' | 'notificacoes' | 'aparencia' | 'privacidade';

export default function Settings({ user, onUpdateUser, onClose, theme, onThemeChange }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('perfil');
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || 'admin@neva.pro');
  const [city, setCity] = useState(user?.city || '');
  const [school, setSchool] = useState(user?.school || '');
  const [gremio, setGremio] = useState(user?.gremio || '');
  const [languagePreference, setLanguagePreference] = useState(user?.languagePreference || 'ingles');
  const [showInLeaderboard, setShowInLeaderboard] = useState(user?.showInLeaderboard !== false);
  const [emailNotifications, setEmailNotifications] = useState(user?.emailNotifications !== false);
  const [browserNotifications, setBrowserNotifications] = useState(user?.browserNotifications !== false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userAvatarUrl = user.avatarUrl || user.avatar || '';

  const handleAvatarUpload = async (file?: File | null) => {
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
      onUpdateUser(updatedUser);
      localStorage.setItem('neva_student_session', JSON.stringify(updatedUser));
    } catch (error: any) {
      setAvatarUploadError(error?.message || 'Não foi possível salvar a foto.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordStatus('idle');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Todos os campos são obrigatórios.');
      setPasswordStatus('error');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('A nova senha deve ter pelo menos 6 caracteres.');
      setPasswordStatus('error');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('A nova senha e a confirmação não coincidem.');
      setPasswordStatus('error');
      return;
    }

    setPasswordStatus('loading');
    try {
      const response = await userService.changePassword({
        email: user.email,
        currentPassword,
        newPassword
      });

      if (response.success) {
        setPasswordStatus('success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordStatus('idle'), 4000);
      } else {
        setPasswordError(response.message || 'Erro ao alterar a senha.');
        setPasswordStatus('error');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Falha ao alterar senha. Verifique os dados informados.');
      setPasswordStatus('error');
    }
  };

  // Sync with user prop if it changes externally
  const handleReset = () => {
    setDisplayName(user?.name || '');
    setCity(user?.city || '');
    setSchool(user?.school || '');
    setGremio(user?.gremio || '');
    setLanguagePreference(user?.languagePreference || 'ingles');
    setShowInLeaderboard(user?.showInLeaderboard !== false);
    setEmailNotifications(user?.emailNotifications !== false);
    setBrowserNotifications(user?.browserNotifications !== false);
  };

  const sidebarItems = [
    { id: 'perfil', label: 'Perfil', icon: <User size={18} /> },
    { id: 'notificacoes', label: 'Notificações', icon: <Bell size={18} /> },
    { id: 'aparencia', label: 'Aparência', icon: <Palette size={18} /> },
    { id: 'privacidade', label: 'Privacidade', icon: <Shield size={18} /> },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const response = await userService.updateProfile({ 
        email,
        name: displayName,
        city,
        school,
        gremio,
        languagePreference,
        showInLeaderboard,
        emailNotifications,
        browserNotifications
      });
      
      if (response.success) {
        onUpdateUser(response.user);
      }
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProfile = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteProfile = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await userService.deleteProfile(user.email);
      if (response.success) {
        window.location.reload(); // Simple way to reset app state for this demo
      } else {
        setDeleteError('Erro ao excluir perfil. Tente novamente.');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      setDeleteError('Erro ao excluir perfil. Tente novamente.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto pt-24 pb-32 px-4 md:px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-card/50 backdrop-blur-xl rounded-3xl md:rounded-[40px] overflow-hidden shadow-2xl flex flex-col md:flex-row min-h-[600px]"
      >
        {/* Internal Sidebar */}
        <div className="w-full md:w-72 bg-bg-sidebar/80 p-6 md:p-8 border-b md:border-b-0 md:border-r border-border-color/30">
          <h2 className="text-2xl md:text-3xl font-black text-text-main mb-6 md:mb-12 tracking-tight">Configurações</h2>
          
          <nav className="flex flex-row md:flex-col gap-2 overflow-x-auto no-scrollbar pb-3 md:pb-0">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={`flex-shrink-0 flex items-center gap-2 md:gap-4 px-4 py-3 md:px-5 md:py-4 rounded-2xl transition-all font-bold text-sm ${
                  activeTab === item.id 
                    ? 'text-[#00b094] bg-[#00b094]/10 md:bg-[#00b094]/5' 
                    : 'text-text-secondary hover:bg-white/5 dark:hover:bg-white/5 hover:bg-black/5 hover:text-text-main'
                }`}
              >
                <div className={`${activeTab === item.id ? 'text-[#00b094]' : 'text-text-secondary'}`}>
                  {item.icon}
                </div>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 md:p-12 relative overflow-y-auto max-h-[80vh] md:max-h-[none]">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 md:top-10 md:right-10 text-text-secondary hover:text-text-main transition-all z-10"
            title="Fechar configurações"
            aria-label="Fechar configurações"
          >
            <X size={24} />
          </button>

          {activeTab === 'perfil' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl"
            >
              <h3 className="text-2xl font-black text-text-main mb-10">Seu Perfil</h3>

              <div className="space-y-8">
                {/* Profile Photo */}
                <div className="flex items-center gap-6">
                  <div className="relative flex-shrink-0">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center text-white font-black text-2xl overflow-hidden shadow-lg shadow-brand-primary/20">
                      {userAvatarUrl ? (
                        <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        user.name?.charAt(0)?.toUpperCase() || '?'
                      )}
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/80 transition-all disabled:opacity-50"
                      title="Alterar foto de perfil"
                    >
                      {isUploadingAvatar ? (
                        <Spinner size={14} className="text-white" />
                      ) : (
                        <Camera size={14} />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        handleAvatarUpload(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-text-main font-black text-sm">Foto de perfil</p>
                    <p className="text-text-secondary text-[10px] font-bold mt-1">
                      PNG, JPG ou GIF. Tamanho máximo de 10MB.
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className={`mt-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                        isUploadingAvatar
                          ? 'text-text-secondary opacity-60'
                          : 'text-brand-primary hover:text-brand-primary/80'
                      }`}
                    >
                      {isUploadingAvatar ? (
                        <Spinner size={12} />
                      ) : (
                        <Upload size={12} />
                      )}
                      {isUploadingAvatar ? 'Enviando...' : userAvatarUrl ? 'Trocar foto' : 'Enviar foto'}
                    </button>
                    {avatarUploadError && (
                      <p className="mt-2 text-[10px] font-bold text-red-400">{avatarUploadError}</p>
                    )}
                  </div>
                </div>

                <div className="h-px bg-border-color/50" />

                {/* Display Name */}
                <div className="space-y-3">
                  <label htmlFor="settings-display-name" className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    Nome de exibição
                  </label>
                  <input 
                    id="settings-display-name"
                    type="text" 
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                    placeholder="Seu nome"
                    title="Nome de exibição"
                  />
                  <p className="text-[11px] text-text-secondary font-bold ml-1 opacity-70">
                    Esse nome aparece no topo e no ranking.
                  </p>
                </div>

                {/* Email */}
                <div className="space-y-3">
                  <label htmlFor="settings-email" className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    E-mail
                  </label>
                  <input 
                    id="settings-email"
                    type="email" 
                    value={email}
                    className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-secondary font-bold opacity-70 cursor-not-allowed shadow-inner"
                    placeholder="E-mail"
                    title="E-mail"
                    readOnly
                  />
                </div>

                {/* City and School Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label htmlFor="settings-city" className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                      Cidade
                    </label>
                    <input 
                      id="settings-city"
                      type="text" 
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                      placeholder="Sua cidade"
                      title="Cidade"
                    />
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="settings-school" className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                      Escola
                    </label>
                    <input 
                      id="settings-school"
                      type="text" 
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                      placeholder="Sua escola"
                      title="Escola"
                    />
                  </div>
                </div>

                {/* Grêmio Estudantil (Opcional) */}
                <div className="space-y-3">
                  <label htmlFor="settings-gremio" className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    Grêmio estudantil <span className="text-text-secondary text-[10px] font-medium ml-2">(Opcional)</span>
                  </label>
                  <input 
                    id="settings-gremio"
                    type="text" 
                    value={gremio}
                    onChange={(e) => setGremio(e.target.value)}
                    className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                    placeholder="Nome do Grêmio"
                    title="Grêmio estudantil"
                  />
                  <p className="text-[11px] text-text-secondary font-bold ml-1 opacity-70">
                    Se você faz parte de um grêmio estudantil, identifique-o aqui.
                  </p>
                </div>

                {/* Língua Estrangeira */}
                <div className="space-y-3">
                  <label className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    Língua estrangeira (ENEM)
                  </label>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setLanguagePreference('ingles')}
                      className={`flex-1 py-4 rounded-2xl font-bold transition-all border-2 ${
                        languagePreference === 'ingles' 
                          ? 'bg-[#00b094]/10 border-[#00b094] text-[#00b094]' 
                          : 'bg-input-bg border-transparent text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      Inglês
                    </button>
                    <button 
                      onClick={() => setLanguagePreference('espanhol')}
                      className={`flex-1 py-4 rounded-2xl font-bold transition-all border-2 ${
                        languagePreference === 'espanhol' 
                          ? 'bg-[#00b094]/10 border-[#00b094] text-[#00b094]' 
                          : 'bg-input-bg border-transparent text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      Espanhol
                    </button>
                  </div>
                  <p className="text-[11px] text-text-secondary font-bold ml-1 opacity-70">
                    Sua escolha afetará as questões de língua estrangeira nos simulados.
                  </p>
                </div>

                {/* Daily Goal */}
                <div className="space-y-3">
                  <label htmlFor="settings-daily-goal" className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    Meta de horas diárias
                  </label>
                  <div className="relative">
                    <select 
                      id="settings-daily-goal"
                      defaultValue="2 Horas"
                      className="select-pill select-pill-lg w-full"
                      title="Meta de horas diárias"
                    >
                      <option>2 Horas</option>
                      <option>4 Horas</option>
                      <option>6 Horas</option>
                      <option>8 Horas</option>
                      <option>Tempo Livre</option>
                    </select>
                    <ChevronDown className="select-pill-chevron text-text-secondary" size={18} />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-10 pt-6">
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-[#00b094] hover:bg-[#00d1b0] text-white px-10 py-5 rounded-3xl font-bold text-[12px] shadow-lg shadow-[#00b094]/20 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <Spinner size={16} className="text-white" />
                    ) : saveStatus === 'success' ? (
                      <CheckCircle2 size={16} />
                    ) : null}
                    {saveStatus === 'success' ? 'Salvo!' : 'Salvar alterações'}
                  </button>
                  <button 
                    onClick={handleReset}
                    className="text-text-main hover:text-[#00b094] font-bold text-[12px] transition-all text-center py-2"
                  >
                    Restaurar padrões
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'notificacoes' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl"
            >
              <h3 className="text-2xl font-black text-text-main mb-10">Notificações</h3>
              
              <div className="space-y-12">
                {/* Emails de Progresso */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-black text-white mb-1">Emails de Progresso</h4>
                    <p className="text-text-secondary font-medium">Receber resumo semanal e lembretes de meta.</p>
                  </div>
                  <button 
                    onClick={() => setEmailNotifications(!emailNotifications)}
                    className="flex items-center gap-2 group cursor-pointer"
                  >
                    <div className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center ${emailNotifications ? 'bg-brand-primary border-brand-primary' : 'border-white/10 bg-white/5'}`}>
                      {emailNotifications && <Check size={14} className="text-white" />}
                    </div>
                  </button>
                </div>

                {/* Notificações no Navegador */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-black text-white mb-1">Notificações no Navegador</h4>
                    <p className="text-text-secondary font-medium">Alertas quando bater meta ou concluir simulado.</p>
                  </div>
                  <button 
                    onClick={() => setBrowserNotifications(!browserNotifications)}
                    className="flex items-center gap-2 group cursor-pointer"
                  >
                    <div className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center ${browserNotifications ? 'bg-brand-primary border-brand-primary' : 'border-white/10 bg-white/5'}`}>
                      {browserNotifications && <Check size={14} className="text-white" />}
                    </div>
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-10 pt-6">
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-brand-primary hover:bg-[#00d1b0] text-white px-10 py-5 rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Spinner size={16} className="text-white" />
                    ) : saveStatus === 'success' ? (
                      <CheckCircle2 size={16} />
                    ) : null}
                    {saveStatus === 'success' ? 'Salvo!' : 'Salvar Alterações'}
                  </button>
                  <button 
                    onClick={handleReset}
                    className="text-text-secondary hover:text-text-main font-black text-[12px] uppercase tracking-widest transition-all text-center py-2"
                  >
                    Restaurar Padrões
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'aparencia' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl w-full"
            >
              <h3 className="text-2xl font-black text-text-main mb-10">Aparência</h3>
              
              <div className="space-y-8">
                <div>
                  <h4 className="font-black text-text-main uppercase tracking-widest text-xs mb-2">Temas Personalizados</h4>
                  <p className="text-text-secondary text-[11px] font-bold mb-6">Personalize sua experiência escolhendo uma das opções de temas abaixo.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { 
                      id: 'default', 
                      name: 'Padrão', 
                      description: 'Utiliza os esquemas originais Claro e Escuro do aplicativo.',
                      primaryBgClass: 'bg-[#00b094]',
                      borderClass: 'border-[#00b094]',
                      bgPreviewClass: 'bg-[#0a0f1a]',
                      cardPreviewClass: 'bg-[#1e293b]',
                      glowClass: 'bg-[#00b094]',
                    },
                    { 
                      id: 'neva', 
                      name: 'Neva Pro', 
                      description: 'Tema premium suave baseado na estética Neva Pro.',
                      primaryBgClass: 'bg-[#0dccd6]',
                      borderClass: 'border-[#0dccd6]',
                      bgPreviewClass: 'bg-[#060b0d]',
                      cardPreviewClass: 'bg-[#0f181c]',
                      glowClass: 'bg-[#0dccd6]',
                    },
                    { 
                      id: 'cyberpunk', 
                      name: 'Cyberpunk', 
                      description: 'Tema escuro futurista com tons vibrantes neon.',
                      primaryBgClass: 'bg-[#d946ef]',
                      borderClass: 'border-[#d946ef]',
                      bgPreviewClass: 'bg-[#08070d]',
                      cardPreviewClass: 'bg-[#12101e]',
                      glowClass: 'bg-[#d946ef]',
                    },
                    { 
                      id: 'eighties', 
                      name: 'Anos 80', 
                      description: 'Visual synthwave com neon rosa, ciano e energia arcade.',
                      primaryBgClass: 'bg-[#ff0080]',
                      borderClass: 'border-[#ff0080]',
                      bgPreviewClass: 'bg-[#080313]',
                      cardPreviewClass: 'bg-[#140b24]',
                      glowClass: 'bg-[#ff0080]',
                    },
                    { 
                      id: 'forest', 
                      name: 'Moss Forest', 
                      description: 'Tema de tons verdes relaxantes e confortáveis.',
                      primaryBgClass: 'bg-[#10b981]',
                      borderClass: 'border-[#10b981]',
                      bgPreviewClass: 'bg-[#050806]',
                      cardPreviewClass: 'bg-[#0f1612]',
                      glowClass: 'bg-[#10b981]',
                    },
                    { 
                      id: 'dracula', 
                      name: 'Dracula', 
                      description: 'O clássico tema dracula com acento lilás.',
                      primaryBgClass: 'bg-[#cba6f7]',
                      borderClass: 'border-[#cba6f7]',
                      bgPreviewClass: 'bg-[#11111b]',
                      cardPreviewClass: 'bg-[#1e1e2e]',
                      glowClass: 'bg-[#cba6f7]',
                    },
                    { 
                      id: 'minimalist', 
                      name: 'Minimalista', 
                      description: 'Estética monochrome limpa e de alto contraste.',
                      primaryBgClass: 'bg-[#a1a1aa]',
                      borderClass: 'border-[#a1a1aa]',
                      bgPreviewClass: 'bg-[#09090b]',
                      cardPreviewClass: 'bg-[#18181b]',
                      glowClass: 'bg-[#a1a1aa]',
                    },
                    { 
                      id: 'retro', 
                      name: 'Retrô', 
                      description: 'Estética clássica de fósforo âmbar e papel sépia.',
                      primaryBgClass: 'bg-[#fe8019]',
                      borderClass: 'border-[#fe8019]',
                      bgPreviewClass: 'bg-[#0c0805]',
                      cardPreviewClass: 'bg-[#17100a]',
                      glowClass: 'bg-[#fe8019]',
                    },
                  ].map((t) => {
                    const isSelected = theme === t.id;
                    return (
                      <motion.button
                        key={t.id}
                        whileHover={{ scale: 1.01, y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => onThemeChange(t.id)}
                        className={`w-full text-left p-5 rounded-[24px] border-2 transition-all flex flex-col justify-between h-40 cursor-pointer relative overflow-hidden ${
                          isSelected 
                            ? 'bg-bg-sidebar/90 shadow-xl' 
                            : 'bg-bg-sidebar/30 border-transparent hover:bg-bg-sidebar/50'
                        } ${isSelected ? t.borderClass : 'border-transparent'}`}
                      >
                        {isSelected && (
                          <div 
                            className={`absolute -right-10 -bottom-10 w-28 h-28 rounded-full blur-3xl opacity-20 transition-all pointer-events-none ${t.glowClass}`}
                          />
                        )}

                        <div className="flex items-start justify-between w-full">
                          <div>
                            <h5 className="font-black text-text-main text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                              {t.name}
                              {isSelected && (
                                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${t.primaryBgClass}`} />
                              )}
                            </h5>
                            <p className="text-text-secondary text-[10px] font-bold leading-normal max-w-[170px] opacity-85">
                              {t.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 bg-black/20 p-1.5 rounded-xl border border-white/5 flex-shrink-0">
                            <span className={`w-3 h-3 rounded-full border border-white/10 ${t.primaryBgClass}`} />
                            <span className={`w-3 h-3 rounded-full border border-white/10 ${t.bgPreviewClass}`} />
                            <span className={`w-3 h-3 rounded-full border border-white/10 ${t.cardPreviewClass}`} />
                          </div>
                        </div>

                        <div className="w-full h-8 rounded-lg bg-black/10 border border-white/5 p-1.5 flex gap-1.5 items-center mt-3">
                          <div className={`w-4 h-4 rounded ${t.bgPreviewClass}`} />
                          <div className="flex-1 space-y-1">
                            <div className={`w-10 h-1 rounded-full ${t.primaryBgClass}`} />
                            <div className={`w-6 h-0.5 rounded-full opacity-20 ${t.cardPreviewClass}`} />
                          </div>
                          {isSelected && (
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white ${t.primaryBgClass}`}>
                              <Check size={10} className="stroke-[3]" />
                            </div>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'privacidade' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl"
            >
              <h3 className="text-2xl font-black text-text-main mb-10">Privacidade</h3>
              
              <div className="space-y-8">
                <div className="bg-bg-card border border-border-color p-8 rounded-[32px] space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-text-main uppercase tracking-widest text-xs">Visibilidade no Ranking</h4>
                      <p className="text-text-secondary text-[11px] font-bold opacity-70 mt-1">Sua pontuação aparecerá para outros alunos.</p>
                    </div>
                    <button 
                      onClick={() => setShowInLeaderboard(!showInLeaderboard)}
                      className={`w-14 h-8 rounded-full relative transition-all duration-300 ${showInLeaderboard ? 'bg-brand-primary' : 'bg-text-secondary/20'}`}
                      title="Alternar visibilidade no ranking"
                      aria-label="Alternar visibilidade no ranking"
                    >
                      <motion.div 
                        animate={{ x: showInLeaderboard ? 24 : 4 }}
                        className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>
                </div>

                {/* Alterar Senha de Acesso */}
                <div className="bg-bg-card border border-border-color p-8 rounded-[32px] space-y-6">
                  <div>
                    <h4 className="font-black text-text-main uppercase tracking-widest text-xs">Alterar Senha de Acesso</h4>
                    <p className="text-text-secondary text-[11px] font-bold opacity-70 mt-1">Troque sua senha de acesso periodicamente para maior segurança.</p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-secondary tracking-widest uppercase ml-1 opacity-50">Senha Atual</label>
                      <input 
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full bg-input-bg rounded-2xl px-6 py-4 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner text-sm"
                        placeholder="Digite sua senha atual"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-secondary tracking-widest uppercase ml-1 opacity-50">Nova Senha</label>
                        <input 
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full bg-input-bg rounded-2xl px-6 py-4 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner text-sm"
                          placeholder="Mínimo 6 caracteres"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-secondary tracking-widest uppercase ml-1 opacity-50">Confirmar Nova Senha</label>
                        <input 
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full bg-input-bg rounded-2xl px-6 py-4 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner text-sm"
                          placeholder="Confirme a nova senha"
                        />
                      </div>
                    </div>

                    {passwordError && (
                      <p className="text-red-500 font-bold text-xs uppercase tracking-wider ml-1">{passwordError}</p>
                    )}

                    {passwordStatus === 'success' && (
                      <p className="text-brand-primary font-bold text-xs uppercase tracking-wider ml-1">Senha atualizada com sucesso!</p>
                    )}
                    
                    <button 
                      onClick={handleChangePassword}
                      disabled={passwordStatus === 'loading'}
                      className="bg-brand-primary hover:bg-[#00d1b0] text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2.5 disabled:opacity-50"
                    >
                      {passwordStatus === 'loading' && <Spinner size={14} className="text-white" />}
                      Atualizar Senha
                    </button>
                  </div>
                </div>

                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-[#00b094] hover:bg-[#00d1b0] text-white px-10 py-5 rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-[#00b094]/20 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"
                >
                  {isSaving && <Spinner size={16} className="text-white" />}
                  Salvar Preferências de Privacidade
                </button>

                <div className="pt-12 border-t border-border-color mt-12 space-y-6">
                   <h4 className="text-red-500 font-black text-xs uppercase tracking-widest">Usuário</h4>
                   
                   {/* Consent Reset */}
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-orange-500/10 rounded-2xl border border-orange-500/25 shadow-md shadow-orange-500/5 hover:bg-orange-500/15 hover:border-orange-500/40 transition-all">
                      <div>
                        <p className="text-text-main font-black text-xs uppercase tracking-wider mb-1">Preferências de consentimento</p>
                        <p className="text-text-secondary text-xs font-semibold opacity-90 leading-relaxed">Redefinir todas as permissões de rastreamento e cookies.</p>
                      </div>
                      <button 
                        onClick={() => (window as any).showCookiePreferences?.()}
                        className="bg-orange-500/10 hover:bg-orange-500 text-orange-500 hover:text-white px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow-orange-500/20 active:scale-95 whitespace-nowrap"
                      >
                        Gerenciar cookies
                      </button>
                   </div>

                   {/* Danger Zone Container */}
                   <div className="p-6 bg-red-500/10 rounded-2xl border border-red-500/25 shadow-md shadow-red-500/5 hover:bg-red-500/15 hover:border-red-500/40 transition-all space-y-6">
                      <div className="flex items-start gap-4">
                         <div className="p-3 bg-red-500/15 rounded-2xl text-red-500 flex-shrink-0">
                            <AlertTriangle size={20} className="animate-pulse" />
                         </div>
                         <div>
                            <h5 className="text-red-500 font-black text-xs uppercase tracking-widest mb-1.5">Aviso Importante</h5>
                            <p className="text-text-secondary text-xs font-semibold opacity-90 leading-relaxed">
                               Ao excluir seu perfil, você perderá permanentemente todo o seu progresso de estudos, XP acumulado e conquistas. Esta ação não poderá ser desfeita de forma alguma.
                            </p>
                         </div>
                      </div>
                      <button 
                       onClick={handleDeleteProfile}
                       disabled={isDeleting}
                       className="bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2.5 disabled:opacity-50 w-full md:w-auto shadow-sm hover:shadow-red-500/25"
                      >
                        {isDeleting && <Spinner size={14} className="text-white" />}
                        Excluir meu perfil
                      </button>
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab !== 'perfil' && activeTab !== 'privacidade' && activeTab !== 'notificacoes' && activeTab !== 'aparencia' && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="bg-text-main/5 p-8 rounded-full mb-6 text-text-secondary">
                <Shield size={48} />
              </div>
              <h3 className="text-text-main font-black text-xl mb-2">Em Breve</h3>
              <p className="text-text-secondary font-bold max-w-xs uppercase text-[10px] tracking-widest">
                Esta seção está sendo finalizada pela nossa equipe de desenvolvimento.
              </p>
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-bg-card border border-border-color rounded-[32px] w-full max-w-md p-8 shadow-2xl relative animate-in fade-in"
            >
              <h3 className="text-xl font-black text-text-main uppercase tracking-tight mb-3">Excluir Perfil</h3>
              <p className="text-text-secondary font-medium text-sm leading-relaxed mb-6">
                Tem certeza que deseja excluir seu perfil? Esta ação <strong className="text-red-500">não pode ser desfeita</strong> e todos os seus dados serão permanentemente perdidos.
              </p>
              
              {deleteError && (
                <p className="text-red-500 font-bold text-xs mb-4 uppercase tracking-wider">{deleteError}</p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                  className="px-5 py-3 bg-text-secondary/10 hover:bg-text-secondary/20 text-text-main font-bold rounded-xl text-xs uppercase tracking-widest transition-all cursor-pointer"
                  disabled={isDeleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteProfile}
                  className="px-5 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2"
                  disabled={isDeleting}
                >
                  {isDeleting && <Spinner size={12} className="text-white" />}
                  Excluir Permanentemente
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
