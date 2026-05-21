import { useState, useEffect } from 'react';
import logoOriginal from './logo.png';
import logoWebapp from './logo_webapp.png';

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "h-8" }: LogoProps) {
  const [hasErrorOriginal, setHasErrorOriginal] = useState(false);
  const [hasErrorWebapp, setHasErrorWebapp] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect standalone display-mode (PWA installed webapp)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    setIsStandalone(mediaQuery.matches || (window.navigator as any).standalone === true);

    const handler = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // When running as a webapp (PWA standalone window)
  const showWebappLogo = isStandalone;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Desktop/Tablet/PC logo (Site mode) - Shown on screen sizes medium (md) and above when not standalone */}
      {!showWebappLogo && !hasErrorOriginal ? (
        <img 
          src={logoOriginal} 
          alt="Olhar Jovem Logo" 
          className="h-full w-auto object-contain hidden md:block"
          onError={() => setHasErrorOriginal(true)}
        />
      ) : !showWebappLogo ? (
        <div className="flex items-center h-full hidden md:flex">
          <div className="h-full aspect-square bg-[#00b094] rounded-lg flex items-center justify-center text-white font-black text-xs min-h-[32px] min-w-[32px]">
            OJ
          </div>
          <span className="text-white font-black tracking-tighter text-lg ml-2 whitespace-nowrap">
            Olhar Jovem
          </span>
        </div>
      ) : null}

      {/* WebApp/Mobile logo - Shown on screen sizes smaller than medium (md) OR when running in standalone PWA mode */}
      {showWebappLogo || !hasErrorWebapp ? (
        <img 
          src={logoWebapp} 
          alt="Neva Pro WebApp Logo" 
          className={`h-full max-h-[80px] w-auto object-contain ${showWebappLogo ? '' : 'md:hidden'}`}
          onError={() => setHasErrorWebapp(true)}
        />
      ) : (
        <div className={`flex items-center h-full ${showWebappLogo ? '' : 'md:hidden'}`}>
          <div className="h-8 w-8 bg-[#00b094] rounded-lg flex items-center justify-center text-white font-black text-xs">
            NP
          </div>
          <span className="text-white font-black tracking-tighter text-base ml-2 whitespace-nowrap">
            Neva Pro
          </span>
        </div>
      )}
    </div>
  );
}


