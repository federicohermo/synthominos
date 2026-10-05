/** `now` must already be compensated for the output latency. */
export function offsetAt(
  now: number,
  origin: number,
  intervalSeconds: number,
  cycleIntervals: number,
): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(origin)) return null;
  if (!Number.isFinite(intervalSeconds) || !Number.isFinite(cycleIntervals)) return null;
  if (intervalSeconds <= 0) return null;

  const ciclo = Math.floor(cycleIntervals);
  if (ciclo <= 0) return null;

  const transcurridos = Math.floor((now - origin) / intervalSeconds);
  // A Euclidean modulo: `%` keeps the sign of the dividend, and `now < origin` is valid.
  return ((transcurridos % ciclo) + ciclo) % ciclo;
}
