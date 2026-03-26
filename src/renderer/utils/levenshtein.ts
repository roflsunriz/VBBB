/**
 * Bounded Levenshtein distance.
 *
 * Returns the edit distance between `a` and `b`, but aborts early and returns
 * `null` if the distance exceeds `maxDist`. This avoids the full O(n*m)
 * computation when only "close enough" matches matter.
 */
export function boundedLevenshtein(a: string, b: string, maxDist: number): number | null {
  const m = a.length;
  const n = b.length;

  if (Math.abs(m - n) > maxDist) return null;
  if (m === 0) return n <= maxDist ? n : null;
  if (n === 0) return m <= maxDist ? m : null;

  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
      if ((curr[j] ?? 0) < rowMin) rowMin = curr[j] ?? 0;
    }
    if (rowMin > maxDist) return null;
    prev.set(curr);
  }
  const result = prev[n] ?? 0;
  return result <= maxDist ? result : null;
}
