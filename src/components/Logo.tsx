interface LogoProps {
  className?: string;
  showText?: boolean;
}

/**
 * Logo oficial do sistema (public/logo.webp).
 * showText mantém compatibilidade com usos antigos, mas a imagem já contém
 * o texto da marca — nesse caso o flag é ignorado para não duplicar.
 */
export default function Logo({ className = "h-10" }: LogoProps) {
  return (
    <div className={`flex items-center select-none ${className}`}>
      <img
        src="/logo.webp"
        alt="Neva PRO"
        className="h-full w-auto object-contain"
        draggable={false}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}
