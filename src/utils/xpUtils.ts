export const calculateLevelAndProgression = (totalXp: number): { 
  level: number; 
  currentLevelMinXp: number; 
  nextLevelXp: number; 
} => {
  let level = 1;
  let xpNeededForNext = 500;
  let accumulatedXpThreshold = 500;
  let currentLevelMinXp = 0;

  while (totalXp >= accumulatedXpThreshold) {
    level++;
    currentLevelMinXp = accumulatedXpThreshold;
    xpNeededForNext = Math.floor(xpNeededForNext * 1.5);
    accumulatedXpThreshold += xpNeededForNext;
  }

  return { level, currentLevelMinXp, nextLevelXp: accumulatedXpThreshold };
};
