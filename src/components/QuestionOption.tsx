import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';

interface QuestionOptionProps {
  index: number;
  text: string;
  imageUrl?: string | null;
  /** Whether this option is currently selected by the user */
  isSelected: boolean;
  /** Whether this is the correct answer (for review mode) */
  isCorrectOption?: boolean;
  /** Whether the user selected this option and it was wrong (for review mode) */
  isUserWrong?: boolean;
  /** Whether in interactive mode (selecting answers) */
  interactive?: boolean;
  /** Callback when option is clicked */
  onSelect?: (index: number) => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

type OptionState = 'idle' | 'selected' | 'correct' | 'wrong';

/**
 * Shared UI component for rendering a question alternative/option.
 * Used by Questions, Simulados, and ErrorsBook.
 */
export default function QuestionOption({
  index,
  text,
  imageUrl,
  isSelected,
  isCorrectOption = false,
  isUserWrong = false,
  interactive = true,
  onSelect,
  size = 'md',
}: QuestionOptionProps) {
  const letter = String.fromCharCode(65 + index); // A, B, C, D, E...
  
  // Determine visual state
  // 'correct' state is NOT tied to !interactive so components like ErrorsBook
  // can show correct/wrong highlighting while remaining clickable
  let state: OptionState = 'idle';
  if (isCorrectOption) state = 'correct';
  else if (isUserWrong) state = 'wrong';
  else if (isSelected) state = 'selected';

  const stateStyles: Record<OptionState, { container: string; circle: string; badge?: React.ReactNode }> = {
    idle: {
      container: 'bg-text-main/5 border-transparent hover:bg-text-main/10 hover:border-border-color cursor-pointer',
      circle: 'bg-bg-sidebar text-text-secondary border border-border-color',
    },
    selected: {
      container: 'bg-brand-primary/10 ring-2 ring-brand-primary shadow-lg shadow-brand-primary/5 cursor-pointer',
      circle: 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20 scale-110',
    },
    correct: {
      container: 'bg-brand-primary/10 border-brand-primary ring-1 ring-brand-primary',
      circle: 'bg-brand-primary text-white shadow-md shadow-brand-primary/20',
      badge: (
        <span className="ml-auto flex items-center gap-1 text-[9px] font-black text-brand-primary uppercase tracking-wider shrink-0">
          <Check size={12} /> Gabarito
        </span>
      ),
    },
    wrong: {
      container: 'bg-red-500/10 border-red-500 ring-1 ring-red-500',
      circle: 'bg-red-500 text-white shadow-md shadow-red-500/20',
      badge: (
        <span className="ml-auto flex items-center gap-1 text-[9px] font-black text-red-500 uppercase tracking-wider shrink-0">
          <X size={12} /> Sua Resposta
        </span>
      ),
    },
  };

  const styles = stateStyles[state];
  const sizeClasses = size === 'lg' 
    ? 'p-5 md:p-6 rounded-[24px]' 
    : size === 'sm' 
      ? 'p-3 sm:p-4 rounded-xl' 
      : 'p-4 sm:p-5 md:p-6 rounded-2xl';

  const circleSize = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 sm:w-10 sm:h-10 text-xs sm:text-sm';

  const content = (
    <div className="flex items-start gap-3 sm:gap-4 relative z-10 w-full">
      <span className={`${circleSize} rounded-xl flex items-center justify-center font-black shrink-0 transition-all ${styles.circle}`}>
        {letter}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        {text && (
          <span className={`font-bold text-xs sm:text-sm md:text-base leading-snug transition-colors ${
            state === 'idle' ? 'text-text-secondary group-hover:text-text-main' : 'text-text-main'
          }`}>
            {text}
          </span>
        )}
        {styles.badge}
      </div>
    </div>
  );

  const Wrapper = interactive && onSelect ? 'button' : 'div';
  const wrapperProps: any = {
    className: `w-full text-left ${sizeClasses} border transition-all duration-300 flex flex-col gap-3 sm:gap-4 group ${styles.container}`,
  };

  if (interactive && onSelect) {
    wrapperProps.onClick = () => onSelect(index);
  }

  return (
    <Wrapper {...wrapperProps}>
      {content}
      {imageUrl && (
        <div className="ml-0 sm:ml-12 md:ml-14 rounded-xl overflow-hidden max-w-full md:max-w-md bg-bg-sidebar p-2 md:p-3 ring-1 ring-border-color">
          <img
            src={imageUrl}
            alt={`Opção ${letter}`}
            className="w-full h-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      {isSelected && interactive && (
        <motion.div
          layoutId="check-bg"
          className="absolute inset-0 bg-gradient-to-r from-brand-primary/5 to-transparent pointer-events-none"
        />
      )}
    </Wrapper>
  );
}
