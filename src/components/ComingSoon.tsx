import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  icon: LucideIcon;
  description: string;
  badgeText?: string;
  variant?: 'rose' | 'indigo' | 'brand';
}

export default function ComingSoon({ 
  title, 
  icon: Icon, 
  description, 
  badgeText = "Em Desenvolvimento", 
  variant = "brand" 
}: ComingSoonProps) {
  // Configurações de classes baseadas no variante para evitar o uso de estilos inline
  const styles = {
    rose: {
      glow: "bg-rose-500/20",
      badge: "text-rose-400 border-rose-400/20 bg-rose-400/10",
      iconContainer: "bg-rose-400/15 text-rose-400 shadow-[inset_0_0_20px_rgba(251,113,133,0.1)]",
      ring: "border-rose-400/30",
      status: "text-rose-400 bg-rose-400/10 border-rose-400/20",
      dot: "bg-rose-400"
    },
    indigo: {
      glow: "bg-indigo-500/20",
      badge: "text-indigo-400 border-indigo-400/20 bg-indigo-400/10",
      iconContainer: "bg-indigo-400/15 text-indigo-400 shadow-[inset_0_0_20px_rgba(129,140,248,0.1)]",
      ring: "border-indigo-400/30",
      status: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
      dot: "bg-indigo-400"
    },
    brand: {
      glow: "bg-brand-primary/20",
      badge: "text-brand-primary border-brand-primary/20 bg-brand-primary/10",
      iconContainer: "bg-brand-primary/15 text-brand-primary shadow-[inset_0_0_20px_rgba(0,176,148,0.1)]",
      ring: "border-brand-primary/30",
      status: "text-brand-primary bg-brand-primary/10 border-brand-primary/20",
      dot: "bg-brand-primary"
    }
  }[variant];

  return (
    <div className="max-w-4xl mx-auto pt-10 md:pt-24 pb-32 px-4 md:px-6 flex items-center justify-center min-h-[70vh]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-xl bg-bg-card/50 backdrop-blur-xl border border-border-color shadow-sm rounded-[32px] md:rounded-3xl p-8 md:p-12 text-center relative overflow-hidden group"
      >
        {/* Glow effect matching variant */}
        <div className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl opacity-20 transition-all duration-500 group-hover:scale-125 ${styles.glow}`} />
        <div className={`absolute -bottom-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-20 transition-all duration-500 group-hover:scale-125 ${styles.glow}`} />

        <div className="relative z-10 flex flex-col items-center">
          {/* Badge */}
          <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full border mb-8 transition-colors duration-300 ${styles.badge}`}>
            {badgeText}
          </span>

          {/* Icon Container */}
          <motion.div
            initial={{ scale: 0.8, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.1
            }}
            className={`inline-flex items-center justify-center w-24 h-24 rounded-[28px] mb-8 relative ${styles.iconContainer}`}
          >
            <Icon size={44} strokeWidth={1.5} />
            
            {/* Animated Ring */}
            <span className={`absolute inset-0 rounded-[28px] border border-dashed animate-[spin_20s_linear_infinite] ${styles.ring}`} />
          </motion.div>

          {/* Heading */}
          <h1 className="text-3xl md:text-4xl font-black text-text-main tracking-tight mb-4">
            {title}
          </h1>

          {/* Description */}
          <p className="text-text-secondary text-sm md:text-base max-w-sm font-medium leading-relaxed mb-10">
            {description}
          </p>

          {/* Status Indicator */}
          <div className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider ${styles.status}`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${styles.dot}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${styles.dot}`}></span>
            </span>
            Em breve no Neva Pro
          </div>
        </div>
      </motion.div>
    </div>
  );
}
