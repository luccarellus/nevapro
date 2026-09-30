/**
 * Upload & Storage Routes
 *
 *   POST /api/upload         → upload de avatar/material para Backblaze B2
 *   GET  /api/storage/object → serve arquivo privado do B2 (autenticado)
 */

import { Router, Response } from 'express';
import multer from 'multer';
import { log } from '../utils/logger';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import { verifyRecaptcha } from '../middleware/recaptcha';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { isB2LogStorageConfigured } from '../services/b2LogStorage';

const router = Router();

// ===== Upload (Avatar/Material) — definições multer =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req: any, file: any, cb: any) => {
    const extension = file.originalname.toLowerCase().split('.').pop() || '';
    const isMaterial = req.query.kind === 'material';
    const imageTypes: Record<string, string[]> = {
      jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'],
      gif: ['image/gif'], webp: ['image/webp'],
    };
    const materialTypes: Record<string, string[]> = {
      ...imageTypes, pdf: ['application/pdf'], mp4: ['video/mp4'], webm: ['video/webm'],
    };
    const allowedTypes = isMaterial ? materialTypes : imageTypes;
    if (allowedTypes[extension]?.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(isMaterial
        ? 'Formato não permitido. Envie PDF, JPG, PNG, GIF, WEBP, MP4 ou WEBM.'
        : 'Formato não permitido. Envie uma imagem JPG, PNG, GIF ou WEBP.'));
    }
  },
});

const receiveUpload = (req: any, res: any, next: any) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error) {
      const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'O arquivo deve ter no máximo 5 MB.'
        : error instanceof Error ? error.message : 'Arquivo inválido.';
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
};

// ===== Upload =====
router.post('/upload', rateLimiter(5, 60_000), requireAuth, receiveUpload, verifyRecaptcha(), async (req: any, res: any) => {
  try {
    if (!isB2LogStorageConfigured()) {
      log.error('[Upload] Backblaze B2 não configurada no ambiente de execução.');
      res.status(503).json({
        error: 'Armazenamento de arquivos indisponível. Verifique a configuração da Backblaze.',
      });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }
    if (req.query.kind !== 'material' && req.file.size > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'A foto de perfil deve ter no máximo 2 MB.' });
      return;
    }
    const bucketName = process.env.B2_BUCKET_NAME || 'neva-avatars';
    const fileExt = req.file.originalname.split('.').pop() || 'jpg';
    const prefix = req.query.kind === 'material' ? 'materials' : 'avatars';
    const fileName = `${prefix}/${crypto.randomUUID()}.${fileExt.toLowerCase()}`;
    const { data, error } = await dbAdmin.storage.from(bucketName).upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
    });
    if (error) throw error;
    res.json({ url: `/api/storage/object?file=${encodeURIComponent(fileName)}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    log.error('[Upload] Error:', msg);
    res.status(500).json({ error: `Falha ao enviar arquivo: ${msg}` });
  }
});

// ===== Storage Proxy (B2) =====
router.get('/storage/object', requireAuth, async (req: any, res: any) => {
  const filePath = req.query.file as string;
  if (!filePath) {
    res.status(400).json({ error: 'Parâmetro file é obrigatório.' });
    return;
  }
  if (filePath.includes('..') || filePath.includes('\\\\') || filePath.startsWith('/')) {
    res.status(400).json({ error: 'Caminho de arquivo inválido.' });
    return;
  }
  try {
    const bucketName = process.env.B2_BUCKET_NAME || 'neva-avatars';
    const { data, error } = await dbAdmin.storage.from(bucketName).getObject(filePath);
    if (error || !data) {
      log.error('[Storage] GetObject error:', error);
      res.status(500).json({ error: 'Erro ao buscar arquivo no Storage.' });
      return;
    }
    const { stream, contentType } = data;
    if (!stream) {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const { Readable } = await import('stream');
    if (stream instanceof Readable) {
      stream.pipe(res);
    } else {
      Readable.from(stream as any).pipe(res);
    }
  } catch (error: unknown) {
    log.error('[Storage] Error:', error);
    res.status(500).json({ error: 'Erro ao servir arquivo.' });
  }
});

export default router;
