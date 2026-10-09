import type { Game } from './game';

export type BotMove = { kind: 'act'; gap: number } | { kind: 'flip' } | { kind: 'candle' } | { kind: 'wait' };

/** How the demo bot plays. 'play' = decent game; 'chain' = greedy for chain length; 'idle' = does nothing (fail clips). */
export type BotStyle = 'play' | 'chain' | 'idle';

/**
 * Pure policy shared by the in-game demo bot (`?auto=1`) and the balance simulator: prefers deep stacks and danger
 * knots, spends a bonus flip when stuck, otherwise tightens the highest (least dangerous) knot to flip the frame.
 */
export function chooseMove(m: Game, style: BotStyle = 'play'): BotMove {
  if (m.status !== 'playing' || style === 'idle') return { kind: 'wait' };
  if (m.candle && m.candleAligned()) return { kind: 'candle' };
  const perms = m.perms();
  let best = -1;
  let bestScore = -1;
  for (let g = 0; g < m.gapCount; g++) {
    const k = m.bottomKnot(g);
    if (!k || !m.wouldUntwist(k, m.frameType, perms)) continue;
    const stack = m.knotsInGap(g).length;
    // 'chain' style: does untwisting here leave the NEXT frame something to untwist in the same gap?
    const above = m.knotsInGap(g).filter((x) => x.id !== k.id).sort((a, b) => b.row - a.row)[0];
    const nextFrame = m.frameType === 'blue' ? 'red' : 'blue';
    const keepsChain = above && m.wouldUntwist(above, nextFrame, perms) ? 1 : 0;
    const score =
      style === 'chain'
        ? keepsChain * 20 + stack + (m.isDanger(k) ? 6 : 0)
        : stack + (m.isDanger(k) ? 10 : 0) + (k.power !== 'none' ? 2 : 0) + keepsChain * 3;
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  if (best >= 0) return { kind: 'act', gap: best };
  if (m.bonuses > 0) return { kind: 'flip' };
  // stuck: tighten the gap whose bottom knot is highest (least dangerous)
  let g2 = -1;
  let topRow = Number.MAX_SAFE_INTEGER;
  for (let g = 0; g < m.gapCount; g++) {
    const k = m.bottomKnot(g);
    if (k && k.row < topRow) {
      topRow = k.row;
      g2 = g;
    }
  }
  return g2 >= 0 ? { kind: 'act', gap: g2 } : { kind: 'wait' };
}

/** Apply a move to the model (the scene wraps this in `run` so events get animated). */
export function applyMove(m: Game, move: BotMove): void {
  switch (move.kind) {
    case 'act':
      m.moveFrame(move.gap);
      m.act();
      break;
    case 'flip':
      m.flipWithBonus();
      break;
    case 'candle':
      m.candleConnect();
      break;
    default:
      break;
  }
}
