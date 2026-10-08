import './lib/clientLogger';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './sentry';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Registra o Service Worker do PWA com Workbox para caching offline e performance
registerSW({ immediate: true });

const CHUNK_RELOAD_KEY = 'nevapro_chunk_reload';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  }
});

window.setTimeout(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY), 10_000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Ocorreu um erro inesperado. Atualize a página e tente novamente.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
