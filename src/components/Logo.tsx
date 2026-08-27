interface LogoProps {
  className?: string;
  showText?: boolean;
}

export default function Logo({ className = "h-10", showText = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Icon Badge */}
      <div className="h-full aspect-square relative flex items-center justify-center shrink-0 rounded-2xl bg-gradient-to-br from-[#00b094] via-[#00c9aa] to-[#6C5CE7] p-[2px] shadow-lg shadow-[#00b094]/25">
        <div className="w-full h-full bg-[#060a12] rounded-[14px] flex items-center justify-center relative overflow-hidden">
          {/* Subtle internal gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#00b094]/20 to-[#6C5CE7]/20" />
          
          {/* Custom vector 'N' mark */}
          <svg 
            className="w-[55%] h-[55%] relative z-10 text-white drop-shadow-md" 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              d="M6 19V5L18 19V5" 
              stroke="currentColor" 
              strokeWidth="3.2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
            <circle cx="18" cy="5" r="1.5" fill="#00e6c2" />
          </svg>
        </div>
      </div>

      {/* Brand Text */}
      {showText && (
        <div className="flex items-center gap-2 leading-none">
          <span className="text-white font-extrabold tracking-tight text-xl font-sans">
            Neva
          </span>
          <span className="bg-gradient-to-r from-[#00b094] to-[#00e6c2] text-[#060a12] text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded-md shadow-md shadow-[#00b094]/30">
            PRO
          </span>
        </div>
      )}
    </div>
  );
}

