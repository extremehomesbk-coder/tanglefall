import { describe, expect, it } from 'vitest';
import { dailySeed, dateKey, daysBetween, streakAfterClear, streakNow } from './daily';

describe('daily walk helpers', () => {
  it('formats the local calendar date', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('seeds differ by day and never come out zero', () => {
    const a = dailySeed('2026-10-13', 7);
    const b = dailySeed('2026-10-14', 7);
    expect(a).not.toBe(b);
    expect(a).toBeGreaterThan(0);
    expect(dailySeed('2026-10-13', 7)).toBe(a);
  });

  it('counts days across month and year ends', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-10-13', '2026-10-13')).toBe(0);
    expect(daysBetween('2026-10-10', '2026-10-13')).toBe(3);
  });

  it('a streak continues from yesterday, holds today, restarts after a gap', () => {
    expect(streakAfterClear('', 0, false, '2026-10-13')).toBe(1);
    expect(streakAfterClear('2026-10-12', 3, true, '2026-10-13')).toBe(4);
    expect(streakAfterClear('2026-10-13', 4, true, '2026-10-13')).toBe(4);
    expect(streakAfterClear('2026-10-10', 9, true, '2026-10-13')).toBe(1);
    expect(streakAfterClear('2026-10-12', 3, false, '2026-10-13')).toBe(1); // yesterday was attempted, not cleared
  });

  it('the menu streak dies after a missed day', () => {
    expect(streakNow('2026-10-12', 3, true, '2026-10-13')).toBe(3);
    expect(streakNow('2026-10-13', 3, true, '2026-10-13')).toBe(3);
    expect(streakNow('2026-10-11', 3, true, '2026-10-13')).toBe(0);
    expect(streakNow('2026-10-12', 3, false, '2026-10-13')).toBe(0);
  });
});
