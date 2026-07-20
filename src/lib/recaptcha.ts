/**
 * reCAPTCHA v3 — Frontend utility
 *
 * Loads the Google reCAPTCHA script on demand and provides a promise-based
 * wrapper around grecaptcha.execute().
 */

let scriptLoaded = false;
let scriptLoading: Promise<void> | null = null;

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

/**
 * Returns true when a reCAPTCHA site key has been configured.
 */
export function isRecaptchaEnabled(): boolean {
  return SITE_KEY.length > 0;
}

/**
 * Injects the Google reCAPTCHA v3 script into <head>.
 * Safe to call multiple times — the script is only added once.
 */
function loadRecaptchaScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('reCAPTCHA can only be loaded in the browser'));
      return;
    }

    // Prevent duplicate <script> tags
    if (document.querySelector('script[src*="recaptcha/api.js"]')) {
      scriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error('Falha ao carregar o reCAPTCHA. Verifique sua conexão.'));
    };
    document.head.appendChild(script);
  });

  return scriptLoading;
}

/**
 * Executes reCAPTCHA v3 and returns a token string.
 *
 * @param action  A descriptive action name (e.g. "login", "register", "change_password").
 *                This shows up in the Google reCAPTCHA admin console.
 * @returns       The reCAPTCHA token, or an empty string if reCAPTCHA is not configured.
 */
export async function executeRecaptcha(action: string): Promise<string> {
  if (!isRecaptchaEnabled()) {
    console.warn('[reCAPTCHA] Site key not configured. Skipping verification.');
    return '';
  }

  await loadRecaptchaScript();

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('reCAPTCHA timed out.'));
    }, 15_000);

    try {
      grecaptcha.ready(async () => {
        try {
          const token = await grecaptcha.execute(SITE_KEY, { action });
          clearTimeout(timeout);
          resolve(token);
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

/**
 * Type declaration for the global grecaptcha object injected by Google's script.
 */
declare var grecaptcha: {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};
