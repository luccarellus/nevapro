interface LogoProps {
  className?: string;
  showText?: boolean;
  onClick?: () => void;
  title?: string;
}

/**
 * Logo oficial do sistema (public/logo.png).
 * showText mantém compatibilidade com usos antigos, mas a imagem já contém
 * o texto da marca — nesse caso o flag é ignorado para não duplicar.
 * Quando `onClick` é passado, torna o elemento clicável e acessível.
 */
export default function Logo({ className = "h-10", onClick, title }: LogoProps) {
  const content = (
    <img
      src="/logo.png"
      alt="Neva PRO"
      className="h-full w-auto object-contain pointer-events-none"
      draggable={false}
      loading="eager"
      decoding="async"
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title || "Ir para a página inicial"}
        className={`flex items-center select-none cursor-pointer hover:opacity-85 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary/30 rounded-xl ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`flex items-center select-none ${className}`}>
      {content}
    </div>
  );
}
