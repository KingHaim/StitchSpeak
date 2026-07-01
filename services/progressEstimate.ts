/**
 * A front-loaded translation estimate: visibly responsive at the beginning,
 * progressively slower near the end, and capped below completion until the
 * server reports that the job has actually finished.
 */
export function estimatedTranslationProgress(elapsedMs: number, pages: number): number {
  const expectedMs = Math.max(35_000, 22_000 + Math.max(1, pages) * 4_000);
  const timeFraction = Math.min(0.96, Math.max(0, elapsedMs / expectedMs));
  const eased = 1 - Math.pow(1 - timeFraction, 3);
  return Math.min(95, Math.max(4, Math.round(eased * 95)));
}
