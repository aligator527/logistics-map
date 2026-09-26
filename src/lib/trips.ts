// Trip types under the 2024 driving-time rules (used by the reach map and its legend).
/** 2024 driving-time rules (改善基準告示, from April 2024): a day is at most 13 h on duty and
 *  9 h at the wheel, with 30 min rest per 4 h of driving. Loading and unloading ≈ 1 h each end.
 *  1 = there and back in one shift (日帰り往復), 2 = one way in a shift, 3 = two days or a relay. */
export function tripClass(min: number) {
  if (!isFinite(min)) return NaN;
  const rest = (drive: number) => Math.floor(drive / 240) * 30;
  const round = 2 * min;
  if (round <= 540 && round + rest(round) + 120 <= 780) return 1;
  if (min <= 540 && min + rest(min) + 60 <= 780) return 2;
  return 3;
}
