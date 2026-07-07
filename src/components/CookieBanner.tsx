import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Settings, Check, X, ShieldAlert, Key } from 'lucide-react';
import { useConsent } from '../hooks/useConsent';
import { ALL_CONSENT, MINIMAL_CONSENT } from '../lib/consentManager';
import CookieModal from './CookieModal';

export default function CookieBanner() {
  const { preferences, isLoaded, updateConsent } = useConsent();
  const [isVisible, setIsVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  // Expose as global for manual trigger if needed
  useEffect(() => {
    (window as any).showCookiePreferences = () => setShowPreferences(true);
  }, []);

  useEffect(() => {
    if (isLoaded && !preferences) {
      // Delay slightly for better UX
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, preferences]);

  if (!isVisible) return null;

  const handleAcceptAll = () => {
    updateConsent(ALL_CONSENT);
    setIsVisible(false);
  };

  const handleRejectAll = () => {
    updateConsent(MINIMAL_CONSENT);
    setIsVisible(false);
  };

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-6 left-6 right-6 md:right-auto md:max-w-md z-[200] pointer-events-none"
          >
            <div className="bg-bg-sidebar/95 backdrop-blur-2xl border border-border-color shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-[24px] p-5 pointer-events-auto flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="bg-brand-primary/10 p-2.5 rounded-xl text-brand-primary shrink-0">
                  <Shield size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-text-secondary leading-relaxed font-bold">
                    Respeitamos sua privacidade. Utilizamos cookies para otimizar sua experiência de aprendizado no Neva Pro.
                  </p>
                  <div className="mt-1.5 flex gap-3">
                    <button onClick={() => window.open('/privacidade', '_blank')} className="text-[9px] font-black uppercase text-brand-primary/60 hover:text-brand-primary tracking-widest transition-colors">Privacidade</button>
                    <button onClick={() => window.open('/cookies', '_blank')} className="text-[9px] font-black uppercase text-brand-primary/60 hover:text-brand-primary tracking-widest transition-colors">Cookies</button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAcceptAll}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-primary/10 hover:bg-brand-secondary transition-all active:scale-95"
                >
                  Aceitar Todos
                </button>
                <button
                  onClick={handleRejectAll}
                  className="px-4 py-2.5 rounded-xl border border-border-color text-[10px] font-black uppercase tracking-widest text-text-secondary hover:bg-bg-card transition-all"
                >
                  Mínimos
                </button>
                <button
                  onClick={() => setShowPreferences(true)}
                  className="p-2.5 rounded-xl border border-border-color text-text-secondary hover:bg-bg-card transition-all"
                >
                  <Settings size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showPreferences && (
        <CookieModal 
          onClose={() => setShowPreferences(false)} 
          onSave={() => {
            setShowPreferences(false);
            setIsVisible(false);
          }}
        />
      )}
    </>
  );
}
