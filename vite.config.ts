import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// NOTA DE SEGURANÇA: nada de chaves de API de servidor (ex.: GEMINI_API_KEY)
// no `define` — qualquer valor aqui é embutido no bundle público do frontend.
// Chaves de IA devem ser usadas apenas no backend (process.env no server/).
export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // Sempre mais seguro do que o default: precacheia o index.html mas
        // NÃO intercepta requests de favicon (que não estão no precache).
        workbox: {
          navigateFallback: 'index.html',
          // Nunca interceptar arquivos de ícone/manifest — o navegador pede
          // eles fora do ciclo de navegação e o SW podia devolver o fallback
          // HTML para /favicon.ico (quebrando a aba).
          ignoreURLParametersMatching: [/^v$/],
        },
        manifest: {
          name: 'Neva Pro',
          short_name: 'NevaPro',
          description:
            'Uma plataforma web inovadora que transforma a preparação para o ENEM em uma experiência dinâmica e gamificada.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#060a12',
          theme_color: '#060a12',
          lang: 'pt-BR',
          icons: [
            { src: '/favicon.ico', sizes: '16x16 24x24 32x32 48x48 64x64', type: 'image/x-icon' },
            { src: '/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/apple-touch-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vendor chunks - split aggressively for better caching
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'vendor-charts';
            if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'vendor-animation';
            if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark-') || id.includes('node_modules/rehype-') || id.includes('node_modules/unified') || id.includes('node_modules/mdast-') || id.includes('node_modules/hast-')) return 'vendor-markdown';
            if (id.includes('node_modules/canvas-confetti')) return 'vendor-confetti';
            // React core - keep together for optimal caching
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: false,
      allowedHosts: ['nevapro-app-prod.mo1m2d.easypanel.host', 'localhost'],
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
