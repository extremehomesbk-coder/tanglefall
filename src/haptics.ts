/** navigator.vibrate wrapper: Android phones buzz, everything else ignores it. Patterns live in CONFIG.haptics. */
let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function buzz(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported or blocked: silent */
  }
}
