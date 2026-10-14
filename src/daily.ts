/** Pure daily-walk helpers (no Phaser, no storage) so they stay unit-testable. */

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Same seed for everyone on the same calendar day: YYYYMMDD mixed with a base so it never equals a plain run's seed. */
export function dailySeed(key: string, base: number): number {
  const n = Number(key.replaceAll('-', '')) >>> 0;
  return ((n * 2654435761 + base) >>> 0) || 1;
}

/** Days between two YYYY-MM-DD keys (b - a), ignoring time zones beyond the local calendar. */
export function daysBetween(a: string, b: string): number {
  const toDays = (k: string): number => {
    const [y, m, d] = k.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
  };
  return toDays(b) - toDays(a);
}

/**
 * The streak after clearing today's walk: continues when the last cleared day was yesterday (or today),
 * restarts at 1 after a gap.
 */
export function streakAfterClear(lastDate: string, lastStreak: number, lastCleared: boolean, today: string): number {
  if (!lastDate || !lastCleared) return 1;
  const gap = daysBetween(lastDate, today);
  if (gap === 0) return Math.max(1, lastStreak);
  if (gap === 1) return lastStreak + 1;
  return 1;
}

/** The streak to show on the menu: the saved one while it is still alive (today or yesterday), else 0. */
export function streakNow(lastDate: string, lastStreak: number, lastCleared: boolean, today: string): number {
  if (!lastDate || !lastCleared) return 0;
  const gap = daysBetween(lastDate, today);
  return gap <= 1 ? lastStreak : 0;
}
