import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Shield, Check, Info } from 'lucide-react';
import { useConsent } from '../hooks/useConsent';
import { ConsentPreferences } from '../types/consent';

interface CookieModalProps {
  onClose: () => void;
  onSave: () => void;
}

export default function CookieModal({ onClose, onSave }: CookieModalProps) {
  const { preferences, updateConsent } = useConsent();
  
  const [tempPrefs, setTempPrefs] = useState<ConsentPreferences>(
    preferences || {
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
      updatedAt: Date.now()
    }
  );

  const toggleCategory = (category: keyof ConsentPreferences) => {
    if (category === 'necessary') return; // Cannot disable necessary
    setTempPrefs(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleSave = () => {
    updateConsent(tempPrefs);
    onSave();
  };

  const categories = [
    { 
      id: 'necessary', 
      label: 'Estritamente Necessários', 
      desc: 'Essenciais para o funcionamento do portal. Não podem ser desativados.',
      required: true
    },
    { 
      id: 'analytics', 
      label: 'Análise & Estatísticas', 
      desc: 'Ajudam-nos a entender como os alunos utilizam o portal para melhorarmos continuamente.',
      required: false
    },
    { 
      id: 'marketing', 
      label: 'Marketing & Publicidade', 
      desc: 'Utilizados para exibir avisos relevantes e parcerias educacionais de seu interesse.',
      required: false
    },
    { 
      id: 'preferences', 
      label: 'Preferências do Usuário', 
      desc: 'Permitem que o portal lembre suas escolhas, como idioma e tema visual.',
      required: false
    }
  ];

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-bg-sidebar border border-border-color shadow-2xl rounded-[40px] w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-border-color flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand-primary/10 rounded-2xl text-brand-primary">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Preferências de Cookies</h2>
              <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] opacity-50">Transparência & LGPD</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-bg-card rounded-full transition-all text-text-secondary">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6">
          <div className="bg-bg-card/50 border border-border-color rounded-3xl p-6 mb-4">
            <div className="flex gap-4 items-start">
              <Info size={18} className="text-brand-primary shrink-0 mt-1" />
              <p className="text-xs text-text-secondary leading-relaxed font-bold italic">
                Respeitamos sua privacidade de acordo com a <span className="text-text-main">Lei Geral de Proteção de Dados (LGPD)</span>. Você pode alterar essas configurações a qualquer momento no rodapé do portal.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {categories.map((cat) => (
              <div 
                key={cat.id}
                onClick={() => toggleCategory(cat.id as any)}
                className={`p-6 rounded-[32px] border transition-all cursor-pointer group ${
                  tempPrefs[cat.id as keyof ConsentPreferences] 
                  ? 'bg-brand-primary/5 border-brand-primary/20' 
                  : 'bg-bg-card border-border-color opacity-80 grayscale-[0.5]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-black text-xs uppercase tracking-widest text-text-main">{cat.label}</h4>
                      {cat.required && (
                        <span className="text-[9px] font-black bg-text-main/10 text-text-secondary px-2 py-0.5 rounded-full uppercase tracking-widest">Obrigatório</span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-secondary font-medium leading-relaxed">{cat.desc}</p>
                  </div>
                  
                  <div className={`w-14 h-8 rounded-full relative transition-all duration-300 ${
                    tempPrefs[cat.id as keyof ConsentPreferences] ? 'bg-brand-primary' : 'bg-text-secondary/20'
                  } ${cat.required ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <motion.div 
                      animate={{ x: tempPrefs[cat.id as keyof ConsentPreferences] ? 24 : 4 }}
                      className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm flex items-center justify-center"
                    >
                       {tempPrefs[cat.id as keyof ConsentPreferences] && <Check size={12} className="text-brand-primary font-black" />}
                    </motion.div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 border-t border-border-color bg-bg-card/30 flex flex-col sm:flex-row items-center gap-4 shrink-0">
          <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest text-center sm:text-left flex-1 opacity-50">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>
          <div className="flex items-center gap-3 w-full sm:w-auto">
             <button
              onClick={onClose}
              className="px-8 py-4 rounded-full border border-border-color text-[11px] font-black uppercase tracking-widest text-text-secondary hover:bg-bg-card transition-all flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-10 py-4 rounded-full bg-brand-primary text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20 hover:bg-brand-secondary transition-all active:scale-95 flex-1 sm:flex-none"
            >
              Salvar Preferências
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
