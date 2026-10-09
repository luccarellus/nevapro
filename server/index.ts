/**
 * Neva Pro - Dev Server
 *
 * Servidor de desenvolvimento frontend com proxy para o Laravel.
 * Em produção, use o Dockerfile ou Nginx diretamente.
 *
 * Este servidor:
 * - Serve o frontend via Vite HMR em desenvolvimento
 * - Faz proxy das requisições /api para o Laravel (backend)
 * - Serve os arquivos estáticos em produção
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const distPath = path.resolve('dist');
const indexPath = path.join(distPath, 'index.html');
const PORT = parseInt(process.env.PORT || '3000', 10);
const LARAVEL_URL = process.env.LARAVEL_URL || 'http://127.0.0.1:8000';

export const app = express();

// Proxy para o Laravel (API)
app.use('/api', async (req, res) => {
  try {
    const { createProxyRequest } = await import('./proxy');
    await createProxyRequest(req, res, LARAVEL_URL);
  } catch (err) {
    console.error('[Proxy] Erro:', err);
    res.status(502).json({ error: 'Falha ao conectar com o Laravel.' });
  }
});

// Frontend estático
if (fs.existsSync(indexPath)) {
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    immutable: true,
    maxAge: '365d',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }));

  app.use(express.static(distPath, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API não encontrada.' });
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('File not found');
    }
    res.sendFile(indexPath);
  });

  console.log(`[Dev] Frontend estático servido de ${distPath}`);
} else {
  // Modo desenvolvimento com Vite HMR
  (async () => {
    try {
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
      console.log('[Dev] Vite HMR ativo');
    } catch (err) {
      console.warn('[Dev] Vite não disponível:', err);
    }
  })();
}

export const startServer = () => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Dev] Servidor rodando na porta ${PORT}`);
    console.log(`[Dev] Frontend: http://localhost:${PORT}`);
    console.log(`[Dev] API Laravel: ${LARAVEL_URL}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[Dev] ${signal} recebido. Encerrando...`);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[Dev] Shutdown forçado após timeout.');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
