import type { GameConfig, LevelDef } from '../config';
import { Rng } from './rng';
import type { FrameType, GameEvent, Knot, PowerUp, Rope, TopSide } from './types';

export interface CandleState {
  ropeId: number;
  targetIndex: number;
  msLeft: number;
  msTotal: number;
}

export type Status = 'playing' | 'stageClear' | 'gameOver';

const other = (t: TopSide): TopSide => (t === 'left' ? 'right' : 'left');

/** Pure game state + rules. No rendering, no timers: the scene calls push()/tick() itself. */
export class Game {
  ropes: Rope[] = [];
  knots: Knot[] = [];
  frameGap = 0;
  frameType: FrameType = 'blue';
  bonuses = 0;
  score = 0;
  chain = 0;
  level = 1;
  stage = 1;
  candle: CandleState | null = null;
  status: Status = 'playing';
  chainMsLeft = 0;
  pushCount = 0;

  private readonly rng: Rng;
  private nextId = 1;
  private events: GameEvent[] = [];

  constructor(
    readonly cfg: GameConfig,
    seed?: number,
  ) {
    this.rng = new Rng(seed);
  }

  // ---------- queries ----------

  drain(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get gapCount(): number {
    return Math.max(0, this.ropes.length - 1);
  }

  get levelDef(): LevelDef {
    const defs = this.cfg.levels;
    if (this.level <= defs.length) return defs[this.level - 1];
    const last = defs[defs.length - 1];
    const extra = this.level - defs.length;
    const { pushIntervalFactor, minPushIntervalMs } = this.cfg.beyondLastLevel;
    return { ...last, pushIntervalMs: Math.max(minPushIntervalMs, last.pushIntervalMs * pushIntervalFactor ** extra) };
  }

  get pushIntervalMs(): number {
    const base = this.levelDef.pushIntervalMs * this.cfg.rules.stageSpeedup ** (this.stage - 1);
    return Math.max(this.cfg.beyondLastLevel.minPushIntervalMs, base);
  }

  ropeIndex(id: number): number {
    return this.ropes.findIndex((r) => r.id === id);
  }

  ropeById(id: number): Rope | undefined {
    return this.ropes.find((r) => r.id === id);
  }

  gapOf(knot: Knot): number {
    return this.ropeIndex(knot.left);
  }

  knotsInGap(gap: number): Knot[] {
    const l = this.ropes[gap];
    const r = this.ropes[gap + 1];
    if (!l || !r) return [];
    return this.knots.filter((k) => k.left === l.id && k.right === r.id);
  }

  bottomKnot(gap: number): Knot | undefined {
    let best: Knot | undefined;
    for (const k of this.knotsInGap(gap)) if (!best || k.row > best.row) best = k;
    return best;
  }

  knotsOfRope(id: number): Knot[] {
    return this.knots.filter((k) => k.left === id || k.right === id);
  }

  wouldUntwist(knot: Knot, frame: FrameType = this.frameType): boolean {
    const l = this.ropeById(knot.left);
    const r = this.ropeById(knot.right);
    if (l && r && l.color === r.color) return true;
    return frame === 'blue' ? knot.top === 'right' : knot.top === 'left';
  }

  /** A rope can be in only one knot per row, so the row must be free for both ropes of the gap. */
  rowFree(gap: number, row: number): boolean {
    const l = this.ropes[gap];
    const r = this.ropes[gap + 1];
    if (!l || !r) return false;
    return !this.knots.some(
      (k) => k.row === row && (k.left === l.id || k.right === l.id || k.left === r.id || k.right === r.id),
    );
  }

  isDanger(knot: Knot): boolean {
    return knot.row >= this.cfg.board.rows - this.cfg.board.dangerRows;
  }

  candleAligned(): boolean {
    return this.candle !== null && this.ropeIndex(this.candle.ropeId) === this.candle.targetIndex;
  }

  /** How many gaps' bottom knots the current frame would untwist. 0 = stuck: twist, or spend a bonus. */
  readyCount(): number {
    let n = 0;
    for (let g = 0; g < this.gapCount; g++) {
      const k = this.bottomKnot(g);
      if (k && this.wouldUntwist(k)) n++;
    }
    return n;
  }

  // ---------- stage setup ----------

  startStage(level = this.level, stage = this.stage): void {
    this.level = level;
    this.stage = stage;
    const def = this.levelDef;
    this.ropes = [];
    this.knots = [];
    this.candle = null;
    this.chain = 0;
    this.chainMsLeft = 0;
    this.pushCount = 0;
    this.status = 'playing';
    for (let i = 0; i < def.ropes; i++) {
      let color = this.rng.int(def.colors);
      const prev = this.ropes[i - 1];
      if (!this.cfg.rules.adjacentSameColor && def.colors > 1 && prev && color === prev.color) {
        color = (color + 1 + this.rng.int(def.colors - 1)) % def.colors;
      }
      this.ropes.push({ id: this.nextId++, color });
    }

    const maxRow = Math.max(1, Math.floor(this.cfg.board.rows * this.cfg.board.startRowsFraction)) - 1;
    // Every rope starts with at least one knot, otherwise it would vanish on the spot.
    for (let i = 0; i < this.ropes.length; i++) {
      if (this.knotsOfRope(this.ropes[i].id).length > 0) continue;
      this.spawnKnot(i < this.ropes.length - 1 ? i : i - 1, 0, maxRow);
    }
    let tries = 0;
    while (this.knots.length < def.initialKnots && tries++ < 200) this.spawnKnot(this.rng.int(this.gapCount), 0, maxRow);
    this.frameGap = Math.floor((this.gapCount - 1) / 2);
    // Open with whichever frame has more work ready, so the first move is never forced to be a twist.
    this.frameType = 'blue';
    const readyBlue = this.readyCount();
    this.frameType = 'red';
    const readyRed = this.readyCount();
    this.frameType = readyRed > readyBlue ? 'red' : 'blue';
  }

  nextStage(): void {
    let { level, stage } = this;
    stage += 1;
    if (stage > this.cfg.rules.stagesPerLevel) {
      stage = 1;
      level += 1;
    }
    this.startStage(level, stage);
  }

  // ---------- player commands ----------

  moveFrame(gap: number): void {
    if (this.status !== 'playing' || this.gapCount === 0) return;
    const g = Math.max(0, Math.min(this.gapCount - 1, gap));
    if (g === this.frameGap) return;
    this.frameGap = g;
    this.emit({ type: 'frameMoved', gap: g });
  }

  act(): void {
    if (this.status !== 'playing') return;
    const knot = this.bottomKnot(this.frameGap);
    if (!knot) {
      this.emit({ type: 'noKnot', gap: this.frameGap });
      if (this.cfg.rules.actOnEmptyGapFlips) this.flip(false);
      return;
    }
    if (this.wouldUntwist(knot)) this.untwist(knot);
    else this.twist(knot);
    if (this.status === 'playing') this.flip(false);
  }

  flipWithBonus(): boolean {
    if (this.status !== 'playing' || this.bonuses <= 0) return false;
    this.bonuses -= 1;
    this.emit({ type: 'bonus', bonuses: this.bonuses });
    this.flip(true);
    return true;
  }

  /** The bar pushes everything one row down and knots new rope at the top. */
  push(): void {
    if (this.status !== 'playing') return;
    for (const k of this.knots) k.row += 1;
    this.pushCount += 1;
    const spawned: Knot[] = [];
    const raw = this.levelDef.knotsPerGapPerPush * this.gapCount;
    const want = Math.floor(raw) + (this.rng.chance(raw - Math.floor(raw)) ? 1 : 0);
    const layerTop: TopSide | undefined =
      this.cfg.rules.orientation === 'alternate' ? (this.pushCount % 2 === 0 ? 'left' : 'right') : undefined;
    let tries = 0;
    while (spawned.length < want && this.gapCount > 0 && tries++ < this.gapCount * 3) {
      const k = this.spawnKnot(this.rng.int(this.gapCount), 0, this.cfg.board.spawnRows - 1, layerTop);
      if (k) spawned.push(k);
    }
    this.emit({ type: 'push', spawned });
    if (this.knots.some((k) => k.row >= this.cfg.board.rows)) {
      this.status = 'gameOver';
      this.emit({ type: 'gameOver' });
    }
  }

  /** Candle countdown and chain decay. */
  tick(dtMs: number): void {
    if (this.status !== 'playing') return;
    if (this.chain > 0) {
      this.chainMsLeft -= dtMs;
      if (this.chainMsLeft <= 0) {
        this.chain = 0;
        this.emit({ type: 'chain', chain: 0 });
      }
    }
    if (!this.candle) return;
    this.candle.msLeft -= dtMs;
    if (this.candle.msLeft <= 0) {
      this.candle = null;
      this.emit({ type: 'candleEnd', success: false });
    }
  }

  /** Player connects the two red dots: burns the marked rope away if it hangs over the bottom dot. */
  candleConnect(): boolean {
    if (!this.candle || this.status !== 'playing' || !this.candleAligned()) return false;
    const rope = this.ropeById(this.candle.ropeId);
    if (!rope) return false;
    this.candle = null;
    this.score += this.cfg.scoring.candleRope;
    this.removeRope(rope, 'candle');
    this.emit({ type: 'candleEnd', success: true });
    this.removeEmptyRopes();
    this.checkStageClear();
    return true;
  }

  // ---------- internals ----------

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private flip(spent: boolean): void {
    this.frameType = this.frameType === 'blue' ? 'red' : 'blue';
    this.emit({ type: 'frameFlipped', frameType: this.frameType, spent });
  }

  private rollPower(): PowerUp {
    const p = this.cfg.powerUps;
    const x = this.rng.next();
    if (x < p.candleRate) return 'candle';
    if (x < p.candleRate + p.brushRate) return 'brush';
    if (x < p.candleRate + p.brushRate + p.sparkleRate) return 'sparkle';
    return 'none';
  }

  private addKnot(gap: number, row: number, top: TopSide, power: PowerUp): Knot {
    const knot: Knot = { id: this.nextId++, left: this.ropes[gap].id, right: this.ropes[gap + 1].id, top, row, power };
    this.knots.push(knot);
    return knot;
  }

  private spawnKnot(gap: number, rowMin: number, rowMax: number, forceTop?: TopSide): Knot | null {
    const free: number[] = [];
    for (let r = rowMin; r <= rowMax; r++) if (this.rowFree(gap, r)) free.push(r);
    if (free.length === 0) return null;
    const row = free[this.rng.int(free.length)];
    let top: TopSide;
    if (forceTop) top = forceTop;
    else if (this.cfg.rules.orientation === 'alternate') top = row % 2 === 0 ? 'left' : 'right';
    else top = this.rng.chance(0.5) ? 'left' : 'right';
    return this.addKnot(gap, row, top, this.rollPower());
  }

  private untwist(knot: Knot): void {
    this.knots = this.knots.filter((k) => k.id !== knot.id);
    this.chain = Math.min(this.chain + 1, this.cfg.scoring.chainMax);
    this.chainMsLeft = this.cfg.rules.chainWindowMs;
    const points = this.cfg.scoring.untwist * this.chain;
    this.score += points;
    this.emit({ type: 'untwist', knot, chain: this.chain, points });
    if (knot.power === 'sparkle') {
      this.bonuses += 1;
      this.emit({ type: 'bonus', bonuses: this.bonuses });
    } else if (knot.power === 'brush') {
      this.applyBrush(knot);
    } else if (knot.power === 'candle') {
      this.startCandle();
    }
    this.removeEmptyRopes();
    this.checkStageClear();
  }

  private twist(knot: Knot): void {
    this.chain = 0;
    this.chainMsLeft = 0;
    this.emit({ type: 'chain', chain: 0 });
    this.score = Math.max(0, this.score - this.cfg.scoring.twistPenalty);
    if (this.cfg.rules.twistMode === 'flipTop') {
      knot.top = other(knot.top);
      this.emit({ type: 'twist', knot, added: null });
      return;
    }
    const gap = this.gapOf(knot);
    const mode = this.cfg.rules.twistNewKnotTop;
    const top: TopSide =
      mode === 'same' ? knot.top : mode === 'opposite' ? other(knot.top) : this.rng.chance(0.5) ? 'left' : 'right';
    for (let row = knot.row - 1; row >= 0; row--) {
      if (this.rowFree(gap, row)) {
        const added = this.addKnot(gap, row, top, 'none');
        this.emit({ type: 'twist', knot, added });
        return;
      }
    }
    // No room above: fall back to tightening in place.
    knot.top = other(knot.top);
    this.emit({ type: 'twist', knot, added: null });
  }

  private applyBrush(knot: Knot): void {
    const l = this.ropeById(knot.left);
    const r = this.ropeById(knot.right);
    if (!l || !r) return;
    if (this.cfg.powerUps.brushMode === 'match') {
      r.color = l.color;
    } else {
      const n = this.levelDef.colors;
      l.color = (l.color + 1) % n;
      r.color = (r.color + 1) % n;
    }
    this.emit({ type: 'brush', ropeIds: [l.id, r.id] });
  }

  private startCandle(): void {
    const off = this.cfg.rules.candleTargetOffset;
    const candidates: number[] = [];
    for (let i = 0; i < this.ropes.length; i++) {
      const t = i + off;
      if (t >= 0 && t < this.ropes.length && t !== i) candidates.push(i);
    }
    if (candidates.length === 0) return;
    const i = candidates[this.rng.int(candidates.length)];
    const ms = this.cfg.powerUps.candleMs;
    this.candle = { ropeId: this.ropes[i].id, targetIndex: i + off, msLeft: ms, msTotal: ms };
    this.emit({ type: 'candleStart', ropeId: this.ropes[i].id, targetIndex: i + off, ms });
  }

  private removeRope(rope: Rope, cause: 'untwist' | 'candle'): void {
    const index = this.ropeIndex(rope.id);
    if (index < 0) return;
    const gone = this.knotsOfRope(rope.id);
    this.knots = this.knots.filter((k) => k.left !== rope.id && k.right !== rope.id);
    this.ropes.splice(index, 1);
    if (cause === 'untwist') this.score += this.cfg.scoring.ropeRemoved;
    this.emit({ type: 'ropeRemoved', rope, index, cause, knots: gone });
    if (this.candle && this.candle.ropeId === rope.id) {
      this.candle = null;
      this.emit({ type: 'candleEnd', success: false });
    }
    const g = Math.max(0, Math.min(this.gapCount - 1, this.frameGap));
    if (g !== this.frameGap) {
      this.frameGap = g;
      this.emit({ type: 'frameMoved', gap: g });
    }
  }

  private removeEmptyRopes(): void {
    for (;;) {
      const empty = this.ropes.find((r) => this.knotsOfRope(r.id).length === 0);
      if (!empty) return;
      this.removeRope(empty, 'untwist');
    }
  }

  private checkStageClear(): void {
    if (this.ropes.length > 0 || this.status !== 'playing') return;
    const s = this.cfg.scoring;
    const bonusPoints = this.bonuses * s.bonusUnused + s.stageClear;
    this.score += bonusPoints;
    this.bonuses = 0;
    this.candle = null;
    this.status = 'stageClear';
    this.emit({ type: 'stageClear', bonusPoints, level: this.level, stage: this.stage });
  }
}
