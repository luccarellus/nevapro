import { useState, useEffect } from 'react';
import { getConsent, saveConsent } from '../lib/consentManager';
import { ConsentPreferences } from '../types/consent';

export function useConsent() {
  const [preferences, setPreferences] = useState<ConsentPreferences | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = getConsent();
    setPreferences(stored);
    setIsLoaded(true);
  }, []);

  const updateConsent = async (newPrefs: ConsentPreferences) => {
    const saved = await saveConsent(newPrefs);
    if (saved) setPreferences(saved);
  };

  return {
    preferences,
    isLoaded,
    updateConsent,
    hasAccepted: !!preferences
  };
}
