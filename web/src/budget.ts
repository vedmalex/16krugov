/** Split a block's minutes across its exercises. The parts sum to the block. */
export function budgetsForStep(minutes: number, count: number): number[] {
  if (count <= 0) return [];
  if (!Number.isFinite(minutes) || minutes <= 0) return Array.from({ length: count }, () => 0);
  const total = Math.round(minutes * 60_000);
  const base = Math.floor(total / count);
  let rest = total - base * count;
  return Array.from({ length: count }, () => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return base + extra;
  });
}
