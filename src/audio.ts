/**
 * Tiny synthesized sound set (WebAudio, no assets, no network).
 * Untwists climb a pentatonic scale with the chain; twists buzz low; rope clears yip.
 */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16]; // semitones above the root

let ctx: AudioContext | null = null;
let muted = false;

function context(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from the first user gesture so iOS lets audio start. */
export function unlockAudio(): void {
  context();
}

export function setMuted(on: boolean): void {
  muted = on;
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, ms: number, type: OscillatorType, gain = 0.18, slideTo?: number): void {
  const ac = context();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + ms / 1000);
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + ms / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + ms / 1000 + 0.02);
}

const ROOT = 392; // G4

/** chain 1..8 picks the note; higher chain = higher pitch. */
export function playUntwist(chain: number): void {
  const semis = PENTATONIC[Math.max(0, Math.min(PENTATONIC.length - 1, chain - 1))];
  const f = ROOT * 2 ** (semis / 12);
  tone(f, 160, 'triangle', 0.2);
  tone(f * 2, 90, 'sine', 0.06);
}

export function playTwist(): void {
  tone(110, 220, 'sawtooth', 0.12, 70);
}

export function playRopeClear(): void {
  // a quick two-note yip
  tone(880, 90, 'square', 0.08, 1320);
  window.setTimeout(() => tone(1175, 140, 'square', 0.08, 700), 90);
}

export function playPush(): void {
  tone(160, 120, 'sine', 0.1, 90);
}

export function playBonus(): void {
  tone(1047, 80, 'sine', 0.12);
  window.setTimeout(() => tone(1568, 140, 'sine', 0.12), 80);
}

export function playGameOver(): void {
  tone(330, 500, 'sawtooth', 0.12, 55);
}
