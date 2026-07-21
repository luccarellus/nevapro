import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, Loader2, Check, AlertCircle, ArrowLeft } from 'lucide-react';
import Logo from './Logo';
import { executeRecaptcha } from '../lib/recaptcha';

interface ResetPasswordProps {
  onBack: () => void;
}

export default function ResetPassword({ onBack }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  const getTokensFromHash = (): { access_token?: string } => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return {
      access_token: params.get('access_token') || undefined,
    };
  };

  useEffect(() => {
    const { access_token } = getTokensFromHash();
    if (!access_token || !window.location.hash.includes('type=recovery')) {
      setIsValidSession(false);
      return;
    }
    setIsValidSession(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    const { access_token } = getTokensFromHash();
    if (!access_token) {
      setError('Token de recuperação ausente. O link pode ter expirado.');
      return;
    }

    setIsLoading(true);

    try {
      // Obtém token reCAPTCHA (fallback silencioso se não configurado)
      const recaptcha_token = await executeRecaptcha('reset_password').catch(() => '');

      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          password,
          access_token,
          recaptcha_token,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao redefinir senha.');
      }

      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        window.location.hash = '';
        onBack();
      }, 3000);
    } catch (err: any) {
      setError(err?.message || 'Erro ao redefinir senha. O link pode ter expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg-main">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="bg-bg-card/80 backdrop-blur-xl rounded-[40px] shadow-2xl p-8 md:p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-2xl font-black text-text-main mb-3">Link inválido</h2>
            <p className="text-text-secondary text-sm mb-8">
              Este link de recuperação é inválido ou expirou. Solicite um novo link na página de login.
            </p>
            <button
              onClick={onBack}
              className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-4 rounded-3xl font-black uppercase tracking-[0.3em] text-xs transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft size={18} />
              Voltar ao login
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg-main">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="bg-bg-card/80 backdrop-blur-xl rounded-[40px] shadow-2xl p-8 md:p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-black text-text-main mb-3">Senha redefinida!</h2>
            <p className="text-text-secondary text-sm">
              Sua senha foi atualizada com sucesso. Redirecionando para o login...
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (isValidSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg-main">
        <Loader2 className="animate-spin w-8 h-8 text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg-main">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Logo className="h-24 w-full justify-center" />
        </div>

        <div className="bg-bg-card/80 backdrop-blur-xl rounded-[40px] shadow-2xl p-8 md:p-12">
          <span className="text-brand-primary text-[10px] font-black tracking-widest uppercase mb-1 block">
            Recuperação
          </span>
          <h2 className="text-3xl font-black text-text-main mb-2">Nova senha</h2>
          <p className="text-text-secondary text-sm mb-8">
            Escolha uma nova senha para sua conta.
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-red-400/90">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">
                Nova senha
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-input-bg rounded-2xl py-4 pl-12 pr-4 text-text-main font-bold focus:outline-none focus:border-brand-primary/50 transition-all shadow-inner"
                  placeholder="Mínimo de 6 caracteres"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 ml-2">
                Confirmar senha
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={18} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-input-bg rounded-2xl py-4 pl-12 pr-4 text-text-main font-bold focus:outline-none focus:border-brand-primary/50 transition-all shadow-inner"
                  placeholder="Repita a nova senha"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-5 rounded-3xl font-black uppercase tracking-[0.3em] text-xs transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Redefinir senha'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
