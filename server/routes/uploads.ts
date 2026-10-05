/**
 * Upload & Storage Routes
 *
 *   POST /api/upload         → upload de avatar/material para Backblaze B2
 *   GET  /api/storage/object → serve arquivo privado do B2 (autenticado)
 */

import { Router } from 'express';
import multer from 'multer';
import { log } from '../utils/logger';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import { verifyRecaptcha } from '../middleware/recaptcha';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { isB2LogStorageConfigured } from '../services/b2LogStorage';
import { hasPermission } from '../services/rbacService';
import { PERMISSIONS } from '../lib/permissions';
import { signObjectKey, verifyObjectSignature } from '../utils/storageUrl';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';

// Magic bytes reais por mimetype declarado — bloqueia arquivos com
// extensão/mimetype falsificados (ex.: HTML/JS renomeado para .png).
const MIME_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  'image/webp': (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  'video/mp4': (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  'video/webm': (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
};

async function magicBytesMatch(mimetype: string, buffer: Buffer): Promise<boolean> {
  const checker = MIME_SIGNATURES[mimetype];
  if (!checker) return false;
  if (buffer.length < 16) return false;
  if (checker(buffer)) return true;
  // fallback: biblioteca file-type como segunda camada
  try {
    const type = await fileTypeFromBuffer(buffer);
    return type?.mime === mimetype;
  } catch {
    return false;
  }
}

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
    // Upload de MATERIAL é restrito a professor/admin/tenant_admin
    // (permissão RBAC materials:upload) — alunos só fazem avatar.
    // Espelha a checagem do UploadController do Laravel.
    if (req.query.kind === 'material') {
      const context = (req as any).rbacContext;
      if (!context || !hasPermission(context, PERMISSIONS.MATERIALS_UPLOAD, (req as any).tenantId)) {
        res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
        return;
      }
    }
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
    // Validação de conteúdo real (magic bytes), não só do mimetype declarado.
    if (!(await magicBytesMatch(req.file.mimetype, req.file.buffer))) {
      res.status(400).json({ error: 'Conteúdo do arquivo não corresponde ao formato declarado.' });
      return;
    }
    const bucketName = process.env.B2_BUCKET_NAME || 'neva-avatars';
    const fileExt = req.file.originalname.split('.').pop() || 'jpg';
    const prefix = req.query.kind === 'material' ? 'materials' : 'avatars';
    const fileName = `${prefix}/${crypto.randomUUID()}.${fileExt.toLowerCase()}`;
    const { error } = await dbAdmin.storage.from(bucketName).upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
    });
    if (error) throw error;
    const objectUrl = `/api/storage/object?file=${encodeURIComponent(fileName)}&s=${signObjectKey(fileName)}`;
    res.json({ url: objectUrl });
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
  // Anti-IDOR: a URL precisa de assinatura HMAC válida (emitida no upload /
  // resolveStoredFileUrl). Impede enumerar objetos de outros usuários.
  // Exigida em TODOS os ambientes: staging/dev costuma ter dados reais.
  if (!verifyObjectSignature(filePath, req.query.s as string | undefined)) {
    res.status(403).json({ error: 'Assinatura de arquivo inválida.' });
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
    // Bloqueia sniffing e execução inline de conteúdo uploadado.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (typeof contentType === 'string' && !contentType.startsWith('image/')) {
      res.setHeader('Content-Disposition', 'attachment');
    }

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
