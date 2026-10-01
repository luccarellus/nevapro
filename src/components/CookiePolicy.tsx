import { motion } from 'motion/react';
import { Cookie, ArrowLeft } from 'lucide-react';

interface CookiePolicyProps {
  onBack?: () => void;
}

export default function CookiePolicy({ onBack }: CookiePolicyProps) {
  return (
    <div className="max-w-4xl mx-auto pt-24 pb-32 px-4 md:px-8 relative">
      {onBack && (
        <button 
          onClick={onBack}
          className="absolute top-10 left-4 md:left-8 flex items-center gap-2 text-[10px] font-black uppercase text-text-secondary hover:text-brand-primary tracking-widest transition-colors group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Voltar
        </button>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <header className="mb-12">
          <div className="w-16 h-16 bg-brand-primary/10 text-brand-primary rounded-3xl flex items-center justify-center mb-6">
            <Cookie size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-text-main tracking-tighter uppercase leading-none">Uso de Cookies</h1>
          <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.3em] mt-4 opacity-50">Transparência Digital e Preferências</p>
        </header>

        <div className="prose prose-invert max-w-none space-y-12 text-text-secondary font-medium">
          <section>
            <h2 className="text-xl font-black text-text-main uppercase tracking-widest mb-4">O que são Cookies?</h2>
            <p className="leading-relaxed">
              Cookies são pequenos arquivos de texto enviados pelo nosso servidor para o seu navegador, que são armazenados no seu dispositivo para fornecer uma experiência mais fluida e personalizada.
            </p>
          </section>

          <div className="space-y-6">
             <h2 className="text-xl font-black text-text-main uppercase tracking-widest mb-4">Tipos de Cookies Utilizados</h2>
             
             <div className="space-y-4">
                <div className="p-8 bg-bg-card border border-border-color rounded-[32px]">
                   <h4 className="font-black text-brand-primary uppercase tracking-widest text-xs mb-2">Necessários (Ativos)</h4>
                   <p className="text-sm leading-relaxed mb-4">Essenciais para que você possa fazer login, realizar questões e manter suas sessões de estudo seguras.</p>
                   <div className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest border-t border-border-color pt-4">EXEMPLOS: AUTH_TOKEN, SESSION_ID</div>
                </div>

                <div className="p-8 bg-bg-card border border-border-color rounded-[32px]">
                   <h4 className="font-black text-blue-400 uppercase tracking-widest text-xs mb-2">Desempenho & Análise</h4>
                   <p className="text-sm leading-relaxed mb-4">Utilizamos para monitorar quais simulados e materiais são mais acessados, permitindo que nossa equipe pedagógica priorize novos conteúdos.</p>
                   <div className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest border-t border-border-color pt-4">EXEMPLOS: Google Analytics (_ga)</div>
                </div>

                <div className="p-8 bg-bg-card border border-border-color rounded-[32px]">
                   <h4 className="font-black text-orange-400 uppercase tracking-widest text-xs mb-2">Funcionalidade & Preferências</h4>
                   <p className="text-sm leading-relaxed mb-4">Lembram escolha de idioma, tema escuro/claro e filtros de questões que você aplicou anteriormente.</p>
                   <div className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest border-t border-border-color pt-4">EXEMPLOS: THEME_MODE, NAV_STATE</div>
                </div>
             </div>
          </div>

          <section className="bg-bg-card p-10 rounded-[40px] border border-border-color text-center">
             <h2 className="text-2xl font-black text-text-main uppercase tracking-tighter mb-4">Como gerenciar meus cookies?</h2>
             <p className="text-sm mb-8 leading-relaxed">Você pode alterar suas preferências a qualquer momento clicando no botão fixo <span className="text-brand-primary">"Gerenciar Cookies"</span> localizado no rodapé da página ou através das configurações do seu navegador.</p>
             <div className="flex flex-wrap justify-center gap-4">
                <button 
                  onClick={() => window.location.reload()}
                  className="px-8 py-4 bg-bg-sidebar border border-border-color rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-bg-main transition-all"
                >
                  Limpar todos os dados locais
                </button>
             </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
