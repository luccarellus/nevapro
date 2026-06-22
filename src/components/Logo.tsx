import { useState } from 'react';
import logoOriginal from './logo.png';

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "h-8" }: LogoProps) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {!hasError ? (
        <img 
          src={logoOriginal} 
          alt="Neva Logo" 
          className="h-full w-auto object-contain"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="h-full aspect-square bg-[#00b094] rounded-lg flex items-center justify-center text-white font-black text-xs min-h-[32px] min-w-[32px]">
            N
          </div>
          <span className="text-white font-black tracking-tighter text-lg ml-2 whitespace-nowrap">
            Neva
          </span>
        </div>
      )}
    </div>
  );
}


