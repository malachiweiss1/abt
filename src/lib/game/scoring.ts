export function calculateScore(
  isCorrect: boolean,
  responseTimeMs: number,
  timeLimitSeconds: number
): { baseScore: number; speedBonus: number; totalScore: number } {
  if (!isCorrect) {
    return { baseScore: 0, speedBonus: 0, totalScore: 0 };
  }

  const baseScore = 1000;
  const maxSpeedBonus = 500;
  const timeLimitMs = timeLimitSeconds * 1000;
  const speedBonus = Math.round(
    maxSpeedBonus * Math.max(0, (timeLimitMs - responseTimeMs) / timeLimitMs)
  );

  return {
    baseScore,
    speedBonus,
    totalScore: baseScore + speedBonus,
  };
}
