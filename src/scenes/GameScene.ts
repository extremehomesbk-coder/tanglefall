import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Game } from '../model/game';
import type { GameEvent, Knot, Rope } from '../model/types';
import { getHighScore, setHighScore } from '../storage';
import { FrameView } from '../view/FrameView';
import { Hud } from '../view/Hud';
import { KnotView } from '../view/KnotView';
import { Layout } from '../view/layout';
import { RopeView } from '../view/RopeView';

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export interface GameSceneData {
  twoTap?: boolean;
}

export class GameScene extends Phaser.Scene {
  private model!: Game;
  private layout!: Layout;
  private ropeViews = new Map<number, RopeView>();
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

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.twoTap = data.twoTap ?? CONFIG.rules.twoTapMode;
  }

  create(): void {
    this.ropeViews.clear();
    this.knotViews.clear();
    this.overlay = null;
    this.pushTimer = 0;
    this.best = getHighScore();

    this.model = new Game(CONFIG);
    this.model.startStage(1, 1);
    this.model.drain();
    this.layout = new Layout();

    this.drawBoard();
    this.hud = new Hud(this);
    this.hud.setBest(this.best);
    this.frame = new FrameView(this, this.layout.spacing, this.layout.rowH).setDepth(20);
    this.buildCandleMarkers();
    this.buildStageViews();
    this.bindInput();
  }

  // ---------- static board ----------

  private drawBoard(): void {
    const L = this.layout;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(CONFIG.colors.board, 1);
    g.fillRoundedRect(8, L.boardTop - 4, L.width - 16, L.boardHeight + 8, 16);
    g.lineStyle(2, CONFIG.colors.boardEdge, 1);
    g.strokeRoundedRect(8, L.boardTop - 4, L.width - 16, L.boardHeight + 8, 16);
    // danger zone
    g.fillStyle(CONFIG.colors.danger, 0.06);
    g.fillRect(10, L.dangerY(), L.width - 20, L.boardBottom - L.dangerY());
    g.lineStyle(1, CONFIG.colors.danger, 0.35);
    for (let x = 14; x < L.width - 14; x += 12) g.lineBetween(x, L.dangerY(), x + 6, L.dangerY());
    // bottom edge = the floor knots must not reach
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

  // ---------- views from model ----------

  private buildStageViews(): void {
    for (const v of this.ropeViews.values()) v.destroy();
    for (const v of this.knotViews.values()) v.destroy();
    this.ropeViews.clear();
    this.knotViews.clear();
    const m = this.model;
    this.layout.setRopeCount(m.ropes.length);
    this.frame.resize(this.layout.spacing, this.layout.rowH);
    const n = m.ropes.length;
    m.ropes.forEach((rope, i) => this.makeRopeView(rope, this.layout.colX(i, n)));
    for (const knot of m.knots) this.makeKnotView(knot, false);
    this.hud.setLevel(m.level, m.stage);
    this.hud.setScore(m.score);
    this.hud.setBonuses(m.bonuses);
    this.hud.setChain(m.chain);
    this.hud.setFrame(m.frameType);
    this.frame.redraw(m.frameType);
    this.placeFrame(false);
    this.refreshPreview();
  }

  private makeRopeView(rope: Rope, x: number): RopeView {
    const v = new RopeView(this, x, this.layout.boardTop + 4, this.layout.boardBottom - 4, rope.color).setDepth(10);
    this.ropeViews.set(rope.id, v);
    return v;
  }

  private makeKnotView(knot: Knot, pop: boolean): KnotView {
    const m = this.model;
    const n = m.ropes.length;
    const gap = m.gapOf(knot);
    const v = new KnotView(
      this,
      this.layout.gapX(gap, n),
      this.layout.rowY(knot.row),
      knot,
      this.layout.spacing,
      this.layout.rowH,
      m.ropeById(knot.left)?.color ?? 0,
      m.ropeById(knot.right)?.color ?? 0,
    ).setDepth(15);
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

  /** Green/red outline on the bottom-most knot of every gap for the current frame type. */
  private refreshPreview(): void {
    const m = this.model;
    const bottoms = new Set<number>();
    for (let g = 0; g < m.gapCount; g++) {
      const k = m.bottomKnot(g);
      if (!k) continue;
      bottoms.add(k.id);
      this.knotViews.get(k.id)?.setPreview(m.wouldUntwist(k) ? 'good' : 'bad');
    }
    for (const [id, v] of this.knotViews) if (!bottoms.has(id)) v.setPreview('none');
  }

  private relayout(): void {
    const m = this.model;
    const n = m.ropes.length;
    const ms = CONFIG.anim.slideMs;
    m.ropes.forEach((rope, i) => {
      const v = this.ropeViews.get(rope.id);
      if (!v) return;
      this.tweens.killTweensOf(v);
      this.tweens.add({ targets: v, x: this.layout.colX(i, n), duration: ms, ease: 'Quad.easeInOut' });
    });
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

  /** Run a model command, then play every event it produced. */
  private run(cmd: () => void): void {
    if (this.model.status !== 'playing') return;
    cmd();
    this.handle(this.model.drain());
  }

  // ---------- event playback ----------

  private handle(events: GameEvent[]): void {
    for (const e of events) this.handleOne(e);
    this.hud.setScore(this.model.score);
    this.hud.setChain(this.model.chain);
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
        break;
      }
      case 'twist': {
        const v = this.knotViews.get(e.knot.id);
        if (v) this.animateTwist(v, e.knot);
        if (e.added) {
          const nv = this.makeKnotView(e.added, true);
          nv.setY(this.layout.rowY(e.knot.row));
          this.tweens.add({ targets: nv, y: this.layout.rowY(e.added.row), duration: CONFIG.anim.twistMs, ease: 'Back.easeOut' });
        }
        this.floatText(this.layout.gapX(m.gapOf(e.knot), n), this.layout.rowY(e.knot.row) - 20, 'TIGHTER!', '#ff6b6b');
        this.cameras.main.shake(90, 0.004);
        break;
      }
      case 'noKnot':
        this.shake(this.frame);
        break;
      case 'ropeRemoved': {
        const v = this.ropeViews.get(e.rope.id);
        if (v) this.animateRopeRemove(v, e.rope);
        this.ropeViews.delete(e.rope.id);
        for (const k of e.knots) {
          const kv = this.knotViews.get(k.id);
          if (kv) this.tweens.add({ targets: kv, scale: 0, alpha: 0, duration: 200, onComplete: () => kv.destroy() });
          this.knotViews.delete(k.id);
        }
        this.floatText(
          this.layout.centerX,
          this.layout.boardTop + 60,
          e.cause === 'candle' ? `BURNED +${CONFIG.scoring.candleRope}` : `ROPE CLEAR +${CONFIG.scoring.ropeRemoved}`,
          '#ffd166',
          22,
        );
        this.time.delayedCall(CONFIG.anim.ropeRemoveMs * 0.6, () => this.relayout());
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
        break;
      case 'bonus':
        this.hud.setBonuses(e.bonuses);
        break;
      case 'candleStart':
        this.placeCandleMarkers();
        break;
      case 'candleEnd':
        this.placeCandleMarkers();
        if (e.success) this.cameras.main.flash(180, 255, 140, 60);
        break;
      case 'brush':
        for (const id of e.ropeIds) {
          const rope = m.ropeById(id);
          const v = this.ropeViews.get(id);
          if (rope && v) {
            v.redraw(rope.color);
            this.tweens.add({ targets: v, alpha: { from: 0.2, to: 1 }, duration: 350 });
          }
        }
        for (const knot of m.knots) {
          if (e.ropeIds.includes(knot.left) || e.ropeIds.includes(knot.right)) {
            this.knotViews.get(knot.id)?.redraw(m.ropeById(knot.left)?.color ?? 0, m.ropeById(knot.right)?.color ?? 0);
          }
        }
        this.floatText(this.frame.x, this.frame.y - 24, 'PAINTED', '#ffffff');
        break;
      case 'stageClear':
        this.time.delayedCall(650, () => this.showOverlay('stageClear', e.bonusPoints));
        break;
      case 'gameOver':
        if (m.score > getHighScore()) setHighScore(m.score);
        this.cameras.main.shake(350, 0.012);
        this.time.delayedCall(700, () => this.showOverlay('gameOver', 0));
        break;
      default:
        break;
    }
  }

  // ---------- animations ----------

  private animateUntwist(v: KnotView, knot: Knot, points: number, chain: number): void {
    const dir = knot.top === 'left' ? -1 : 1;
    v.setPreview('none');
    v.glow.setAlpha(0);
    this.tweens.add({
      targets: v,
      angle: dir * 180,
      scaleX: 0.05,
      scaleY: 1.3,
      alpha: 0,
      duration: CONFIG.anim.untwistMs,
      ease: 'Cubic.easeIn',
      onComplete: () => v.destroy(),
    });
    this.burst(v.x, v.y, 8, 0xffffff);
    this.wiggle(knot.left);
    this.wiggle(knot.right);
    this.floatText(v.x, v.y - 16, chain > 1 ? `+${points}  x${chain}` : `+${points}`, '#9dffb0');
  }

  private animateTwist(v: KnotView, knot: Knot): void {
    v.redraw(this.model.ropeById(knot.left)?.color ?? 0, this.model.ropeById(knot.right)?.color ?? 0);
    const flash = this.add.circle(v.x, v.y, this.layout.spacing * 0.6, 0xff3b3b, 0.55).setDepth(16).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    this.tweens.add({ targets: v, scale: 1.35, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: v, x: v.x + 4, duration: 40, yoyo: true, repeat: 3 });
  }

  private animateRopeRemove(v: RopeView, rope: Rope): void {
    const L = this.layout;
    this.tweens.killTweensOf(v);
    const color = CONFIG.colors.palette[rope.color % CONFIG.colors.palette.length];
    const flash = this.add
      .rectangle(v.x, (L.boardTop + L.boardBottom) / 2, 18, L.boardHeight, 0xffffff, 0.8)
      .setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scaleX: 3, alpha: 0, duration: 320, onComplete: () => flash.destroy() });
    for (let i = 0; i < 14; i++) {
      const y = L.boardTop + (i + 0.5) * (L.boardHeight / 14);
      const bead = this.add.circle(v.x, y, CONFIG.layout.beadRadius, color, 1).setDepth(13);
      this.tweens.add({
        targets: bead,
        x: v.x + Phaser.Math.Between(-70, 70),
        y: y - Phaser.Math.Between(40, 140),
        alpha: 0,
        scale: 0.3,
        duration: CONFIG.anim.ropeRemoveMs + Phaser.Math.Between(0, 200),
        ease: 'Quad.easeOut',
        onComplete: () => bead.destroy(),
      });
    }
    this.tweens.add({ targets: v, alpha: 0, scaleY: 0.2, duration: CONFIG.anim.ropeRemoveMs * 0.5, onComplete: () => v.destroy() });
    this.cameras.main.shake(140, 0.006);
  }

  private animatePush(spawned: Knot[]): void {
    const L = this.layout;
    const m = this.model;
    this.pushStamp.setAlpha(1).setY(L.boardTop - 2);
    this.tweens.add({ targets: this.pushStamp, y: L.boardTop + L.rowH * 0.8, duration: CONFIG.anim.pushMs * 0.5, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.pushStamp.setAlpha(0) });
    for (const knot of m.knots) {
      const v = this.knotViews.get(knot.id);
      if (!v) continue;
      if (spawned.includes(knot)) continue;
      this.tweens.add({ targets: v, y: L.rowY(knot.row), duration: CONFIG.anim.pushMs, ease: 'Quad.easeOut' });
    }
    for (const knot of spawned) this.makeKnotView(knot, true);
    this.cameras.main.shake(70, 0.002);
  }

  private wiggle(ropeId: number): void {
    const v = this.ropeViews.get(ropeId);
    if (!v) return;
    const x0 = v.x;
    this.tweens.killTweensOf(v);
    this.tweens.add({ targets: v, x: x0 + 5, duration: 45, yoyo: true, repeat: 3, onComplete: () => v.setX(x0) });
  }

  private burst(x: number, y: number, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const p = this.add.circle(x, y, 3, color, 1).setDepth(18);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * 34,
        y: y + Math.sin(a) * 34,
        alpha: 0,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
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
    const title = kind === 'stageClear' ? `STAGE ${m.level}-${m.stage} CLEAR` : 'TANGLED!';
    const t1 = this.add
      .text(L.width / 2, L.height / 2 - 70, title, { fontFamily: FONT, fontSize: '34px', color: CONFIG.colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    const line2 =
      kind === 'stageClear' ? `+${bonusPoints} stage bonus` : `Score ${m.score}   Best ${Math.max(this.best, m.score)}`;
    const t2 = this.add
      .text(L.width / 2, L.height / 2 - 20, line2, { fontFamily: FONT, fontSize: '18px', color: CONFIG.colors.textDim })
      .setOrigin(0.5);
    const t3 = this.add
      .text(L.width / 2, L.height / 2 + 40, kind === 'stageClear' ? 'TAP FOR NEXT STAGE' : 'TAP TO PLAY AGAIN', {
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
      this.buildStageViews();
      this.placeCandleMarkers();
      return;
    }
    if (CONFIG.rules.restartFromLevelOne) {
      this.scene.restart({ twoTap: this.twoTap });
      return;
    }
    this.model.startStage(this.model.level, 1);
    this.model.drain();
    this.model.score = 0;
    this.model.bonuses = 0;
    this.pushTimer = 0;
    this.buildStageViews();
    this.placeCandleMarkers();
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
        m.push();
        this.handle(m.drain());
      }
      m.tick(delta);
      const evs = m.drain();
      if (evs.length) this.handle(evs);
      // push progress bar
      const frac = Math.min(1, this.pushTimer / interval);
      this.pushBar.clear();
      this.pushBar.fillStyle(0x2a2e3f, 1);
      this.pushBar.fillRoundedRect(12, L.boardTop - 8, L.width - 24, 6, 3);
      const urgent = frac > 0.8;
      this.pushBar.fillStyle(urgent ? 0xffb42e : CONFIG.colors.bar, 1);
      this.pushBar.fillRoundedRect(12, L.boardTop - 8, Math.max(6, (L.width - 24) * frac), 6, 3);
      this.hud.setCandle(m.candle ? m.candle.msLeft / m.candle.msTotal : null);
    }
    // danger pulse: lower knots pulse faster and brighter
    const dangerStart = CONFIG.board.rows - CONFIG.board.dangerRows;
    for (const v of this.knotViews.values()) {
      const k = v.knot;
      if (k.row < dangerStart) {
        v.glow.setAlpha(0);
        continue;
      }
      const depth = (k.row - dangerStart + 1) / CONFIG.board.dangerRows; // 0..1
      const speed = 0.004 + depth * 0.008;
      const a = 0.25 + depth * 0.35 + Math.sin(time * speed) * 0.2;
      v.glow.setAlpha(Math.max(0, a));
      v.glow.setScale(1 + Math.sin(time * speed) * 0.15 * depth);
    }
    if (m.candle) {
      const aligned = m.candleAligned();
      this.candleBeam.setVisible(aligned);
      if (aligned) this.candleBeam.setAlpha(0.25 + Math.sin(time * 0.01) * 0.15);
    }
  }
}
