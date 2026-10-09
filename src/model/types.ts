export type FrameType = 'blue' | 'red';
export type TopSide = 'left' | 'right';
export type PowerUp = 'none' | 'sparkle' | 'candle' | 'brush';

export interface Rope {
  id: number;
  color: number; // index into CONFIG.colors.palette
}

export interface Knot {
  id: number;
  left: number; // rope id
  right: number; // rope id (always the rope directly right of `left`)
  top: TopSide; // which rope crosses on top
  row: number; // 0 = top of board; grows as the bar pushes
  power: PowerUp;
}

export type GameEvent =
  | { type: 'untwist'; knot: Knot; chain: number; points: number }
  | { type: 'twist'; knot: Knot; added: Knot | null }
  | { type: 'noKnot'; gap: number }
  | { type: 'ropeRemoved'; rope: Rope; index: number; cause: 'untwist' | 'candle'; knots: Knot[] }
  | { type: 'frameMoved'; gap: number }
  | { type: 'frameFlipped'; frameType: FrameType; spent: boolean }
  | { type: 'push'; spawned: Knot[] }
  | { type: 'bonus'; bonuses: number }
  | { type: 'candleStart'; ropeId: number; targetIndex: number; ms: number }
  | { type: 'candleEnd'; success: boolean }
  | { type: 'brush'; ropeIds: number[] }
  | { type: 'stageClear'; bonusPoints: number; level: number; stage: number }
  | { type: 'gameOver' };
