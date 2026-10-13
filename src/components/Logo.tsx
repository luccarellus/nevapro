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
 *
 * Evolução: removemos todos os efeitos visuais de interação para que a logo nunca
 * exiba borda, anel ou sombreamento — especialmente ao clicar/focar.
 * Quando `onClick` é passado, torna o elemento clicável, mas sem feedback visual (sem
 * hover, active, focus ring ou animação de clique).
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
        className={`flex items-center select-none cursor-pointer transition-opacity focus:outline-none ${className}`}
      >
        {content}
      </button>
    );
  }
  // Nota de design: removemos hover:opacity-85, active:scale-[0.98] e o focus ring
  // do button para evitar qualquer feedback visual (mudança de cor/borda/brilho) ao
  // clicar ou focar na logo. O botão continua funcional (onClick), mas não altera visualmente.

  return (
    <div className={`flex items-center select-none ${className}`}>
      {content}
    </div>
  );
}
