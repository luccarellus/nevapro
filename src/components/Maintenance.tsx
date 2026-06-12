import { motion } from 'motion/react';
import { Wrench } from 'lucide-react';

export default function Maintenance() {
  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      {/* Background accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-primary/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-main/20 rounded-full blur-[120px]" />

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 max-w-lg w-full bg-surface/60 backdrop-blur-xl border border-border-color rounded-3xl p-8 sm:p-12 text-center shadow-2xl"
      >
        <motion.div
          initial={{ rotate: -15 }}
          animate={{ rotate: 15 }}
          transition={{ 
            repeat: Infinity, 
            repeatType: "reverse", 
            duration: 1.5, 
            ease: "easeInOut" 
          }}
          className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-brand-primary/10 text-brand-primary mb-8 shadow-inner"
        >
          <Wrench size={48} strokeWidth={1.5} />
        </motion.div>
        
        <h1 className="text-3xl sm:text-4xl font-black text-text-primary mb-4 tracking-tight">
          Sistema em Manutenção
        </h1>
        
        <p className="text-text-secondary text-lg mb-10 leading-relaxed font-medium">
          Estamos realizando algumas melhorias e atualizações para tornar a sua experiência ainda melhor. Voltaremos em breve!
        </p>

        <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary font-bold text-sm tracking-wide uppercase">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-primary"></span>
          </span>
          Trabalhando nisso
        </div>
      </motion.div>
    </div>
  );
}
