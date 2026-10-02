import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../../src/lib/db';
import { cacheGet, cacheSet } from '../services/cache';
import { log } from '../utils/logger';

const router = Router();

/**
 * GET /api/sisu/cutoffs
 *
 * Notas de corte do SISU (dados oficiais, ingeridos por edição via
 * `npm run sisu:ingest`). SQL 100% parametrizado; filtros via ILIKE
 * com suporte aos índices em lower(course)/lower(university).
 *
 * Query params:
 *   - course     (string)  filtro parcial por nome do curso (opcional)
 *   - university (string)  filtro parcial por IES (opcional)
 *   - modality   (string)  filtro exato por modalidade (padrão: 'Ampla Concorrência')
 *   - year       (number)  ano da edição (opcional; padrão: edição mais recente)
 *   - limit      (number)  máx. de resultados (padrão 60, teto 300)
 */
router.get('/cutoffs', requireAuth, async (_req, res: Response) => {
  // _req tipado como any via AuthenticatedRequest indireto — requireAuth já garantiu sessão
  try {
    const req = _req as { query: Record<string, unknown> };
    const course = String(req.query.course || '').trim().slice(0, 120);
    const university = String(req.query.university || '').trim().slice(0, 160);
    const modality = String(req.query.modality || 'Ampla Concorrência').trim().slice(0, 80) || 'Ampla Concorrência';
    const year = Number(req.query.year) > 0 ? Number(req.query.year) : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 300);

    const cacheKey = `cache:sisu:cutoffs:${Buffer.from(
      JSON.stringify({ course, university, modality, year, limit })
    ).toString('base64url')}`;

    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // 1) Edição mais recente que possua resultados para o filtro aplicado
    const editionParams: unknown[] = [modality];
    let editionSql = `
      SELECT year, edition
      FROM sisu_cutoffs
      WHERE modality = $1
    `;
    if (course) {
      editionParams.push(`%${course}%`);
      editionSql += ` AND lower(course) LIKE lower($${editionParams.length})`;
    }
    if (university) {
      editionParams.push(`%${university}%`);
      editionSql += ` AND lower(university) LIKE lower($${editionParams.length})`;
    }
    if (year) {
      editionParams.push(year);
      editionSql += ` AND year = $${editionParams.length}`;
    }
    editionSql += ' ORDER BY year DESC, edition DESC LIMIT 1';

    const editionRes = await query(editionSql, editionParams);
    const edition = editionRes.rows[0] as { year: number; edition: string } | undefined;

    if (!edition) {
      const empty = { edition: null, source: 'sisu.mec.gov.br', count: 0, cutoffs: [] };
      await cacheSet(cacheKey, empty, 10 * 60);
      res.json(empty);
      return;
    }

    // 2) Resultados da edição encontrada (limit é interpolado — já é number validado/clamped)
    const rowsParams: unknown[] = [modality, edition.year, edition.edition];
    let rowsSql = `
      SELECT course, campus, university, uf, degree, shift, modality,
             modality_category, cutoff_score, seats, year, edition
      FROM sisu_cutoffs
      WHERE modality = $1 AND year = $2 AND edition = $3
    `;
    if (course) {
      rowsParams.push(`%${course}%`);
      rowsSql += ` AND lower(course) LIKE lower($${rowsParams.length})`;
    }
    if (university) {
      rowsParams.push(`%${university}%`);
      rowsSql += ` AND lower(university) LIKE lower($${rowsParams.length})`;
    }
    rowsSql += ` ORDER BY cutoff_score DESC LIMIT ${limit}`;

    const rowsRes = await query(rowsSql, rowsParams);

    const payload = {
      edition: { year: edition.year, edition: edition.edition },
      source: 'sisu.mec.gov.br',
      count: rowsRes.rows.length,
      cutoffs: (rowsRes.rows as Record<string, unknown>[]).map((r) => ({
        course: r.course,
        campus: r.campus,
        university: r.university,
        uf: r.uf,
        degree: r.degree,
        shift: r.shift,
        modality: r.modality,
        modalityCategory: r.modality_category,
        cutoff: Number(r.cutoff_score),
        seats: r.seats,
        year: r.year,
        edition: r.edition,
      })),
    };

    // Cortes mudam apenas por edição: TTL longo (6h); filtros sem resultado: 10 min
    await cacheSet(cacheKey, payload, payload.count > 0 ? 6 * 60 * 60 : 10 * 60);
    res.json(payload);
  } catch (err) {
    log.error('[SISU] Falha ao buscar notas de corte:', err);
    res.status(500).json({ error: 'Falha ao buscar notas de corte do SISU.' });
  }
});

export default router;
