import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Bell, 
  Palette, 
  Shield, 
  X, 
  ChevronDown,
  CheckCircle2,
  Loader2,
  Check
} from 'lucide-react';
import { UserProfile } from '../types';
import { userService } from '../services/userService';

interface SettingsProps {
  user: UserProfile;
  onUpdateUser: (user: UserProfile) => void;
  onClose: () => void;
}

type SettingsTab = 'perfil' | 'notificacoes' | 'aparencia' | 'privacidade';

export default function Settings({ user, onUpdateUser, onClose }: SettingsProps) {
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
    <div className="max-w-5xl mx-auto pt-24 pb-32 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-card/50 backdrop-blur-xl rounded-[40px] overflow-hidden shadow-2xl flex flex-col md:flex-row min-h-[600px]"
      >
        {/* Internal Sidebar */}
        <div className="w-full md:w-72 bg-bg-sidebar/80 p-8">
          <h2 className="text-3xl font-black text-text-main mb-12 tracking-tight">Configurações</h2>
          
          <nav className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-sm ${
                  activeTab === item.id 
                    ? 'text-[#00b094]' 
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
        <div className="flex-1 p-12 relative overflow-y-auto max-h-[80vh]">
          <button 
            onClick={onClose}
            className="absolute top-10 right-10 text-text-secondary hover:text-text-main transition-all"
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
                {/* Display Name */}
                <div className="space-y-3">
                  <label className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    Nome de exibição
                  </label>
                  <input 
                    type="text" 
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                    placeholder="Seu nome"
                  />
                  <p className="text-[11px] text-text-secondary font-bold ml-1 opacity-70">
                    Esse nome aparece no topo e no ranking.
                  </p>
                </div>

                {/* Email */}
                <div className="space-y-3">
                  <label className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    E-mail
                  </label>
                  <input 
                    type="email" 
                    value={email}
                    className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-secondary font-bold opacity-70 cursor-not-allowed shadow-inner"
                    readOnly
                  />
                </div>

                {/* City and School Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                      Cidade
                    </label>
                    <input 
                      type="text" 
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                      placeholder="Sua cidade"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                      Escola
                    </label>
                    <input 
                      type="text" 
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                      placeholder="Sua escola"
                    />
                  </div>
                </div>

                {/* Grêmio Estudantil (Opcional) */}
                <div className="space-y-3">
                  <label className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    Grêmio estudantil <span className="text-text-secondary text-[10px] font-medium ml-2">(Opcional)</span>
                  </label>
                  <input 
                    type="text" 
                    value={gremio}
                    onChange={(e) => setGremio(e.target.value)}
                    className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                    placeholder="Nome do Grêmio"
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
                  <label className="text-[12px] font-bold text-text-main ml-1 opacity-70">
                    Meta de horas diárias
                  </label>
                  <div className="relative">
                    <select 
                      defaultValue="2 Horas"
                      className="w-full bg-input-bg rounded-2xl px-6 py-5 text-text-main font-bold appearance-none cursor-pointer focus:outline-none focus:border-[#00b094]/50 transition-all shadow-inner"
                    >
                      <option>2 Horas</option>
                      <option>4 Horas</option>
                      <option>6 Horas</option>
                      <option>8 Horas</option>
                      <option>Tempo Livre</option>
                    </select>
                    <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" size={18} />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-10 pt-6">
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-[#00b094] hover:bg-[#00d1b0] text-white px-10 py-5 rounded-3xl font-bold text-[12px] shadow-lg shadow-[#00b094]/20 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : saveStatus === 'success' ? (
                      <CheckCircle2 size={16} />
                    ) : null}
                    {saveStatus === 'success' ? 'Salvo!' : 'Salvar alterações'}
                  </button>
                  <button 
                    onClick={handleReset}
                    className="text-text-main hover:text-[#00b094] font-bold text-[12px] transition-all"
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
                <div className="flex items-center gap-10 pt-6">
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-brand-primary hover:bg-[#00d1b0] text-white px-10 py-5 rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : saveStatus === 'success' ? (
                      <CheckCircle2 size={16} />
                    ) : null}
                    {saveStatus === 'success' ? 'Salvo!' : 'Salvar Alterações'}
                  </button>
                  <button 
                    onClick={handleReset}
                    className="text-text-secondary hover:text-text-main font-black text-[12px] uppercase tracking-widest transition-all"
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
              className="max-w-xl"
            >
              <h3 className="text-2xl font-black text-text-main mb-10">Aparência</h3>
              
              <div className="space-y-8">
                <div className="bg-bg-sidebar/50 border border-border-color p-8 rounded-[32px] space-y-6 opacity-50">
                   <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-text-main uppercase tracking-widest text-xs">Temas Personalizados</h4>
                      <p className="text-text-secondary text-[11px] font-bold mt-1">Escolha entre o modo claro, escuro ou automatizado.</p>
                    </div>
                    <span className="text-[9px] font-black bg-text-main/5 text-text-secondary px-3 py-1.5 rounded-full uppercase tracking-widest">Em breve</span>
                  </div>
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
                    >
                      <motion.div 
                        animate={{ x: showInLeaderboard ? 24 : 4 }}
                        className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>
                </div>

                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-[#00b094] hover:bg-[#00d1b0] text-white px-10 py-5 rounded-3xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-[#00b094]/20 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"
                >
                  {isSaving && <Loader2 size={16} className="animate-spin" />}
                  Salvar Preferências de Privacidade
                </button>

                <div className="pt-12 border-t border-border-color mt-12">
                   <h4 className="text-red-500 font-bold text-sm mb-4">Usuário</h4>
                   {/* Consent Reset */}
                   <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-orange-500/5 rounded-2xl border border-orange-500/10">
                      <div>
                        <p className="text-text-main font-bold text-[10px] mb-1">Preferências de consentimento</p>
                        <p className="text-text-secondary text-[11px] font-bold opacity-70">Redefinir todas as permissões de rastreamento e cookies.</p>
                      </div>
                      <button 
                        onClick={() => (window as any).showCookiePreferences?.()}
                        className="bg-orange-500/10 hover:bg-orange-500 text-orange-500 hover:text-white px-6 py-3 rounded-xl font-bold text-[9px] transition-all"
                      >
                        Gerenciar cookies
                      </button>
                   </div>

                   <p className="text-text-secondary text-xs font-bold mb-6 opacity-70">
                     Ao excluir seu perfil, você perderá todo o seu progresso, XP e conquistas. Esta ação não pode ser desfeita.
                   </p>
                   <button 
                    onClick={handleDeleteProfile}
                    disabled={isDeleting}
                    className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-8 py-4 rounded-2xl font-bold text-[10px] transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                   >
                     {isDeleting ? <Loader2 size={14} className="animate-spin" /> : null}
                     Excluir meu perfil
                   </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab !== 'perfil' && activeTab !== 'privacidade' && activeTab !== 'notificacoes' && (
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
                  {isDeleting && <Loader2 size={12} className="animate-spin" />}
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
