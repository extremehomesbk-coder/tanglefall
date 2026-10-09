import Phaser from 'phaser';
import { playBonus, playGameOver, playPush, playRopeClear, playTwist, playUntwist, unlockAudio } from '../audio';
import { CONFIG } from '../config';
import { computePerms, Game } from '../model/game';
import type { GameEvent, Knot, Rope } from '../model/types';
import { getHighScore, setHighScore } from '../storage';
import { BraidView, type BraidSnapshot } from '../view/BraidView';
import { FrameView } from '../view/FrameView';
import { Hud } from '../view/Hud';
import { KnotView } from '../view/KnotView';
import { Layout } from '../view/layout';

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const DOGS = ['\u{1F415}', '\u{1F429}', '\u{1F9AE}', '\u{1F415}‍\u{1F9BA}', '\u{1F436}', '\u{1F43A}'];

export interface GameSceneData {
  twoTap?: boolean;
}

export class GameScene extends Phaser.Scene {
  private model!: Game;
  private layout!: Layout;
  private braid!: BraidView;
  private dogViews = new Map<number, Phaser.GameObjects.Text>();
  private knotViews = new Map<number, KnotView>();
  private frame!: FrameView;
  private hud!: Hud;
  private pushBar!: Phaser.GameObjects.Graphics;
  private pushStamp!: Phaser.GameObjects.Rectangle;
  private candleTop!: Phaser.GameObjects.Container;
  private candleBottom!: Phaser.GameObjects.Container;
  private candleBeam!: Phaser.GameObjects.Rectangle;
  private overlay: Phaser.GameObjects.Container | null = null;
  private pushTimer = 0;
  private twoTap = false;
  private best = 0;
  private ropesBefore: Rope[] = [];
  private pendingTransition: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.twoTap = data.twoTap ?? CONFIG.rules.twoTapMode;
  }

  create(): void {
    this.dogViews.clear();
    this.knotViews.clear();
    this.overlay = null;
    this.pushTimer = 0;
    this.best = getHighScore();

    this.model = new Game(CONFIG);
    this.model.startStage(1, 1);
    this.model.drain();
    this.layout = new Layout();
    this.layout.setRopeCount(this.model.ropes.length);

    this.drawBoard();
    this.braid = new BraidView(this, this.layout, this.snapshot()).setDepth(10);
    this.hud = new Hud(this);
    this.hud.setBest(this.best);
    this.frame = new FrameView(this, this.layout.spacing, this.layout.rowH).setDepth(20);
    this.buildCandleMarkers();
    this.buildStageViews();
    this.bindInput();
    this.getReady();
  }

  private getReady(): void {
    const L = this.layout;
    const t = this.add
      .text(L.width / 2, L.boardTop + L.boardHeight * 0.4, 'UNTANGLE!', {
        fontFamily: FONT,
        fontSize: '40px',
        color: CONFIG.colors.text,
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1.1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 650, duration: 300, onComplete: () => t.destroy() });
  }

  // ---------- static board ----------

  private drawBoard(): void {
    const L = this.layout;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(CONFIG.colors.board, 1);
    g.fillRoundedRect(8, L.boardTop - 4, L.width - 16, L.boardHeight + 8, 16);
    g.lineStyle(2, CONFIG.colors.boardEdge, 1);
    g.strokeRoundedRect(8, L.boardTop - 4, L.width - 16, L.boardHeight + 8, 16);
    g.fillStyle(CONFIG.colors.danger, 0.06);
    g.fillRect(10, L.dangerY(), L.width - 20, L.boardBottom - L.dangerY());
    g.lineStyle(1, CONFIG.colors.danger, 0.35);
    for (let x = 14; x < L.width - 14; x += 12) g.lineBetween(x, L.dangerY(), x + 6, L.dangerY());
    g.lineStyle(3, CONFIG.colors.danger, 0.5);
    g.lineBetween(12, L.boardBottom + 2, L.width - 12, L.boardBottom + 2);

    this.pushBar = this.add.graphics().setDepth(30);
    this.pushStamp = this.add
      .rectangle(L.width / 2, L.boardTop - 2, L.width - 24, 6, CONFIG.colors.bar, 1)
      .setDepth(31)
      .setAlpha(0);
  }

  private buildCandleMarkers(): void {
    const mk = (big: boolean): Phaser.GameObjects.Container => {
      const c = this.add.container(0, 0).setDepth(40).setVisible(false);
      const halo = this.add.circle(0, 0, big ? 22 : 14, CONFIG.colors.danger, 0.25);
      const dot = this.add.circle(0, 0, big ? 11 : 8, 0xff2d2d, 1);
      dot.setStrokeStyle(2, 0xffffff, 0.9);
      c.add([halo, dot]);
      this.tweens.add({ targets: halo, scale: { from: 0.8, to: 1.3 }, alpha: { from: 0.4, to: 0 }, duration: 800, repeat: -1 });
      return c;
    };
    this.candleTop = mk(false);
    this.candleBottom = mk(true);
    this.candleBeam = this.add
      .rectangle(0, 0, 10, this.layout.boardHeight, 0xff6a3d, 0.35)
      .setDepth(5)
      .setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  // ---------- snapshots: model -> braid picture ----------

  private snapshotFrom(ropes: readonly Rope[], knots: readonly Knot[]): BraidSnapshot {
    const rows = CONFIG.board.rows;
    const n = ropes.length;
    const perms = computePerms(ropes, knots, rows);
    const paths = new Map<number, number[]>();
    const colors = new Map<number, number>();
    for (const rope of ropes) {
      paths.set(rope.id, []);
      colors.set(rope.id, rope.color);
    }
    for (let r = 0; r <= rows; r++) {
      for (let col = 0; col < n; col++) paths.get(ropes[perms[r][col]].id)?.push(this.layout.colX(col, n));
    }
    const crossings = [];
    for (const k of knots) {
      const c = ropes.findIndex((rope) => rope.id === k.left);
      const row = perms[k.row];
      if (c < 0 || c + 1 >= n || !row) continue;
      const fromLeft = ropes[row[c]];
      const fromRight = ropes[row[c + 1]];
      const top = k.top === 'left' ? fromLeft : fromRight;
      const under = top === fromLeft ? fromRight : fromLeft;
      crossings.push({ row: k.row, col: c, topRope: top.id, underRope: under.id });
    }
    return { paths, colors, crossings };
  }

  private snapshot(): BraidSnapshot {
    return this.snapshotFrom(this.model.ropes, this.model.knots);
  }

  private transition(snap: BraidSnapshot, ms: number, shiftDown = false): void {
    this.tweens.killTweensOf(this.braid);
    this.braid.setTarget(snap, shiftDown);
    if (shiftDown) {
      this.braid.pushOffset = -this.layout.rowH;
      this.tweens.add({ targets: this.braid, pushOffset: 0, duration: ms, ease: 'Quad.easeOut' });
    }
    this.tweens.add({ targets: this.braid, t: 1, duration: ms, ease: 'Quad.easeInOut' });
  }

  // ---------- views from model ----------

  private buildStageViews(): void {
    for (const v of this.dogViews.values()) v.destroy();
    for (const v of this.knotViews.values()) v.destroy();
    this.dogViews.clear();
    this.knotViews.clear();
    const m = this.model;
    this.layout.setRopeCount(m.ropes.length);
    this.frame.resize(this.layout.spacing, this.layout.rowH);
    for (const rope of m.ropes) this.makeDog(rope);
    for (const knot of m.knots) this.makeKnotView(knot, false);
    this.hud.setLevel(m.level, m.stage);
    this.hud.setScore(m.score);
    this.hud.setBonuses(m.bonuses);
    this.hud.setChain(m.chain);
    this.hud.setFrame(m.frameType);
    this.hud.setReady(m.readyCount(), m.bonuses);
    this.frame.redraw(m.frameType);
    this.placeFrame(false);
    this.refreshPreview();
  }

  private makeDog(rope: Rope): void {
    const dog = this.add
      .text(0, this.layout.boardBottom + 20, DOGS[rope.id % DOGS.length], { fontSize: '24px' })
      .setOrigin(0.5)
      .setDepth(11);
    this.dogViews.set(rope.id, dog);
  }

  private makeKnotView(knot: Knot, pop: boolean): KnotView {
    const m = this.model;
    const n = m.ropes.length;
    const gap = m.gapOf(knot);
    const v = new KnotView(this, this.layout.gapX(gap, n), this.layout.rowY(knot.row), knot, this.layout.spacing, this.layout.rowH).setDepth(15);
    this.knotViews.set(knot.id, v);
    if (pop) {
      v.setScale(0);
      this.tweens.add({ targets: v, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
    return v;
  }

  private placeFrame(animate: boolean): void {
    const m = this.model;
    if (m.gapCount === 0) {
      this.frame.setVisible(false);
      return;
    }
    this.frame.setVisible(true);
    const n = m.ropes.length;
    const bottom = m.bottomKnot(m.frameGap);
    const x = this.layout.gapX(m.frameGap, n);
    const y = bottom ? this.layout.rowY(bottom.row) : this.layout.boardBottom - this.layout.rowH / 2;
    this.tweens.killTweensOf(this.frame);
    if (animate) this.tweens.add({ targets: this.frame, x, y, duration: CONFIG.anim.frameMoveMs, ease: 'Quad.easeOut' });
    else this.frame.setPosition(x, y);
  }

  private refreshPreview(): void {
    const m = this.model;
    if (CONFIG.rules.previewMode === 'off') {
      for (const v of this.knotViews.values()) v.setPreview('none');
      return;
    }
    const bottoms = new Set<number>();
    const perms = m.perms();
    for (let g = 0; g < m.gapCount; g++) {
      const k = m.bottomKnot(g);
      if (!k) continue;
      bottoms.add(k.id);
      this.knotViews.get(k.id)?.setPreview(m.wouldUntwist(k, m.frameType, perms) ? 'good' : 'bad');
    }
    for (const [id, v] of this.knotViews) if (!bottoms.has(id)) v.setPreview('none');
  }

  /** Columns changed (a rope left): slide knot overlays, frame and markers; the braid morphs on its own. */
  private relayout(): void {
    const m = this.model;
    const n = m.ropes.length;
    const ms = CONFIG.anim.slideMs;
    for (const knot of m.knots) {
      const v = this.knotViews.get(knot.id);
      if (!v) continue;
      this.tweens.add({ targets: v, x: this.layout.gapX(m.gapOf(knot), n), duration: ms, ease: 'Quad.easeInOut' });
    }
    this.placeFrame(true);
    this.placeCandleMarkers();
  }

  // ---------- input ----------

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-LEFT', () => this.run(() => this.model.moveFrame(this.model.frameGap - 1)));
    kb.on('keydown-RIGHT', () => this.run(() => this.model.moveFrame(this.model.frameGap + 1)));
    kb.on('keydown-SPACE', () => (this.overlay ? this.dismissOverlay() : this.run(() => this.model.act())));
    kb.on('keydown-ENTER', () => this.overlay && this.dismissOverlay());
    kb.on('keydown-F', () => this.run(() => this.model.flipWithBonus()));
    kb.on('keydown-C', () => this.run(() => this.model.candleConnect()));
  }

  private onTap(x: number, y: number): void {
    unlockAudio();
    if (this.overlay) {
      this.dismissOverlay();
      return;
    }
    const L = this.layout;
    const m = this.model;
    if (y > L.boardBottom) {
      if (this.hud.hitFlip(x, y)) {
        this.run(() => {
          if (!this.model.flipWithBonus()) this.shake(this.frame);
          else this.hud.flashFlip();
        });
        return;
      }
      if (m.candle && Math.abs(x - this.candleBottom.x) < 40 && Math.abs(y - this.candleBottom.y) < 40) {
        this.run(() => {
          if (!this.model.candleConnect()) this.shake(this.candleBottom);
        });
      }
      return;
    }
    if (y < L.boardTop - 10) return;
    const gap = L.gapFromX(x, m.ropes.length);
    this.run(() => {
      if (this.twoTap && this.model.frameGap !== gap) {
        this.model.moveFrame(gap);
        return;
      }
      this.model.moveFrame(gap);
      this.model.act();
    });
  }

  private run(cmd: () => void): void {
    if (this.model.status !== 'playing') return;
    this.ropesBefore = this.model.ropes.slice();
    cmd();
    this.handle(this.model.drain());
  }

  // ---------- event playback ----------

  private handle(events: GameEvent[]): void {
    const removed = events.filter((e) => e.type === 'ropeRemoved');
    let braidDone = false;
    for (const e of events) {
      if (e.type === 'untwist' && removed.length > 0) {
        // 1) show the last knot opening with the rope still there, 2) then let it leave
        const knots = [...this.model.knots, ...removed.flatMap((r) => (r.type === 'ropeRemoved' ? r.knots : []))].filter(
          (k) => k.id !== e.knot.id,
        );
        this.transition(this.snapshotFrom(this.ropesBefore, knots), CONFIG.anim.untwistMs);
        this.pendingTransition?.remove(false);
        this.pendingTransition = this.time.delayedCall(CONFIG.anim.untwistMs + 120, () => {
          this.transition(this.snapshot(), CONFIG.anim.ropeRemoveMs);
          this.relayout();
        });
        braidDone = true;
      }
      this.handleOne(e);
    }
    if (!braidDone && events.some((e) => e.type !== 'frameMoved' && e.type !== 'frameFlipped' && e.type !== 'chain' && e.type !== 'noKnot' && e.type !== 'bonus')) {
      const push = events.some((e) => e.type === 'push');
      this.transition(this.snapshot(), push ? CONFIG.anim.pushMs : CONFIG.anim.untwistMs, push);
      if (removed.length > 0) this.relayout();
    }
    this.hud.setScore(this.model.score);
    this.hud.setChain(this.model.chain);
    this.hud.setReady(this.model.readyCount(), this.model.bonuses);
    if (this.model.score > this.best) {
      this.best = this.model.score;
      this.hud.setBest(this.best);
    }
    this.refreshPreview();
    this.placeFrame(true);
  }

  private handleOne(e: GameEvent): void {
    const m = this.model;
    const n = m.ropes.length;
    switch (e.type) {
      case 'untwist': {
        const v = this.knotViews.get(e.knot.id);
        if (v) this.animateUntwist(v, e.knot, e.points, e.chain);
        this.knotViews.delete(e.knot.id);
        playUntwist(e.chain);
        break;
      }
      case 'chain':
        this.hud.setChain(e.chain);
        break;
      case 'twist': {
        const v = this.knotViews.get(e.knot.id);
        if (v) this.animateTwist(v);
        if (e.added) {
          const nv = this.makeKnotView(e.added, true);
          nv.setY(this.layout.rowY(e.knot.row));
          this.tweens.add({ targets: nv, y: this.layout.rowY(e.added.row), duration: CONFIG.anim.twistMs, ease: 'Back.easeOut' });
        }
        this.floatText(this.layout.gapX(m.gapOf(e.knot), n), this.layout.rowY(e.knot.row) - 20, 'TIGHTER!', '#ff6b6b');
        this.cameras.main.shake(90, 0.004);
        playTwist();
        this.pushTimer = Math.min(m.pushIntervalMs - 60, this.pushTimer + m.pushIntervalMs * CONFIG.rules.twistPushPenalty);
        this.tweens.add({ targets: this.pushStamp, alpha: { from: 1, to: 0 }, duration: 250 });
        break;
      }
      case 'noKnot':
        this.shake(this.frame);
        break;
      case 'ropeRemoved': {
        const dog = this.dogViews.get(e.rope.id);
        if (dog) {
          this.dogViews.delete(e.rope.id);
          this.tweens.killTweensOf(dog);
          const dir = dog.x < this.layout.centerX ? -1 : 1;
          dog.setFlipX(dir > 0);
          this.tweens.add({ targets: dog, scale: 1.5, duration: 160, yoyo: true });
          this.tweens.add({
            targets: dog,
            x: dog.x + dir * 260,
            y: dog.y - 20,
            angle: dir * 25,
            delay: CONFIG.anim.untwistMs,
            duration: 600,
            ease: 'Quad.easeIn',
            onComplete: () => dog.destroy(),
          });
        }
        for (const k of e.knots) {
          const kv = this.knotViews.get(k.id);
          if (kv) this.tweens.add({ targets: kv, scale: 0, alpha: 0, duration: 200, onComplete: () => kv.destroy() });
          this.knotViews.delete(k.id);
        }
        this.time.delayedCall(CONFIG.anim.untwistMs, () => this.ropeFlash(e.rope));
        playRopeClear();
        if (e.cause === 'untwist' && CONFIG.rules.ropeClearResetsPush) this.pushTimer = 0;
        this.floatText(
          this.layout.centerX,
          this.layout.boardTop + 60,
          e.cause === 'candle' ? `BURNED +${CONFIG.scoring.candleRope}` : `DOG FREE! +${CONFIG.scoring.ropeRemoved}`,
          '#ffd166',
          22,
        );
        break;
      }
      case 'frameMoved':
        this.placeFrame(true);
        break;
      case 'frameFlipped':
        this.frame.redraw(e.frameType);
        this.hud.setFrame(e.frameType);
        this.tweens.add({ targets: this.frame, scale: { from: 1.25, to: 1 }, duration: 140, ease: 'Quad.easeOut' });
        break;
      case 'push':
        this.animatePush(e.spawned);
        playPush();
        break;
      case 'bonus':
        this.hud.setBonuses(e.bonuses);
        playBonus();
        break;
      case 'candleStart':
        this.placeCandleMarkers();
        break;
      case 'candleEnd':
        this.placeCandleMarkers();
        if (e.success) this.cameras.main.flash(180, 255, 140, 60);
        break;
      case 'brush':
        this.cameras.main.flash(120, 255, 255, 255);
        this.floatText(this.frame.x, this.frame.y - 24, 'PAINTED', '#ffffff');
        break;
      case 'stageClear':
        this.time.delayedCall(900, () => this.showOverlay('stageClear', e.bonusPoints));
        break;
      case 'gameOver':
        if (m.score > getHighScore()) setHighScore(m.score);
        playGameOver();
        this.cameras.main.shake(350, 0.012);
        this.time.delayedCall(700, () => this.showOverlay('gameOver', 0));
        break;
      default:
        break;
    }
  }

  // ---------- animations ----------

  private animateUntwist(v: KnotView, knot: Knot, points: number, chain: number): void {
    v.setPreview('none');
    v.glow.setAlpha(0);
    this.tweens.add({ targets: v, scale: 1.6, alpha: 0, duration: CONFIG.anim.untwistMs, ease: 'Quad.easeOut', onComplete: () => v.destroy() });
    this.burst(v.x, v.y, 8, 0xffffff);
    for (const id of [knot.left, knot.right]) {
      const dog = this.dogViews.get(id);
      if (dog) this.tweens.add({ targets: dog, scale: { from: 1.35, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    }
    this.floatText(v.x, v.y - 16, chain > 1 ? `+${points}  x${chain}` : `+${points}`, '#9dffb0', 14 + Math.min(chain, 8) * 2);
  }

  private animateTwist(v: KnotView): void {
    const flash = this.add.circle(v.x, v.y, this.layout.spacing * 0.6, 0xff3b3b, 0.55).setDepth(16).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    this.tweens.add({ targets: v, scale: 1.35, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  private ropeFlash(rope: Rope): void {
    const L = this.layout;
    const x = this.braid.bottomX(rope.id) ?? L.centerX;
    const color = CONFIG.colors.palette[rope.color % CONFIG.colors.palette.length];
    const flash = this.add
      .rectangle(x, (L.boardTop + L.boardBottom) / 2, 18, L.boardHeight, 0xffffff, 0.8)
      .setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scaleX: 3, alpha: 0, duration: 320, onComplete: () => flash.destroy() });
    for (let i = 0; i < 14; i++) {
      const y = L.boardTop + (i + 0.5) * (L.boardHeight / 14);
      const bead = this.add.circle(x, y, CONFIG.layout.beadRadius, color, 1).setDepth(13);
      this.tweens.add({
        targets: bead,
        x: x + Phaser.Math.Between(-70, 70),
        y: y - Phaser.Math.Between(40, 140),
        alpha: 0,
        scale: 0.3,
        duration: CONFIG.anim.ropeRemoveMs + Phaser.Math.Between(0, 200),
        ease: 'Quad.easeOut',
        onComplete: () => bead.destroy(),
      });
    }
    this.cameras.main.shake(140, 0.006);
  }

  private animatePush(spawned: Knot[]): void {
    const L = this.layout;
    const m = this.model;
    this.pushStamp.setAlpha(1).setY(L.boardTop - 2);
    this.tweens.add({ targets: this.pushStamp, y: L.boardTop + L.rowH * 0.8, duration: CONFIG.anim.pushMs * 0.5, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.pushStamp.setAlpha(0) });
    for (const knot of m.knots) {
      const v = this.knotViews.get(knot.id);
      if (!v || spawned.includes(knot)) continue;
      this.tweens.add({ targets: v, y: L.rowY(knot.row), duration: CONFIG.anim.pushMs, ease: 'Quad.easeOut' });
    }
    for (const knot of spawned) this.makeKnotView(knot, true);
    this.cameras.main.shake(70, 0.002);
  }

  private burst(x: number, y: number, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const p = this.add.circle(x, y, 3, color, 1).setDepth(18);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * 34, y: y + Math.sin(a) * 34, alpha: 0, duration: 300, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
  }

  private floatText(x: number, y: number, text: string, color: string, size = 16): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({ targets: t, y: y - 44, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private shake(target: Phaser.GameObjects.Components.Transform): void {
    const x0 = target.x;
    this.tweens.add({ targets: target, x: x0 + 6, duration: 40, yoyo: true, repeat: 2, onComplete: () => target.setX(x0) });
  }

  private placeCandleMarkers(): void {
    const m = this.model;
    const c = m.candle;
    if (!c) {
      this.candleTop.setVisible(false);
      this.candleBottom.setVisible(false);
      this.candleBeam.setVisible(false);
      return;
    }
    const n = m.ropes.length;
    const i = m.ropeIndex(c.ropeId);
    const L = this.layout;
    this.candleTop.setVisible(true).setPosition(L.colX(i, n), L.boardTop - 2);
    this.candleBottom.setVisible(true).setPosition(L.colX(c.targetIndex, n), L.boardBottom + 30);
    const aligned = m.candleAligned();
    this.candleBeam.setVisible(aligned).setPosition(L.colX(c.targetIndex, n), (L.boardTop + L.boardBottom) / 2);
  }

  // ---------- overlays ----------

  private showOverlay(kind: 'stageClear' | 'gameOver', bonusPoints: number): void {
    const L = this.layout;
    const m = this.model;
    const c = this.add.container(0, 0).setDepth(100);
    const bg = this.add.rectangle(L.width / 2, L.height / 2, L.width, L.height, 0x000000, 0.72);
    const title = kind === 'stageClear' ? `ALL DOGS HOME  ${m.level}-${m.stage}` : 'TANGLED!';
    const t1 = this.add
      .text(L.width / 2, L.height / 2 - 70, title, { fontFamily: FONT, fontSize: '30px', color: CONFIG.colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    const line2 = kind === 'stageClear' ? `+${bonusPoints} stage bonus` : `Score ${m.score}   Best ${Math.max(this.best, m.score)}`;
    const t2 = this.add
      .text(L.width / 2, L.height / 2 - 20, line2, { fontFamily: FONT, fontSize: '18px', color: CONFIG.colors.textDim })
      .setOrigin(0.5);
    const t3 = this.add
      .text(L.width / 2, L.height / 2 + 40, kind === 'stageClear' ? 'TAP FOR THE NEXT WALK' : 'TAP TO PLAY AGAIN', {
        fontFamily: FONT,
        fontSize: '20px',
        color: CONFIG.colors.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: t3, alpha: { from: 1, to: 0.3 }, duration: 600, yoyo: true, repeat: -1 });
    c.add([bg, t1, t2, t3]);
    c.setData('kind', kind);
    this.overlay = c;
  }

  private dismissOverlay(): void {
    if (!this.overlay) return;
    const kind = this.overlay.getData('kind') as 'stageClear' | 'gameOver';
    this.overlay.destroy();
    this.overlay = null;
    if (kind === 'stageClear') {
      this.model.nextStage();
      this.model.drain();
      this.pushTimer = 0;
      this.layout.setRopeCount(this.model.ropes.length);
      this.braid.setTarget(this.snapshot());
      this.braid.t = 1;
      this.buildStageViews();
      this.placeCandleMarkers();
      this.getReady();
      return;
    }
    this.scene.restart({ twoTap: this.twoTap });
  }

  // ---------- frame loop ----------

  update(time: number, delta: number): void {
    const m = this.model;
    const L = this.layout;
    if (m.status === 'playing' && !this.overlay) {
      this.pushTimer += delta;
      const interval = m.pushIntervalMs;
      if (this.pushTimer >= interval) {
        this.pushTimer = 0;
        this.ropesBefore = m.ropes.slice();
        m.push();
        this.handle(m.drain());
      }
      m.tick(delta);
      const evs = m.drain();
      if (evs.length) this.handle(evs);
      const frac = Math.min(1, this.pushTimer / interval);
      this.pushBar.clear();
      this.pushBar.fillStyle(0x2a2e3f, 1);
      this.pushBar.fillRoundedRect(12, L.boardTop - 8, L.width - 24, 6, 3);
      this.pushBar.fillStyle(frac > 0.8 ? 0xffb42e : CONFIG.colors.bar, 1);
      this.pushBar.fillRoundedRect(12, L.boardTop - 8, Math.max(6, (L.width - 24) * frac), 6, 3);
      this.hud.setCandle(m.candle ? m.candle.msLeft / m.candle.msTotal : null);
    }
    if (this.braid.animating || this.braid.dirty) this.braid.draw();
    for (const [id, dog] of this.dogViews) {
      const x = this.braid.bottomX(id);
      if (x !== undefined) dog.setX(x);
    }
    const dangerStart = CONFIG.board.rows - CONFIG.board.dangerRows;
    for (const v of this.knotViews.values()) {
      const k = v.knot;
      if (k.row < dangerStart) {
        v.glow.setAlpha(0);
        continue;
      }
      const depth = (k.row - dangerStart + 1) / CONFIG.board.dangerRows;
      const speed = 0.004 + depth * 0.008;
      v.glow.setAlpha(Math.max(0, 0.25 + depth * 0.35 + Math.sin(time * speed) * 0.2));
      v.glow.setScale(1 + Math.sin(time * speed) * 0.15 * depth);
    }
    if (m.candle) {
      const aligned = m.candleAligned();
      this.candleBeam.setVisible(aligned);
      if (aligned) this.candleBeam.setAlpha(0.25 + Math.sin(time * 0.01) * 0.15);
    }
  }
}
