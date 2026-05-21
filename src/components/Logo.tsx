import { useState } from 'react';
import logoImg from './logo.png';

interface LogoProps {
  className?: string;
  showText?: boolean;
  showBadge?: boolean;
}

export default function Logo({ className = "h-8" }: LogoProps) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {logoImg && !hasError ? (
        <img 
          src={logoImg} 
          alt="Olhar Jovem Logo" 
          className="h-full w-auto object-contain"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="flex items-center h-full">
          <div className="h-full aspect-square bg-[#00b094] rounded-lg flex items-center justify-center text-white font-black text-xs min-h-[32px] min-w-[32px]">
            OJ
          </div>
          <span className="text-white font-black tracking-tighter text-lg ml-2 whitespace-nowrap">
            Olhar Jovem
          </span>
        </div>
      )}
    </div>
  );
}
