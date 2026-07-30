import { useState, useEffect } from 'react';
import logoOriginal from './logo.png';

const logoLight = '/logo_light.png';

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "h-10" }: LogoProps) {
  const [hasOriginalError, setHasOriginalError] = useState(false);
  const [hasLightError, setHasLightError] = useState(false);

  const [isLightMode, setIsLightMode] = useState(() => {
    if (typeof document !== 'undefined') {
      const theme = document.documentElement.getAttribute('data-theme');
      const hasDarkClass = document.documentElement.classList.contains('dark');
      return theme === 'light' || (!hasDarkClass && theme !== 'dark' && theme !== 'cyberpunk' && theme !== 'dracula' && theme !== 'neva');
    }
    return false;
  });

  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      const hasDarkClass = document.documentElement.classList.contains('dark');
      setIsLightMode(theme === 'light' || (!hasDarkClass && theme !== 'dark' && theme !== 'cyberpunk' && theme !== 'dracula' && theme !== 'neva'));
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    return () => observer.disconnect();
  }, []);

  // In Light Mode: Immediately show the Instituto Olhar Jovem logo from the photo
  if (isLightMode) {
    return (
      <div className={`flex items-center justify-center gap-3 ${className}`}>
        {!hasLightError ? (
          <img 
            src={logoLight} 
            alt="Instituto Olhar Jovem" 
            className="h-full w-auto object-contain scale-[1.08] origin-center transition-all duration-300"
            onError={() => setHasLightError(true)}
          />
        ) : (
          <div className="flex items-center gap-3.5 h-full py-1 cursor-pointer select-none">
            {/* SVG Lightbulb Icon */}
            <svg 
              viewBox="0 0 100 120" 
              className="h-full w-auto aspect-[100/120] text-[#00b094] fill-none stroke-current stroke-[7] stroke-linecap-round stroke-linejoin-round"
            >
              <path d="M 50 10 A 35 35 0 1 1 25 72 C 30 82 35 88 35 94 L 65 94 C 65 88 70 82 75 72 A 35 35 0 0 1 50 10 Z" />
              <path d="M 38 102 L 62 102" />
              <path d="M 42 110 L 58 110" />
            </svg>

            {/* Brand Typography */}
            <div className="flex flex-col justify-center leading-none text-[#00b094]">
              <span className="text-[9px] font-extrabold uppercase tracking-[0.38em] text-[#00b094] mb-0.5 opacity-90">
                INSTITUTO
              </span>
              <span className="font-serif italic text-xl font-normal tracking-wide text-[#00b094] -my-0.5">
                Olhar
              </span>
              <span className="font-black text-2xl tracking-tighter uppercase text-[#00b094]">
                JOVEM
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // In Dark Mode: Keep original logo completely unchanged
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      {!hasOriginalError ? (
        <img 
          src={logoOriginal} 
          alt="Neva Pro Logo" 
          className="h-full w-auto object-contain scale-[1.12] origin-center transition-all duration-300"
          onError={() => setHasOriginalError(true)}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="h-full aspect-square bg-[#00b094] rounded-lg flex items-center justify-center text-white font-black text-xs min-h-[32px] min-w-[32px]">
            N
          </div>
          <span className="text-white font-black tracking-tighter text-lg ml-2 whitespace-nowrap">
            Neva Pro
          </span>
        </div>
      )}
    </div>
  );
}
