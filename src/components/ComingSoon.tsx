import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  icon: LucideIcon;
  description: string;
  badgeText?: string;
  accentColor?: string;
}

export default function ComingSoon({ 
  title, 
  icon: Icon, 
  description, 
  badgeText = "Em Desenvolvimento", 
  accentColor = "#00b094" 
}: ComingSoonProps) {
  return (
    <div className="max-w-4xl mx-auto pt-10 md:pt-24 pb-32 px-4 md:px-6 flex items-center justify-center min-h-[70vh]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-xl bg-bg-card/50 backdrop-blur-xl border border-border-color shadow-sm rounded-[32px] md:rounded-3xl p-8 md:p-12 text-center relative overflow-hidden group"
      >
        {/* Glow effect matching accentColor */}
        <div 
          className="absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl opacity-20 transition-all duration-500 group-hover:scale-125"
          style={{ backgroundColor: accentColor }}
        />
        <div 
          className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-20 transition-all duration-500 group-hover:scale-125"
          style={{ backgroundColor: accentColor }}
        />

        <div className="relative z-10 flex flex-col items-center">
          {/* Badge */}
          <span 
            className="text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full border mb-8 transition-colors duration-300"
            style={{ 
              color: accentColor, 
              borderColor: `${accentColor}33`,
              backgroundColor: `${accentColor}10` 
            }}
          >
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
            className="inline-flex items-center justify-center w-24 h-24 rounded-[28px] mb-8 relative"
            style={{ 
              backgroundColor: `${accentColor}15`,
              color: accentColor,
              boxShadow: `inset 0 0 20px ${accentColor}10`
            }}
          >
            <Icon size={44} strokeWidth={1.5} />
            
            {/* Animated Ring */}
            <span className="absolute inset-0 rounded-[28px] border border-dashed animate-[spin_20s_linear_infinite]" style={{ borderColor: `${accentColor}30` }} />
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
          <div 
            className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider"
            style={{ 
              color: accentColor, 
              backgroundColor: `${accentColor}10`,
              border: `1px solid ${accentColor}20` 
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: accentColor }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: accentColor }}></span>
            </span>
            Em breve no Neva
          </div>
        </div>
      </motion.div>
    </div>
  );
}
