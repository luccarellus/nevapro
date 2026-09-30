import { query } from '../../src/lib/db';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';

/**
 * XP Service — fonte única de verdade para progressão do aluno.
 *
 * Regra central: XP/level NUNCA são aceitos do cliente. O servidor calcula o
 * ganho a partir das respostas registradas e aplica com UPDATE atômico no
 * banco, eliminando a manipulação de leaderboard via POST /profile.
 *
 * A curva de nível espelha src/utils/xpUtils.ts (300 XP base, fator 1.35).
 */

export const XP_PER_CORRECT_ANSWER = 10;
export const XP_PER_INCORRECT_ANSWER = 2;

/** Calcula o nível a partir do XP total — espelha a curva do frontend. */
export function levelFromXp(totalXp: number): number {
  let level = 1;
  let xpNeededForNext = 300;
  let accumulatedXpThreshold = 300;

  while (totalXp >= accumulatedXpThreshold) {
    level++;
    xpNeededForNext = Math.floor(xpNeededForNext * 1.35);
    accumulatedXpThreshold += xpNeededForNext;
  }

  return level;
}

/** Valida um delta de XP enviado pelo servidor (nunca pelo cliente). */
function clampXpGain(amount: number, max: number): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(Math.round(amount), max);
}

/** Valida uma contagem de respostas (0..max). */
function clampCount(value: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.round(value), max);
}

export interface AwardXpOptions {
  /** Motivo registrado no xp_logs (auditoria). */
  reason: string;
  /** Ganho bruto calculado pelo servidor (já validado). */
  amount: number;
}

/**
 * Aplica ganho de XP de forma ATÔMICA no banco: xp é somado (não sobrescrito),
 * o nível é recalculado no servidor e o evento é auditado em xp_logs.
 *
 * Retorna o novo estado (xp/level) ou null se o usuário não existir.
 */
export async function awardXp(
  userId: string,
  tenantId: string | null,
  options: AwardXpOptions,
): Promise<{ xp: number; level: number } | null> {
  const amount = clampXpGain(options.amount, 10_000);
  if (amount === 0) return null;

  try {
    const { rows } = await query(
      `UPDATE public.users
         SET xp = COALESCE(xp, 0) + $1,
             level = $2,
             updated_at = NOW()
       WHERE id = $3
       RETURNING xp, level`,
      [amount, 1, userId],
    );
    if (rows.length === 0) return null;

    // Recalcula o nível com o XP atualizado (segunda passada simples: evita
    // duplicar a curva em SQL e mantém o cálculo em um só lugar).
    const newXp = Number(rows[0].xp) || 0;
    const newLevel = levelFromXp(newXp);
    if (newLevel !== Number(rows[0].level)) {
      await query('UPDATE public.users SET level = $1 WHERE id = $2', [newLevel, userId]);
    }

    await dbAdmin.from('xp_logs').insert({
      user_id: userId,
      tenant_id: tenantId,
      amount,
      reason: options.reason,
      created_at: new Date().toISOString(),
    });

    return { xp: newXp, level: newLevel };
  } catch (err) {
    log.error('[XP Service] Erro ao conceder XP:', err);
    return null;
  }
}

/**
 * Calcula o ganho de XP de um simulado/lote de respostas a partir da
 * contagem de acertos informada PELO SERVIDOR (nunca aceita valores do body).
 */
export function xpForAnswers(correct: number, total: number): number {
  // Dados malformados/negativos => NENHUM XP (não premiar lixo).
  if (
    typeof correct !== 'number' || !Number.isFinite(correct) || correct < 0 ||
    typeof total !== 'number' || !Number.isFinite(total) || total < 0
  ) {
    return 0;
  }
  const safeCorrect = clampCount(correct, 10_000);
  const safeTotal = clampCount(total, 10_000);
  // total < correct (dados inconsistentes) => não premia o excesso
  const incorrect = Math.max(safeTotal - safeCorrect, 0);
  return safeCorrect * XP_PER_CORRECT_ANSWER + incorrect * XP_PER_INCORRECT_ANSWER;
}
