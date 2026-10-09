import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Mail, Lock, UserPlus, MapPin, School, Flag, Check, AlertCircle } from 'lucide-react';
import Logo from './Logo';
import { userService } from '../services/userService';
import { UserProfile } from '../types';
import Spinner from './Spinner';
import cidadesEscolasData from '../data/cidades_escolas.json';
import { preloadRecaptcha } from '../lib/recaptcha';

interface LoginProps {
  onLogin: (user: UserProfile) => void;
  onTabChange: (tab: string) => void;
}

export default function Login({ onLogin, onTabChange }: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [school, setSchool] = useState('');
  const [gremio, setGremio] = useState('');

  const [authError, setAuthError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const uniqueCities = useMemo(() => {
    const cities = cidadesEscolasData.map(item => item.city);
    return Array.from(new Set(cities)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, []);

  const availableSchools = useMemo(() => {
    if (!city) return [];
    return cidadesEscolasData
      .filter(item => item.city === city)
      .map(item => item.school)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [city]);

  // Load remembered email on mount & preload reCAPTCHA script
  useEffect(() => {
    void preloadRecaptcha().catch(() => {});
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Clear errors when changing modes
  useEffect(() => {
    setAuthError(null);
    setSuccessMessage(null);
  }, [isRegistering, isResettingPassword]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError(null);
    setSuccessMessage(null);

    try {
      if (isResettingPassword) {
        const res = await userService.forgotPassword(email);
        setSuccessMessage(res.message || 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em instantes.');
        setIsLoading(false);
        return;
      } else if (isRegistering) {
        // Register Common User in DB table
        const res = await userService.register({
          name,
          email,
          password,
          city,
          school,
          gremio
        });

        if (res.success) {
          // Automatic Login
          onLogin(res.user);
        }
      } else {
        // Handle Remember Me
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }

        // Login flow: calls server which differentiates Admin vs Student
        const res = await userService.login({ email, password });
        if (res.success) {
          onLogin(res.user);
        }
      }
    } catch (error: any) {
      console.error('Auth Error:', error);
      setAuthError(error.message || 'Verifique suas credenciais e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] relative overflow-hidden bg-bg-main">
      {/* Background blobs for aesthetic */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-apple-blue/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/5 blur-[100px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-lg z-10"
      >
        <div className="text-center mb-10">
          <Logo className="h-36 w-full justify-center" onClick={() => { setIsRegistering(false); setIsResettingPassword(false); }} title="Neva PRO - Página Inicial" />
          <p className="text-text-secondary mt-4 font-medium uppercase tracking-[0.2em] text-[10px]">A evolução dos seus estudos começa aqui.</p>
        </div>

        <div className="bg-bg-card/80 backdrop-blur-xl rounded-[40px] shadow-2xl p-8 md:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={isResettingPassword ? 'reset' : isRegistering ? 'register' : 'login'}
              initial={{ opacity: 0, x: isRegistering || isResettingPassword ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRegistering || isResettingPassword ? -20 : 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-8">
                <span className="text-brand-primary text-[10px] font-black tracking-widest uppercase mb-1 block">
                  {isResettingPassword ? 'Recuperação' : 'Portal do Aluno'}
                </span>
                <h2 className="text-3xl font-black text-text-main">
                  {isResettingPassword ? 'Redefinir senha' : isRegistering ? 'Nova conta' : 'Acesse sua conta'}
                </h2>
              </div>

              <AnimatePresence>
                {authError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="p-4 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-start gap-3 shadow-inner"
                  >
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-black uppercase tracking-wider mb-0.5" id="auth-error-title">Erro no acesso</p>
                      <p className="text-xs font-medium text-red-400/90 leading-relaxed" id="auth-error-desc">{authError}</p>
                    </div>
                  </motion.div>
                )}
                {successMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="p-4 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-start gap-3 shadow-inner"
                  >
                    <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-black uppercase tracking-wider mb-0.5" id="auth-success-title">Sucesso</p>
                      <p className="text-xs font-medium text-emerald-400/90 leading-relaxed" id="auth-success-desc">{successMessage}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="space-y-5">
                {isResettingPassword ? (
                  <div className="space-y-6">
                    <p className="text-sm text-text-secondary font-medium">Informe seu e-mail cadastrado para enviarmos um link de recuperação.</p>
                    <div>
                      <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">E-mail</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={18} />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="w-full bg-input-bg rounded-2xl py-4 pl-12 pr-4 text-text-main font-bold focus:outline-none focus:border-brand-primary/50 transition-all shadow-inner"
                          placeholder="seu@email.com"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-5 rounded-3xl font-black uppercase tracking-[0.3em] text-xs transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {isLoading ? <Spinner size={20} className="text-white" /> : 'Enviar link de recuperação'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsResettingPassword(false)}
                      className="w-full text-[10px] font-black text-text-secondary uppercase tracking-widest hover:text-brand-primary transition-colors"
                    >
                      Voltar ao login
                    </button>
                  </div>
                ) : (
                  <>
                    {isRegistering && (
                      <>
                        <div>
                          <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">Nome Completo</label>
                          <div className="relative group">
                            <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={18} />
                            <input
                              type="text"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              required
                              className="w-full bg-input-bg rounded-2xl py-4 pl-12 pr-4 text-text-main font-bold focus:outline-none focus:border-brand-primary/50 transition-all shadow-inner"
                              placeholder="Informe o seu Nome"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label htmlFor="select-city" className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">Cidade</label>
                            <div className="relative group">
                              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors z-10" size={18} />
                              <select
                                id="select-city"
                                title="Selecione sua cidade"
                                value={city}
                                onChange={(e) => {
                                  setCity(e.target.value);
                                  setSchool('');
                                }}
                                required
                                className="select-pill select-pill-lg w-full pl-12 relative z-0"
                              >
                                <option value="">Selecione sua cidade</option>
                                {uniqueCities.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              <div className="select-pill-chevron opacity-50 z-10">
                                <ArrowRight className="rotate-90 text-text-secondary" size={14} />
                              </div>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="select-school" className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">Escola</label>
                            <div className="relative group">
                              <School className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors z-10" size={18} />
                              <select
                                id="select-school"
                                title="Selecione sua escola"
                                value={school}
                                onChange={(e) => setSchool(e.target.value)}
                                required
                                disabled={!city}
                                className="select-pill select-pill-lg w-full pl-12 relative z-0"
                              >
                                <option value="">{city ? "Selecione sua escola" : "Selecione uma cidade primeiro"}</option>
                                {availableSchools.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <div className="select-pill-chevron opacity-50 z-10">
                                <ArrowRight className="rotate-90 text-text-secondary" size={14} />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">Grêmio Estudantil <span className="opacity-50">(Opcional)</span></label>
                          <div className="relative group">
                            <Flag className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={18} />
                            <input
                              type="text"
                              value={gremio}
                              onChange={(e) => setGremio(e.target.value)}
                              className="w-full bg-input-bg rounded-2xl py-4 pl-12 pr-4 text-text-main font-bold focus:outline-none focus:border-brand-primary/50 transition-all shadow-inner"
                              placeholder="Informe o seu Grêmio Estudantil"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">E-mail</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={18} />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="w-full bg-input-bg rounded-2xl py-4 pl-12 pr-4 text-text-main font-bold focus:outline-none focus:border-brand-primary/50 transition-all shadow-inner"
                          placeholder="seu@email.com"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">Senha</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={18} />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          title="A senha deve ter no mínimo 6 caracteres"
                          className="w-full bg-input-bg rounded-2xl py-4 pl-12 pr-4 text-text-main font-bold focus:outline-none focus:border-brand-primary/50 transition-all shadow-inner"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>

                    {!isRegistering && (
                      <div className="flex items-center justify-between px-2">
                        <button
                          type="button"
                          onClick={() => setRememberMe(!rememberMe)}
                          className="flex items-center gap-2 group cursor-pointer"
                        >
                          <div className={`w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center ${rememberMe ? 'bg-brand-primary border-brand-primary shadow-md' : 'border-text-secondary/20 bg-input-bg'}`}>
                            {rememberMe && <Check size={14} className="text-white" />}
                          </div>
                          <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest group-hover:text-brand-primary transition-colors">Lembrar-me</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsResettingPassword(true)}
                          className="text-[10px] font-black text-brand-primary uppercase tracking-widest hover:underline"
                        >
                          Esqueceu a senha?
                        </button>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-5 mt-4 rounded-3xl font-black uppercase tracking-[0.3em] text-xs transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-3 group active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {isLoading ? (
                        <Spinner size={20} className="text-white" />
                      ) : (
                        <>
                          {isRegistering ? 'Cadastrar' : 'Acessar'}
                          <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                  </>
                )}
              </form>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 pt-8 border-t border-transparent text-center">
            <p className="text-xs text-text-secondary font-bold uppercase tracking-widest">
              {isResettingPassword ? '' : isRegistering ? 'Já tem uma conta?' : 'Ainda não é membro?'}
              {!isResettingPassword && (
                <button
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="ml-2 text-brand-primary font-black hover:underline"
                >
                  {isRegistering ? 'Fazer login' : 'Cadastre-se agora'}
                </button>
              )}
            </p>
          </div>
        </div>

        <div className="mt-10 text-center space-y-4">
          <div className="flex justify-center gap-6">
            <button
              onClick={() => onTabChange('privacidade')}
              className="text-[9px] font-black uppercase text-text-secondary hover:text-brand-primary tracking-widest transition-colors"
            >
              Privacidade
            </button>
            <button
              onClick={() => onTabChange('cookies')}
              className="text-[9px] font-black uppercase text-text-secondary hover:text-brand-primary tracking-widest transition-colors"
            >
              Cookies
            </button>
          </div>
          <p className="text-[9px] text-text-secondary font-black uppercase tracking-[0.3em] opacity-40">
            &copy; 2026 Neva Pro
          </p>
        </div>
      </motion.div>
    </div>
  );
}
