const KEY_BEST = 'tanglefall.best';
const KEY_TWOTAP = 'tanglefall.twoTap';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode or storage blocked: play on without persistence */
  }
}

export function getHighScore(): number {
  const n = Number(read(KEY_BEST) ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function setHighScore(n: number): void {
  write(KEY_BEST, String(n));
}

export function getTwoTap(fallback: boolean): boolean {
  const v = read(KEY_TWOTAP);
  return v === null ? fallback : v === '1';
}

export function setTwoTap(on: boolean): void {
  write(KEY_TWOTAP, on ? '1' : '0');
}
