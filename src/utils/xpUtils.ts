// Espelha XpService do backend: XP concedido por resposta. Ambos usam mesma constante.
export const XP_PER_CORRECT_ANSWER = 10;
export const XP_PER_INCORRECT_ANSWER = 2;

/**
 * Calcula nível e limites de progressão no frontend.
 * Nota: Esta é a versão frontend do cálculo de nível, mantida em sync com o
 * XpService do backend. Onde o backend fornece nextLevelXp/currentLevelMinXp,
 * prefira usar os valores do servidor para evitar deriva.
 */
export const calculateLevelAndProgression = (totalXp: number): { 
  level: number; 
  currentLevelMinXp: number; 
  nextLevelXp: number; 
} => {
  let level = 1;
  let xpNeededForNext = 300;
  let accumulatedXpThreshold = 300;
  let currentLevelMinXp = 0;

  while (totalXp >= accumulatedXpThreshold) {
    level++;
    currentLevelMinXp = accumulatedXpThreshold;
    xpNeededForNext = Math.floor(xpNeededForNext * 1.35);
    accumulatedXpThreshold += xpNeededForNext;
  }

  return { level, currentLevelMinXp, nextLevelXp: accumulatedXpThreshold };
};

/** Nível derivado do XP usando regra simples do backend (max(1, xp/100 + 1)). */
export const backendLevelFromXp = (xp: number): number =>
  Math.max(1, Math.floor(xp / 100) + 1);
