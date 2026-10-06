import { ConsentPreferences, ConsentCategory } from '../types/consent';
import { csrfHeaders } from './apiService';
import { mutationHeaders } from './fetchHelpers';

const STORAGE_KEY = 'neva_cookie_consent';

export const DEFAULT_CONSENT: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
  updatedAt: Date.now()
};

export const ALL_CONSENT: ConsentPreferences = {
  necessary: true,
  analytics: true,
  marketing: true,
  preferences: true,
  updatedAt: Date.now()
};

export const MINIMAL_CONSENT: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
  updatedAt: Date.now()
};

/**
 * Initializes Google Consent Mode v2 with default denied state
 */
export const initConsentMode = () => {
  if (typeof window === 'undefined') return;

  // Define gtag if not present
  const win = window as any;
  win.dataLayer = win.dataLayer || [];
  function gtag(..._args: any[]) {
    win.dataLayer.push(arguments);
  }
  win.gtag = gtag;

  // Set default consent (all denied except necessary)
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'wait_for_update': 500
  });

  console.log('[LGPD] Consent Mode initialized');
};

/**
 * Updates Google Consent Mode based on user preferences
 */
export const updateConsentMode = (preferences: ConsentPreferences) => {
  const win = window as any;
  if (typeof window === 'undefined' || !win.gtag) return;

  win.gtag('consent', 'update', {
    'ad_storage': preferences.marketing ? 'granted' : 'denied',
    'ad_user_data': preferences.marketing ? 'granted' : 'denied',
    'ad_personalization': preferences.marketing ? 'granted' : 'denied',
    'analytics_storage': preferences.analytics ? 'granted' : 'denied'
  });

  console.log('[LGPD] Consent Mode updated:', preferences);
};

export const getConsent = (): ConsentPreferences | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

export const saveConsent = async (preferences: ConsentPreferences) => {
  if (typeof window === 'undefined') return;
  
  const updatedPrefs = {
    ...preferences,
    necessary: true, // Always true
    updatedAt: Date.now()
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
  
  // Update Consent Mode
  updateConsentMode(updatedPrefs);
  
  // Load scripts conditionally
  if (updatedPrefs.analytics) loadAnalyticsScripts();
  if (updatedPrefs.marketing) loadMarketingScripts();  // Audit Log (Backend)
    try {
      await fetch('/api/lgpd/consent-log', {
        method: 'POST',
        headers: { ...csrfHeaders() },
        body: JSON.stringify({ 
          preferences: updatedPrefs,
          userAgent: navigator.userAgent
        })
      });
    } catch (e) {
      console.error('[LGPD] Failed to log consent:', e);
    }

  return updatedPrefs;
};

const loadAnalyticsScripts = () => {
  console.log('[LGPD] Loading Analytics scripts...');
  // Example: Insert GA4 script
  /*
  const script = document.createElement('script');
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX';
  script.async = true;
  document.head.appendChild(script);
  */
};

const loadMarketingScripts = () => {
  console.log('[LGPD] Loading Marketing/Pixels scripts...');
  // Example: Insert FB Pixel
};

export const hasConsent = (category: ConsentCategory): boolean => {
  const prefs = getConsent();
  if (!prefs) return category === 'necessary';
  return prefs[category];
};

export const revokeConsent = () => {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
};
