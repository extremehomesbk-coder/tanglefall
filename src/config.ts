/**
 * Every rule, speed, colour, layout and score for Tanglefall lives here.
 * docs/GAME_RULES.md explains each knob and flags the ones that are assumptions.
 */

export type TwistMode = 'addKnot' | 'flipTop';
export type TwistNewKnotTop = 'same' | 'opposite' | 'random';
export type BrushMode = 'match' | 'cycle';
export type PreviewMode = 'off' | 'all';
export type Orientation = 'alternate' | 'random';

export interface LevelDef {
  ropes: number; // dogs (ropes) at walk start
  colors: number; // how many palette colours are in play
  pushIntervalMs: number; // bar push interval at stage 1 of this level
  knotsPerGapPerPush: number; // new knots per push = this x gaps (fraction rolled), so fewer ropes = fewer knots
  initialKnots: number; // knots at stage start (every rope gets at least one)
  walkMs: number; // walk length; the walk fails when it runs out
  dogsToFree: number; // dogs that must get home to finish the walk
}

/** A dog's personality: what its leash does to the board. */
export interface BreedDef {
  name: string;
  sprite: string; // public/dogs/<sprite>.svg (drawn by scripts/make_dogs.py)
  tangleWeight: number; // how often new knots land on its leash (1 = normal)
  pointsMul: number; // untwists on its leash score x this
  pushFactor: number; // push interval x this while the dog is still on the board
  freeBonusMs: number; // walk time added when the dog gets home
  cascade: boolean; // freeing it also unties the bottom knot of both neighbouring gaps
}

export const CONFIG = {
  title: 'Tanglefall',
  version: '0.5.0',

  board: {
    rows: 16, // knot rows from top to bottom; a knot pushed past the last row ends the game
    dangerRows: 4, // rows from the bottom where knots glow and pulse
    startRowsFraction: 0.45, // initial knots are bunched in the top part of the board
    spawnRows: 2, // knots created by a push land in rows 0..spawnRows-1
  },

  rules: {
    twistMode: 'addKnot' as TwistMode, // ASSUMPTION: 'addKnot' = a twist stacks one extra knot above; 'flipTop' = flips which rope is on top
    twistNewKnotTop: 'same' as TwistNewKnotTop, // ASSUMPTION: the stacked knot copies the acted knot's top rope
    actOnEmptyGapFlips: false, // ASSUMPTION: acting on a gap with no knot does nothing and does not flip the frame
    stagesPerLevel: 3, // ASSUMPTION
    stageSpeedup: 0.9, // push interval multiplier for each stage after the first within a level (sim 2026-10-09)
    twoTapMode: false, // first tap moves the frame, second tap acts (off = one tap does both)
    previewMode: 'off' as PreviewMode, // 'all' outlines every gap's bottom knot green/red; 'off' = read the knots yourself (v0.2 default)
    orientation: 'alternate' as Orientation, // 'alternate': each push layer (and each start row) flips which rope is on top, so stacks chain
    adjacentSameColor: false, // false: neighbouring ropes never start with the same colour (only the brush creates free knots)
    twistPushPenalty: 0.35, // a twist moves the push timer forward by this fraction of the interval
    ropeClearResetsPush: true, // clearing a rope resets the push timer (a breather)
    chainWindowMs: 1600, // the chain multiplier decays if no untwist lands within this window
    candleTargetOffset: -1, // ASSUMPTION: the bottom red dot sits this many slots left of the marked rope
    restartFromLevelOne: true, // endless mode only: game over restarts at 1-1
    walkMode: true, // walks with a timer and a dogs-home target (false = endless board, clear every rope)
    retrySameWalk: true, // walk mode: a failed walk is retried, score kept
  },

  breeds: [
    { name: 'Mutt', sprite: 'mutt', tangleWeight: 1, pointsMul: 1, pushFactor: 1, freeBonusMs: 0, cascade: false },
    { name: 'Poodle', sprite: 'poodle', tangleWeight: 1, pointsMul: 2, pushFactor: 1, freeBonusMs: 0, cascade: false },
    { name: 'Guide dog', sprite: 'guide', tangleWeight: 1, pointsMul: 1, pushFactor: 1, freeBonusMs: 0, cascade: true },
    { name: 'Service dog', sprite: 'service', tangleWeight: 1, pointsMul: 1, pushFactor: 1, freeBonusMs: 6000, cascade: false },
    { name: 'Pug', sprite: 'pug', tangleWeight: 2.2, pointsMul: 1, pushFactor: 1, freeBonusMs: 0, cascade: false },
    { name: 'Husky', sprite: 'husky', tangleWeight: 1, pointsMul: 1, pushFactor: 0.8, freeBonusMs: 0, cascade: false },
  ] as BreedDef[],

  // Curve from scripts/sim.test.ts (2026-10-09): a new player (1.5 s/tap, 20% misreads) clears 1-1 ~78%, a casual
  // one (1.1 s, 12%) ~95% through level 3 and ~33% at 4-1, a quick one (0.8 s, 5%) ~98% through level 5, 3% at 7-1.
  levels: [
    { ropes: 6, colors: 3, pushIntervalMs: 5500, knotsPerGapPerPush: 0.3, initialKnots: 12, walkMs: 45000, dogsToFree: 5 },
    { ropes: 6, colors: 3, pushIntervalMs: 5000, knotsPerGapPerPush: 0.35, initialKnots: 14, walkMs: 45000, dogsToFree: 5 },
    { ropes: 7, colors: 4, pushIntervalMs: 4800, knotsPerGapPerPush: 0.35, initialKnots: 16, walkMs: 50000, dogsToFree: 6 },
    { ropes: 7, colors: 4, pushIntervalMs: 4400, knotsPerGapPerPush: 0.4, initialKnots: 18, walkMs: 50000, dogsToFree: 6 },
    { ropes: 8, colors: 5, pushIntervalMs: 4200, knotsPerGapPerPush: 0.4, initialKnots: 20, walkMs: 55000, dogsToFree: 7 },
    { ropes: 8, colors: 5, pushIntervalMs: 3900, knotsPerGapPerPush: 0.45, initialKnots: 22, walkMs: 55000, dogsToFree: 7 },
    { ropes: 9, colors: 6, pushIntervalMs: 3700, knotsPerGapPerPush: 0.45, initialKnots: 25, walkMs: 60000, dogsToFree: 8 },
  ] as LevelDef[],
  beyondLastLevel: { pushIntervalFactor: 0.92, minPushIntervalMs: 1500 },

  powerUps: {
    sparkleRate: 0.12, // chance a new knot sparkles
    candleRate: 0.04, // chance a new knot carries a candle
    brushRate: 0.04, // chance a new knot carries a paintbrush
    candleMs: 12000, // how long the candle burns
    brushMode: 'match' as BrushMode, // ASSUMPTION: 'match' = right rope takes the left rope's colour; 'cycle' = both advance one colour
  },

  scoring: {
    untwist: 100, // points per untwist, multiplied by the chain
    chainMax: 8, // chain multiplier cap (consecutive untwists inside chainWindowMs; a twist resets it)
    twistPenalty: 0, // points lost per twist
    ropeRemoved: 500, // rope cleared by untwisting its last knot
    candleRope: 300, // rope burned away by a candle
    bonusUnused: 250, // each unspent bonus at stage end
    stageClear: 1000,
    perSecondLeft: 20, // walk mode: points per second left on the clock when the last dog gets home
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
    chainCallouts: { 4: 'x4 COMBO', 6: 'x6 ON FIRE', 8: 'x8 MAX!' } as Record<number, string>, // big centre text at these chains
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
    dogWidth: 54, // sprite display width (px at 1x), capped at 0.95 x the rope spacing
    dogCollar: { x: 74 / 120, y: 46 / 110 }, // where the leash meets the sprite (fraction of the SVG box)
  },

  /** Demo bot (?auto=1) only: clip recording knobs. URL params: demo=play|chain|fail, walk=L-S, walksec=N, hook=text|line2. */
  demo: {
    stepMs: 420, // bot thinking time between taps
    failPlayMs: 7500, // demo=fail: the bot plays at most this long ...
    failStopShort: 2, // ... and stops as soon as it is this many dogs short of the target, then the clock runs out (TIME'S UP clip)
    hookMs: 2300, // how long the hook text stays before the walk starts moving
  },
};

export type GameConfig = typeof CONFIG;
