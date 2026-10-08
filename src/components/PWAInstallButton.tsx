import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, X } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'compact'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-2 rounded-xl bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer active:scale-95 border border-brand-primary/20 ${className}`}
        title="Instalar Neva Pro"
      >
        <Download size={14} />
        {variant === 'full' ? 'Instalar Aplicativo' : 'Instalar App'}
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-2 rounded-xl bg-text-main/5 hover:bg-brand-primary/10 text-text-secondary hover:text-brand-primary px-3 py-1.5 text-xs font-bold transition-all cursor-pointer active:scale-95 border border-border-color ${className}`}
          title="Instalar no iOS"
        >
          <Share2 size={14} />
          {variant === 'full' ? 'Instalar no iOS' : 'Instalar'}
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-bg-card p-6 shadow-2xl border border-border-color text-text-main">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-text-main">Instalar no iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-text-secondary hover:text-text-main p-1 rounded-lg"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
              <ol className="space-y-3 text-xs text-text-secondary leading-relaxed font-medium mb-6">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-brand-primary">1.</span>
                  <span>Toque no botão de <strong>Compartilhar</strong> (ícone com quadrado e seta para cima) na barra do Safari.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-brand-primary">2.</span>
                  <span>Role a lista para baixo e toque em <strong>Adicionar à Tela de Início</strong>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-brand-primary">3.</span>
                  <span>Toque em <strong>Adicionar</strong> no canto superior direito para concluir.</span>
                </li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-brand-primary hover:bg-brand-secondary text-white py-2.5 text-xs font-bold transition-all shadow-md active:scale-98"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
