import { useState, useEffect } from 'react';
import logoDesktop from './logo_desktop.png';
import logoWebapp from './logo_webapp.png';

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "h-8" }: LogoProps) {
  const [hasErrorDesktop, setHasErrorDesktop] = useState(false);
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

  // When running as a webapp (PWA standalone window), always display the webapp logo
  if (isStandalone) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {!hasErrorWebapp ? (
          <img 
            src={logoWebapp} 
            alt="Neva Pro WebApp Logo" 
            className="h-full max-h-[80px] w-auto object-contain"
            onError={() => setHasErrorWebapp(true)}
          />
        ) : (
          <div className="flex items-center h-full">
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

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Desktop/Tablet/PC logo - Shown on screen sizes medium (md) and above */}
      {!hasErrorDesktop ? (
        <img 
          src={logoDesktop} 
          alt="Neva Pro Logo" 
          className="h-full max-h-[50px] w-auto object-contain hidden md:block"
          onError={() => setHasErrorDesktop(true)}
        />
      ) : (
        <span className="text-white font-black tracking-tighter text-lg hidden md:block">
          Neva Pro
        </span>
      )}

      {/* WebApp/Mobile logo - Shown on screen sizes smaller than medium (md) */}
      {!hasErrorWebapp ? (
        <img 
          src={logoWebapp} 
          alt="Neva Pro WebApp Logo" 
          className="h-full max-h-[80px] w-auto object-contain md:hidden"
          onError={() => setHasErrorWebapp(true)}
        />
      ) : (
        <div className="flex items-center h-full md:hidden">
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

