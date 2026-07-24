import { Router, Request, Response } from 'express';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';

const router = Router();

// Middleware de verificação do segredo do Cron Job
function verifyCronSecret(req: Request, res: Response, next: () => void) {
  const cronSecret = process.env.CRON_SECRET;

  // Em produção, exige que o CRON_SECRET coincida se estiver configurado
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    const customHeader = req.headers['x-cron-secret'];
    const querySecret = req.query.secret;

    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const providedSecret = bearerToken || customHeader || querySecret;

    if (providedSecret !== cronSecret) {
      log.warn('[Cron] Tentativa de execução não autorizada.');
      res.status(401).json({ error: 'Não autorizado. Segredo de Cron inválido.' });
      return;
    }
  } else if (process.env.NODE_ENV === 'production') {
    log.warn('[Cron] CRON_SECRET não definido no ambiente.');
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

router.get('/cleanup', verifyCronSecret, handleCleanup);
router.post('/cleanup', verifyCronSecret, handleCleanup);

export default router;
