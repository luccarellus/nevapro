import React from 'react';
import { motion } from 'motion/react';
import { Shield, ArrowLeft } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack?: () => void;
}

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
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
            <Shield size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-text-main tracking-tighter uppercase leading-none">Política de Privacidade</h1>
          <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.3em] mt-4 opacity-50">Adequação à LGPD (Lei Geral de Proteção de Dados)</p>
        </header>

        <div className="prose prose-invert max-w-none space-y-12 text-text-secondary font-medium">
          <section>
            <h2 className="text-xl font-black text-text-main uppercase tracking-widest mb-4">1. Introdução</h2>
            <p className="leading-relaxed">
              Respeitamos sua privacidade e estamos comprometidos em proteger seus dados pessoais. Esta política descreve como coletamos, usamos e protegemos suas informações ao utilizar o portal Neva.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-text-main uppercase tracking-widest mb-4">2. Dados Coletados</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Dados de Identificação: Nome, e-mail e informações do perfil.</li>
              <li>Dados de Desempenho: XP, nível, histórico de questões e progresso nos estudos.</li>
              <li>Dados Técnicos: Endereço IP (anonimizado), tipo de dispositivo e informações de navegação.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-black text-text-main uppercase tracking-widest mb-4">3. Finalidade do Tratamento</h2>
            <p className="leading-relaxed">
              Tratamos seus dados para:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Prover acesso às funcionalidades do portal de estudos.</li>
              <li>Personalizar sua experiência de aprendizado baseada no seu nível e preferências.</li>
              <li>Gerenciar o ranking global (se habilitado por você).</li>
              <li>Cumprir obrigações legais e prevenir fraudes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-black text-text-main uppercase tracking-widest mb-4">4. Seus Direitos (Art. 18 LGPD)</h2>
            <p className="mb-6">Você tem o direito de:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {[
                 'Confirmar a existência do tratamento de dados',
                 'Acessar seus dados pessoais gratuitamente',
                 'Corrigir dados incompletos ou inexatos',
                 'Solicitar a exclusão definitiva do seu perfil',
                 'Revogar consentimentos a qualquer momento',
                 'Portabilidade dos dados para outro fornecedor'
               ].map((d, i) => (
                 <div key={i} className="p-4 bg-bg-card border border-border-color rounded-2xl text-[11px] font-black uppercase tracking-widest flex gap-3">
                   <div className="w-4 h-4 bg-brand-primary rounded-full shrink-0" />
                   {d}
                 </div>
               ))}
            </div>
          </section>

          <section className="p-8 bg-brand-primary/5 rounded-[32px] border border-brand-primary/10">
            <h2 className="text-xl font-black text-text-main uppercase tracking-widest mb-4 text-center">Encarregado de Dados (DPO)</h2>
            <p className="text-center text-sm mb-6">Para qualquer dúvida sobre seus dados, entre em contato através do canal oficial:</p>
            <div className="flex justify-center">
              <a href="mailto:privacidade@neva.pro" className="bg-brand-primary text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-brand-primary/20">privacidade@neva.pro</a>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
