/**
 * TRI Calculator — Estimativa de nota TRI (Teoria de Resposta ao Item)
 *
 * Implementa o modelo logístico de 3 parâmetros (3PL):
 *   P(θ) = c + (1-c) / (1 + exp(-a(θ - b)))
 *
 * Usa Newton-Raphson para Maximum Likelihood Estimation (MLE) do traço latente θ.
 * Converte θ para a escala ENEM (~N(500, 100)).
 */

// Parâmetros IRT por nível de dificuldade
const ITEM_PARAMS: Record<string, { a: number; b: number; c: number }> = {
  fácil:  { a: 1.0, b: -1.5, c: 0.2 },
  médio:  { a: 1.5, b:  0.0, c: 0.2 },
  difícil: { a: 1.2, b:  1.5, c: 0.2 },
};

const DEFAULT_PARAMS = { a: 1.5, b: 0.0, c: 0.2 };

interface ItemResponse {
  isCorrect: boolean;
  difficulty: string;
}

interface TriResult {
  estimated_score: number;
  theta: number;
  responses_used: number;
}

/**
 * Calcula P(θ) — probabilidade de acerto dado o nível de habilidade θ.
 */
function probability(theta: number, a: number, b: number, c: number): number {
  const exponent = -a * (theta - b);
  // Clamp exponent to avoid overflow
  const clampedExp = Math.max(-700, Math.min(700, exponent));
  return c + (1 - c) / (1 + Math.exp(clampedExp));
}

/**
 * Estima θ (habilidade) via Newton-Raphson MLE para o modelo 3PL.
 * Retorna θ estimado e número de iterações.
 */
function estimateTheta(items: ItemResponse[]): { theta: number; converged: boolean } {
  if (items.length === 0) return { theta: 0, converged: false };

  // Check if all answers are the same (all correct or all incorrect) — degenerate case
  const allCorrect = items.every(i => i.isCorrect);
  const allIncorrect = items.every(i => !i.isCorrect);
  if (allCorrect) return { theta: 3.0, converged: true };
  if (allIncorrect) return { theta: -3.0, converged: true };

  let theta = 0; // Initial estimate
  const MAX_ITER = 100;
  const TOLERANCE = 1e-6;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let firstDeriv = 0;
    let secondDeriv = 0;

    for (const item of items) {
      const { a, b, c } = ITEM_PARAMS[item.difficulty] || DEFAULT_PARAMS;
      const P = probability(theta, a, b, c);
      const u = item.isCorrect ? 1 : 0;

      // Avoid division by zero or log(0)
      const pSafe = Math.max(1e-10, Math.min(1 - 1e-10, P));
      const oneMinusC = 1 - c;

      if (oneMinusC <= 0) continue;

      // First derivative of log-likelihood:
      // S(θ) = Σ a * (P - c) * (u - P) / [P * (1-c)]
      const pMinusC = pSafe - c;
      const score = a * pMinusC * (u - pSafe) / (pSafe * oneMinusC);

      // Second derivative (negative of Fisher information):
      // I(θ) = -Σ a² * (P-c)² * (1-P) / [P * (1-c)²]
      const info = a * a * pMinusC * pMinusC * (1 - pSafe) / (pSafe * oneMinusC * oneMinusC);

      firstDeriv += score;
      secondDeriv -= info;
    }

    // Newton-Raphson update: θ_new = θ - S(θ) / I(θ)
    if (Math.abs(secondDeriv) < 1e-15) break;
    const delta = firstDeriv / secondDeriv;
    theta -= delta;

    // Clamp theta to prevent divergence
    theta = Math.max(-4, Math.min(4, theta));

    if (Math.abs(delta) < TOLERANCE) {
      return { theta, converged: true };
    }
  }

  return { theta, converged: false };
}

/**
 * Converte θ (habilidade latente) para a escala ENEM.
 * ENEM: média ~500, desvio padrão ~100, faixa 0-1000.
 */
function thetaToEnemScale(theta: number): number {
  const raw = 500 + 100 * theta;
  return Math.max(0, Math.min(1000, Math.round(raw)));
}

/**
 * Calcula a nota TRI estimada a partir das respostas do aluno.
 * 
 * @param items - Array de respostas com isCorrect e difficulty
 * @returns Objeto com estimated_score na escala ENEM, theta, e total de respostas usadas
 */
export function calculateTriScore(items: ItemResponse[]): TriResult {
  if (items.length < 3) {
    return { estimated_score: 0, theta: 0, responses_used: items.length };
  }

  const { theta } = estimateTheta(items);
  const estimated_score = thetaToEnemScale(theta);

  return {
    estimated_score,
    theta: Math.round(theta * 100) / 100,
    responses_used: items.length,
  };
}

/**
 * Calcula notas TRI separadas por área de conhecimento (ENEM).
 * Agrupa os itens por categoria e roda a estimação IRT para cada grupo.
 */
const SUBJECT_CATEGORIES: Record<string, string[]> = {
  mathematics: ['matemática', 'matematica', 'tecnologia'],
  nature: ['natureza', 'biologia', 'física', 'fisica', 'química', 'quimica'],
  humanities: ['humanas', 'história', 'historia', 'geografia', 'sociologia', 'filosofia'],
  languages: ['linguagens', 'linguagen', 'português', 'portugues', 'códigos', 'codigos', 'inglês', 'ingles', 'english', 'espanhol', 'spanish'],
};

function categorizeSubject(subject: string): string | null {
  const lower = subject.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [category, keywords] of Object.entries(SUBJECT_CATEGORIES)) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return null; // General/uncategorized
}

export interface PerSubjectScore {
  estimated_score: number;
  responses_used: number;
}

export interface TriCalculationResult {
  overall: TriResult;
  by_subject: Record<string, PerSubjectScore>;
}

/**
 * Calcula TRI completo: overall + por área de conhecimento.
 * 
 * @param items - Array de respostas com isCorrect, difficulty e subject
 * @returns Notas TRI overall e por área
 */
export function calculateFullTri(
  items: (ItemResponse & { subject: string })[]
): TriCalculationResult {
  const overall = calculateTriScore(items);

  // Group items by category
  const grouped: Record<string, ItemResponse[]> = {};
  for (const item of items) {
    const category = categorizeSubject(item.subject) || 'general';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({ isCorrect: item.isCorrect, difficulty: item.difficulty });
  }

  // Calculate per-subject scores
  const by_subject: Record<string, PerSubjectScore> = {};
  for (const [category, catItems] of Object.entries(grouped)) {
    const result = calculateTriScore(catItems);
    by_subject[category] = {
      estimated_score: result.estimated_score,
      responses_used: result.responses_used,
    };
  }

  return { overall, by_subject };
}
