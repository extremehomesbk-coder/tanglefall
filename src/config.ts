/**
 * Every rule, speed, colour, layout and score for Tanglefall lives here.
 * docs/GAME_RULES.md explains each knob and flags the ones that are assumptions.
 */

export type TwistMode = 'addKnot' | 'flipTop';
export type TwistNewKnotTop = 'same' | 'opposite' | 'random';
export type BrushMode = 'match' | 'cycle';

export interface LevelDef {
  ropes: number; // ropes hanging at stage start
  colors: number; // how many palette colours are in play
  pushIntervalMs: number; // bar push interval at stage 1 of this level
  knotsPerPush: number; // new knots created at the top by each push
  initialKnots: number; // knots at stage start (every rope gets at least one)
}

export const CONFIG = {
  title: 'Tanglefall',
  version: '0.1.0',

  board: {
    rows: 20, // knot rows from top to bottom; a knot pushed past the last row ends the game
    dangerRows: 4, // rows from the bottom where knots glow and pulse
    startRowsFraction: 1 / 3, // initial knots are bunched in the top third
    spawnRows: 2, // knots created by a push land in rows 0..spawnRows-1
  },

  rules: {
    twistMode: 'addKnot' as TwistMode, // ASSUMPTION: 'addKnot' = a twist stacks one extra knot above; 'flipTop' = flips which rope is on top
    twistNewKnotTop: 'same' as TwistNewKnotTop, // ASSUMPTION: the stacked knot copies the acted knot's top rope
    actOnEmptyGapFlips: false, // ASSUMPTION: acting on a gap with no knot does nothing and does not flip the frame
    stagesPerLevel: 3, // ASSUMPTION
    stageSpeedup: 0.88, // push interval multiplier for each stage after the first within a level
    twoTapMode: false, // first tap moves the frame, second tap acts (off = one tap does both)
    candleTargetOffset: -1, // ASSUMPTION: the bottom red dot sits this many slots left of the marked rope
    restartFromLevelOne: true, // ASSUMPTION: game over restarts at 1-1
  },

  levels: [
    { ropes: 7, colors: 4, pushIntervalMs: 7000, knotsPerPush: 2, initialKnots: 10 },
    { ropes: 7, colors: 5, pushIntervalMs: 6200, knotsPerPush: 2, initialKnots: 12 },
    { ropes: 8, colors: 5, pushIntervalMs: 5600, knotsPerPush: 3, initialKnots: 14 },
    { ropes: 8, colors: 6, pushIntervalMs: 5000, knotsPerPush: 3, initialKnots: 16 },
    { ropes: 9, colors: 6, pushIntervalMs: 4500, knotsPerPush: 3, initialKnots: 18 },
    { ropes: 9, colors: 7, pushIntervalMs: 4000, knotsPerPush: 4, initialKnots: 20 },
  ] as LevelDef[],
  beyondLastLevel: { pushIntervalFactor: 0.92, minPushIntervalMs: 1800 },

  powerUps: {
    sparkleRate: 0.12, // chance a new knot sparkles
    candleRate: 0.04, // chance a new knot carries a candle
    brushRate: 0.04, // chance a new knot carries a paintbrush
    candleMs: 12000, // how long the candle burns
    brushMode: 'match' as BrushMode, // ASSUMPTION: 'match' = right rope takes the left rope's colour; 'cycle' = both advance one colour
  },

  scoring: {
    untwist: 100, // points per untwist, multiplied by the chain
    chainMax: 8, // chain multiplier cap (consecutive untwists; a twist resets it)
    twistPenalty: 0, // points lost per twist
    ropeRemoved: 500, // rope cleared by untwisting its last knot
    candleRope: 300, // rope burned away by a candle
    bonusUnused: 250, // each unspent bonus at stage end
    stageClear: 1000,
  },

  colors: {
    background: 0x12141c,
    board: 0x1a1d28,
    boardEdge: 0x2a2e3f,
    palette: [0xff5a5f, 0xffb42e, 0x7ee04f, 0x3cc8ff, 0xb06cff, 0xff6ad5, 0x33e6c2, 0xf4f4f4],
    frameBlue: 0x3aa0ff,
    frameRed: 0xff4d4d,
    previewGood: 0x4dff7a,
    previewBad: 0xff4d4d,
    danger: 0xff2d2d,
    text: '#f1f3f8',
    textDim: '#8d93a8',
    sparkle: 0xfff176,
    candle: 0xff8a3d,
    brush: 0xffffff,
    bar: 0x6c7390,
  },

  anim: {
    untwistMs: 280,
    twistMs: 220,
    ropeRemoveMs: 520,
    pushMs: 220,
    slideMs: 260,
    frameMoveMs: 110,
  },

  layout: {
    width: 390,
    height: 844,
    hudHeight: 104,
    footerHeight: 100,
    boardMarginX: 26,
    maxSpacing: 62,
    beadRadius: 5,
    beadGap: 2,
  },
};

export type GameConfig = typeof CONFIG;
