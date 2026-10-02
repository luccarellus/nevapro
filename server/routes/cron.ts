import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { runDatabaseBackup } from '../services/b2BackupStorage';

const router = Router();

// Middleware de verificação do segredo do Cron Job
function verifyCronSecret(req: Request, res: Response, next: () => void) {
  const cronSecret = process.env.CRON_SECRET;

  // Em produção, exige que o CRON_SECRET coincida se estiver configurado
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    const customHeader = req.headers['x-cron-secret'];

    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const providedSecret = bearerToken || (Array.isArray(customHeader) ? customHeader[0] : customHeader) || null;

    // Segredo NÃO é aceito via query string: URLs vazam em access logs e proxies.
    // Comparação em tempo constante evita vazamento por timing.
    if (!providedSecret) {
      log.warn('[Cron] Requisição sem segredo (envie via Authorization Bearer ou X-Cron-Secret).');
      res.status(401).json({ error: 'Não autorizado. Segredo de Cron ausente.' });
      return;
    }
    const a = Buffer.from(providedSecret);
    const b = Buffer.from(cronSecret);
    const secretOk = a.length === b.length && timingSafeEqual(a, b);
    if (!secretOk) {
      log.warn('[Cron] Tentativa de execução não autorizada.');
      res.status(401).json({ error: 'Não autorizado. Segredo de Cron inválido.' });
      return;
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Fail-closed: em produção, endpoints de destruição em massa (limpeza de
    // tabelas, backup) não podem ficar abertos por falta de configuração.
    log.error('[Cron] CRON_SECRET não definido em produção — endpoint bloqueado.');
    res.status(401).json({ error: 'Não autorizado. CRON_SECRET não configurado.' });
    return;
  } else {
    log.warn('[Cron] CRON_SECRET não definido — liberado apenas em desenvolvimento.');
  }

  next();
}

// Endpoint de limpeza de banco de dados (suporta GET para Vercel Cron e POST)
const handleCleanup = async (_req: Request, res: Response) => {
  try {
    log.info('[Cron] Iniciando limpeza automática de logs e tokens no banco de dados...');

    const { rows } = await query('SELECT public.clean_unnecessary_logs() as result');
    const resultSummary = rows[0]?.result || {};

    log.info('[Cron] Limpeza concluída com sucesso:', JSON.stringify(resultSummary));

    res.json({
      success: true,
      message: 'Limpeza automática concluída com sucesso.',
      summary: resultSummary,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('[Cron] Erro ao executar limpeza automática do banco de dados:', errorMessage);
    res.status(500).json({
      error: 'Erro interno ao executar a limpeza do banco de dados.',
      details: errorMessage,
    });
  }
};

// Endpoint de backup de banco de dados no Backblaze B2 (suporta GET para Vercel Cron e POST)
const handleBackup = async (_req: Request, res: Response) => {
  try {
    log.info('[Cron] Disparando backup automático do banco de dados para o Backblaze B2...');

    const backupResult = await runDatabaseBackup();

    log.info('[Cron] Backup do banco de dados concluído com sucesso:', JSON.stringify(backupResult));

    res.json({
      success: true,
      message: 'Backup automático para o Backblaze B2 concluído com sucesso.',
      result: backupResult,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('[Cron] Erro ao executar backup do banco de dados para a Backblaze B2:', errorMessage);
    res.status(500).json({
      error: 'Erro interno ao executar o backup do banco de dados.',
      details: errorMessage,
    });
  }
};

router.get('/cleanup', verifyCronSecret, handleCleanup);
router.post('/cleanup', verifyCronSecret, handleCleanup);

router.get('/backup', verifyCronSecret, handleBackup);
router.post('/backup', verifyCronSecret, handleBackup);

export default router;
