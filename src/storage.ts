/**
 * The only persistence: localStorage, every call wrapped in try/catch (private mode just loses persistence).
 * Keys are namespaced; JSON records carry a `v` so a later format can migrate or drop them.
 */
const KEY_BEST = 'tanglefall.best';
const KEY_TWOTAP = 'tanglefall.twoTap';
const KEY_MUTE = 'tanglefall.mute';
const KEY_HAPTICS = 'tanglefall.haptics';
const KEY_ASSIST = 'tanglefall.assist';
const KEY_STATS = 'tanglefall.stats';
const KEY_DAILY = 'tanglefall.daily';

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

function readJson<T extends { v: number }>(key: string, fallback: T): T {
  const raw = read(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<T> | null;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== fallback.v) return fallback;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
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

export function getMute(): boolean {
  return read(KEY_MUTE) === '1';
}

export function setMute(on: boolean): void {
  write(KEY_MUTE, on ? '1' : '0');
}

export function getHaptics(): boolean {
  return read(KEY_HAPTICS) !== '0'; // on unless switched off
}

export function setHaptics(on: boolean): void {
  write(KEY_HAPTICS, on ? '1' : '0');
}

export function getAssist(fallback: boolean): boolean {
  const v = read(KEY_ASSIST);
  return v === null ? fallback : v === '1';
}

export function setAssist(on: boolean): void {
  write(KEY_ASSIST, on ? '1' : '0');
}

// ---------- play stats (local only; nothing leaves the phone) ----------

export interface Stats {
  v: 1;
  walksPlayed: number;
  walksCleared: number;
  dogsHome: number;
  bestChain: number;
  bestLevel: number; // furthest walk reached, as level and stage
  bestStage: number;
  coached: boolean; // the first-walk coach has run once
}

const STATS0: Stats = { v: 1, walksPlayed: 0, walksCleared: 0, dogsHome: 0, bestChain: 0, bestLevel: 0, bestStage: 0, coached: false };

export function getStats(): Stats {
  return readJson(KEY_STATS, STATS0);
}

export function updateStats(patch: (s: Stats) => void): Stats {
  const s = getStats();
  patch(s);
  write(KEY_STATS, JSON.stringify(s));
  return s;
}

// ---------- daily walk ----------

export interface DailyRecord {
  v: 1;
  date: string; // YYYY-MM-DD of the last daily played
  best: number; // best score on that date's walk (0 = never cleared)
  cleared: boolean;
  attempts: number;
  streak: number; // consecutive days with a cleared daily, counting `date`
}

const DAILY0: DailyRecord = { v: 1, date: '', best: 0, cleared: false, attempts: 0, streak: 0 };

export function getDaily(): DailyRecord {
  return readJson(KEY_DAILY, DAILY0);
}

export function setDaily(d: DailyRecord): void {
  write(KEY_DAILY, JSON.stringify(d));
}
