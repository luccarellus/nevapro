import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/90 text-white px-3.5 py-2 text-xs font-bold shadow-lg backdrop-blur-md border border-amber-400/30">
      <WifiOff size={14} className="animate-pulse" />
      <span>Modo offline — Utilizando recursos do cache.</span>
    </div>
  );
};
