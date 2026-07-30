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

  // In Light Mode: Immediately show the exact Instituto Olhar Jovem logo from the photo
  if (isLightMode) {
    return (
      <div className={`flex items-center justify-center gap-3 ${className}`}>
        <img 
          src={hasLightError ? logoOriginal : logoLight} 
          alt="Instituto Olhar Jovem" 
          className="h-full w-auto object-contain scale-[1.08] origin-center transition-all duration-300"
          onError={() => setHasLightError(true)}
        />
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
