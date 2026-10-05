// Espelha XpService do backend: XP concedido por resposta.
export const XP_PER_CORRECT_ANSWER = 10;
export const XP_PER_INCORRECT_ANSWER = 2;

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

