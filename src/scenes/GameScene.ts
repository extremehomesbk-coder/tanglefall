import Phaser from 'phaser';
import { playBonus, playClick, playGameOver, playPush, playRopeClear, playTwist, playUntwist, playWalkClear, unlockAudio } from '../audio';
import { CONFIG } from '../config';
import { dailySeed, dateKey, streakNow } from '../daily';
import { buzz } from '../haptics';
import { applyMove, chooseMove, type BotStyle } from '../model/bot';
import { computePerms, Game } from '../model/game';
import type { GameEvent, Knot, Rope } from '../model/types';
import { getDaily, getHighScore, getStats, setDaily, setHighScore, updateStats } from '../storage';
import { addBackdrop, addDangerVignette } from '../view/Backdrop';
import { BraidView, type BraidSnapshot } from '../view/BraidView';
import { FrameView } from '../view/FrameView';
import { Hud } from '../view/Hud';
import { KnotView } from '../view/KnotView';
import { Layout } from '../view/layout';
import { HD } from '../hd';

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
type OverlayKind = 'stageClear' | 'walkOver' | 'gameOver' | 'paused';
/** ?demo=: 'fail' plays until it is CONFIG.demo.failStopShort dogs from the target (or failPlayMs), then idles out the clock. */
type DemoStyle = BotStyle | 'fail';
export type GameMode = 'run' | 'daily';

export interface GameSceneData {
  twoTap?: boolean;
  mode?: GameMode;
  assist?: boolean; // show the green/red rings on every walk (settings); the first walk ever shows them anyway
}

export class GameScene extends Phaser.Scene {
  private model!: Game;
  private layout!: Layout;
  private braid!: BraidView;
  private dogViews = new Map<number, Phaser.GameObjects.Image>();
  private knotViews = new Map<number, KnotView>();
  private frame!: FrameView;
  private hud!: Hud;
  private pushBar!: Phaser.GameObjects.Graphics;
  private pushStamp!: Phaser.GameObjects.Rectangle;
  private candleTop!: Phaser.GameObjects.Container;
  private candleBottom!: Phaser.GameObjects.Container;
  private candleBeam!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Image;
  private overlay: Phaser.GameObjects.Container | null = null;
  private pushTimer = 0;
  private twoTap = false;
  private mode: GameMode = 'run';
  private assist = false;
  private coaching = false; // first walk ever: rings + hints, whatever the setting
  private coachedTwist = false;
  private best = 0;
  private ropesBefore: Rope[] = [];
  private pendingTransition: Phaser.Time.TimerEvent | null = null;
  private auto = false;
  private demoStyle: DemoStyle = 'play';
  private hookText: string | null = null;
  private holdOverlay = false; // ?hold=1 (clips): the bot leaves end-of-walk overlays on screen
  private walkStartMs = 0;
  private autoTimer = 0;
  private fpsTimer = 0;
  private maxChain = 0;
  private laneBusyUntil: number[] = [0, 0, 0, 0];
  private laneDots!: Phaser.GameObjects.Graphics;
  private walkTarget = -1; // one-tap mode: the gap the frame is walking to (-1 = not walking)
  private walkAct = false;
  private walker: Phaser.Time.TimerEvent | null = null;
  private seed: number | undefined;
  private onHidden = (): void => this.pause();

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.twoTap = data.twoTap ?? CONFIG.rules.twoTapMode;
    this.mode = data.mode ?? 'run';
    this.assist = data.assist ?? CONFIG.coach.assistDefault;
  }

  preload(): void {
    // original flat dog sprites (public/dogs, drawn by scripts/make_dogs.py); 2x texture so phones stay crisp
    for (const b of CONFIG.breeds) {
      const key = `dog-${b.sprite}`;
      if (!this.textures.exists(key)) this.load.svg(key, `dogs/${b.sprite}.svg`, { scale: 2 * HD });
    }
  }

  create(): void {
    this.dogViews.clear();
    this.knotViews.clear();
    this.overlay = null;
    this.pushTimer = 0;
    this.maxChain = 0;
    this.coachedTwist = false;
    this.laneBusyUntil = [0, 0, 0, 0];
    this.best = getHighScore();

    const q = new URLSearchParams(window.location.search);
    const urlSeed = Number(q.get('seed'));
    this.auto = q.has('auto');
    this.demoStyle = this.auto ? ((q.get('demo') as DemoStyle | null) ?? 'play') : 'play';
    this.hookText = this.auto ? q.get('hook') : null;
    this.holdOverlay = this.auto && q.has('hold');
    if (this.auto && q.get('mode') === 'daily') this.mode = 'daily';
    if (this.mode === 'daily') this.seed = dailySeed(dateKey(), CONFIG.daily.seedBase);
    else this.seed = Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : undefined;
    this.coaching = !this.auto && CONFIG.coach.firstWalkAssist && !getStats().coached;
    this.model = new Game(CONFIG, this.seed);
    const walk = (q.get('walk') ?? '1-1').split('-').map(Number);
    if (this.mode === 'daily') this.model.startStage(CONFIG.daily.level, CONFIG.daily.stage);
    else this.model.startStage(this.auto && walk[0] > 0 ? walk[0] : 1, this.auto && walk[1] > 0 ? walk[1] : 1);
    const walkSec = Number(q.get('walksec'));
    if (this.auto && walkSec > 0) this.model.walkMsLeft = walkSec * 1000;
    this.walkStartMs = this.model.walkMsLeft;
    this.model.drain();
    this.noteWalkStart();
    this.layout = new Layout();
    this.layout.setRopeCount(this.model.ropes.length);
    this.cameras.main.setZoom(HD).centerOn(CONFIG.layout.width / 2, CONFIG.layout.height / 2);

    addBackdrop(this);
    this.drawBoard();
    this.braid = new BraidView(this, this.layout, this.snapshot()).setDepth(10);
    this.hud = new Hud(this);
    this.hud.setBest(this.best);
    this.frame = new FrameView(this, this.layout.spacing, this.layout.rowH).setDepth(20);
    this.laneDots = this.add.graphics().setDepth(21);
    this.vignette = addDangerVignette(this);
    this.buildCandleMarkers();
    this.buildStageViews();
    this.bindInput();
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden));
    this.getReady();
  }

  private noteWalkStart(): void {
    if (this.auto) return;
    updateStats((s) => {
      s.walksPlayed += 1;
    });
    if (this.mode === 'daily') {
      const today = dateKey();
      const d = getDaily();
      if (d.date !== today) {
        const carry = streakNow(d.date, d.streak, d.cleared, today);
        setDaily({ v: 1, date: today, best: 0, cleared: false, attempts: 1, streak: carry });
      } else {
        d.attempts += 1;
        setDaily(d);
      }
    }
  }

  private getReady(): void {
    const L = this.layout;
    if (this.hookText) {
      this.showHook(this.hookText);
      this.hookText = null;
      return;
    }
    if (CONFIG.rules.walkMode) {
      const sub = this.add
        .text(L.width / 2, L.boardTop + L.boardHeight * 0.4 + 34, this.mode === 'daily' ? `today's walk: ${this.model.walkTarget} dogs home` : `get ${this.model.walkTarget} dogs home`, {
          fontFamily: FONT,
          fontSize: '18px',
          color: CONFIG.colors.text,
          stroke: '#000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(90);
      this.tweens.add({ targets: sub, alpha: 0, delay: 900, duration: 300, onComplete: () => sub.destroy() });
    }
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
    if (this.coaching) this.time.delayedCall(1000, () => this.coachLine('Tap a knot with a GREEN ring'));
  }

  /** Coach line for the first walk: a pill under the HUD that fades after CONFIG.coach.hintMs. */
  private coachLine(text: string): void {
    const L = this.layout;
    const y = L.boardTop + 26;
    const bg = this.add.rectangle(L.width / 2, y, L.width - 48, 36, 0x000000, 0.7).setDepth(89);
    bg.setStrokeStyle(1.5, 0x9dffb0, 0.8);
    const t = this.add
      .text(L.width / 2, y, text, { fontFamily: FONT, fontSize: '15px', color: '#dfffe6', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(90);
    const made = [bg, t];
    for (const o of made) o.setAlpha(0);
    this.tweens.add({ targets: made, alpha: 1, duration: 200 });
    this.tweens.add({ targets: made, alpha: 0, delay: CONFIG.coach.hintMs, duration: 300, onComplete: () => made.forEach((o) => o.destroy()) });
  }

  /** Clip hook (?hook=line|line2): big centred text over the board while the bot waits, then the walk starts. */
  private showHook(text: string): void {
    const L = this.layout;
    const lines = text.split('|');
    const cx = L.width / 2;
    const cy = L.boardTop + L.boardHeight * 0.36;
    const made: Phaser.GameObjects.GameObject[] = [];
    const bg = this.add.rectangle(cx, cy, L.width - 32, 60 + lines.length * 44, 0x000000, 0.62).setDepth(89);
    made.push(bg);
    lines.forEach((line, i) => {
      const t = this.add
        .text(cx, cy - ((lines.length - 1) * 44) / 2 + i * 44, line.trim(), {
          fontFamily: FONT,
          fontSize: i === 0 ? '34px' : '26px',
          color: i === 0 ? CONFIG.colors.text : '#ffd166',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 6,
          align: 'center',
          wordWrap: { width: L.width - 48 },
        })
        .setOrigin(0.5)
        .setDepth(90)
        .setScale(0.6);
      this.tweens.add({ targets: t, scale: 1, duration: 260, delay: i * 120, ease: 'Back.easeOut' });
      made.push(t);
    });
    this.autoTimer = -CONFIG.demo.hookMs; // the bot waits while the hook is up
    this.tweens.add({ targets: made, alpha: 0, delay: CONFIG.demo.hookMs, duration: 250, onComplete: () => made.forEach((o) => o.destroy()) });
  }

  // ---------- static board ----------

  private drawBoard(): void {
    const L = this.layout;
    const g = this.add.graphics().setDepth(0);
    // translucent panel so the leashes read against the sky
    g.fillStyle(CONFIG.colors.panel, 0.55);
    g.fillRoundedRect(8, L.boardTop - 4, L.width - 16, L.boardHeight + 8, 16);
    g.lineStyle(1.5, CONFIG.colors.boardEdge, 0.8);
    g.strokeRoundedRect(8, L.boardTop - 4, L.width - 16, L.boardHeight + 8, 16);
    // danger zone: a red wash that deepens towards the floor
    const steps = 6;
    const h = (L.boardBottom - L.dangerY()) / steps;
    for (let i = 0; i < steps; i++) {
      g.fillStyle(CONFIG.colors.danger, 0.03 + i * 0.022);
      g.fillRect(10, L.dangerY() + i * h, L.width - 20, h + 0.5);
    }
    g.lineStyle(1, CONFIG.colors.danger, 0.35);
    for (let x = 14; x < L.width - 14; x += 12) g.lineBetween(x, L.dangerY(), x + 6, L.dangerY());
    g.lineStyle(3, CONFIG.colors.danger, 0.55);
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
    this.hud.setLevel(m.level, m.stage, this.mode === 'daily');
    this.hud.setScore(m.score);
    this.hud.setBonuses(m.bonuses);
    this.hud.setChain(m.chain);
    this.hud.setFrame(m.frameType);
    this.hud.setReady(m.readyCount(), m.bonuses);
    this.hud.setHome(m.dogsFreed, m.walkTarget);
    this.hud.setWalk(m.walkMsLeft);
    this.frame.redraw(m.frameType);
    this.placeFrame(false);
    this.refreshPreview();
    this.refreshLanes();
  }

  private makeDog(rope: Rope): void {
    const breed = this.model.breedOf(rope);
    const dog = this.add
      .image(0, this.layout.boardBottom + 2, `dog-${breed.sprite}`)
      .setOrigin(CONFIG.layout.dogCollar.x, CONFIG.layout.dogCollar.y)
      .setDepth(11);
    const s = Math.min(CONFIG.layout.dogWidth, this.layout.spacing * 0.95) / dog.width;
    dog.setScale(s).setData('s', s);
    // idle: a little bob, out of phase per dog
    this.tweens.add({ targets: dog, y: dog.y + 2.5, duration: 520 + Math.random() * 260, delay: Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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

  private get showRings(): boolean {
    return this.assist || this.coaching || CONFIG.rules.previewMode !== 'off';
  }

  private refreshPreview(): void {
    const m = this.model;
    if (!this.showRings) {
      for (const v of this.knotViews.values()) v.setPreview('none');
      return;
    }
    const bottoms = new Set<number>();
    const perms = m.perms();
    for (let g = 0; g < m.gapCount; g++) {
      const k = m.bottomKnot(g);
      if (!k) continue;
      bottoms.add(k.id);
      this.knotViews.get(k.id)?.setPreview(m.readyAt(g, perms) ? 'good' : 'bad'); // with the type the frame ARRIVES with
    }
    for (const [id, v] of this.knotViews) if (!bottoms.has(id)) v.setPreview('none');
  }

  /** One dot per lane in the colour the frame would arrive with (it flips at every gap it crosses); the current lane is ringed. */
  private refreshLanes(): void {
    const m = this.model;
    const n = m.ropes.length;
    const g = this.laneDots;
    g.clear();
    if (!CONFIG.rules.flipPerStep) return;
    for (let i = 0; i < m.gapCount; i++) {
      const color = m.arrivalType(i) === 'blue' ? CONFIG.colors.frameBlue : CONFIG.colors.frameRed;
      const x = this.layout.gapX(i, n);
      const y = this.layout.boardTop + 5; // just under the push bar, above the first knot row
      const cur = i === m.frameGap;
      g.fillStyle(color, cur ? 1 : 0.8);
      g.fillCircle(x, y, cur ? 6 : 4);
      if (cur) {
        g.lineStyle(2, 0xffffff, 0.85);
        g.strokeCircle(x, y, 6);
      }
    }
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
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.worldX, p.worldY));
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-LEFT', () => this.run(() => this.model.moveFrame(this.model.frameGap - 1)));
    kb.on('keydown-RIGHT', () => this.run(() => this.model.moveFrame(this.model.frameGap + 1)));
    kb.on('keydown-SPACE', () => (this.overlay ? this.dismissOverlay() : this.run(() => this.model.act())));
    kb.on('keydown-ENTER', () => this.overlay && this.dismissOverlay());
    kb.on('keydown-F', () => this.run(() => this.model.flipWithBonus()));
    kb.on('keydown-C', () => this.run(() => this.model.candleConnect()));
    kb.on('keydown-P', () => this.togglePause());
    kb.on('keydown-ESC', () => this.togglePause());
  }

  private onTap(x: number, y: number): void {
    unlockAudio();
    if (this.overlay) {
      const kind = this.overlay.getData('kind') as OverlayKind;
      if (kind === 'paused') {
        const quit = this.overlay.getData('quit') as Phaser.Geom.Rectangle | undefined;
        if (quit?.contains(x, y)) {
          playClick();
          this.scene.start('menu');
          return;
        }
      }
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
      if (this.hud.hitPause(x, y)) {
        this.togglePause();
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
    if (this.twoTap && m.frameGap !== gap && this.walkTarget < 0) {
      this.walkTo(gap, false);
      return;
    }
    this.walkTo(gap, true);
  }

  // ---------- the walk: the frame crosses one gap per anim.frameStepMs, flipping at each, then acts ----------

  private walkTo(gap: number, act: boolean): void {
    const m = this.model;
    this.walkTarget = Math.max(0, Math.min(m.gapCount - 1, gap));
    this.walkAct = act;
    if (this.walker) return; // already walking: retargeted
    this.walkStep();
  }

  private walkStep(): void {
    const m = this.model;
    if (m.status !== 'playing' || this.overlay || m.gapCount === 0) {
      this.stopWalk();
      return;
    }
    const target = Math.min(this.walkTarget, m.gapCount - 1);
    if (m.frameGap === target) {
      const act = this.walkAct;
      this.stopWalk();
      if (act) this.run(() => this.model.act());
      return;
    }
    const dir = target > m.frameGap ? 1 : -1;
    this.run(() => this.model.moveFrame(this.model.frameGap + dir));
    this.walker = this.time.delayedCall(CONFIG.anim.frameStepMs, () => {
      this.walker = null;
      this.walkStep();
    });
  }

  private stopWalk(): void {
    this.walker?.remove(false);
    this.walker = null;
    this.walkTarget = -1;
    this.walkAct = false;
  }

  private run(cmd: () => void): void {
    if (this.model.status !== 'playing' || this.overlay) return;
    this.ropesBefore = this.model.ropes.slice();
    cmd();
    this.handle(this.model.drain());
  }

  // ---------- pause ----------

  private togglePause(): void {
    if (this.overlay) {
      if ((this.overlay.getData('kind') as OverlayKind) === 'paused') this.dismissOverlay();
      return;
    }
    this.pause();
  }

  private pause(): void {
    if (this.auto || this.overlay || this.model.status !== 'playing') return;
    playClick();
    this.showOverlay('paused', 0);
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
    if (this.model.status === 'playing') this.hud.setReady(this.model.readyCount(), this.model.bonuses);
    if (this.model.score > this.best) {
      this.best = this.model.score;
      this.hud.setBest(this.best);
    }
    this.refreshPreview();
    this.refreshLanes();
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
        buzz(CONFIG.haptics.untwist);
        this.maxChain = Math.max(this.maxChain, e.chain);
        const callout = CONFIG.anim.chainCallouts[e.chain];
        if (callout) this.callout(callout, '#ffd166', 30);
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
        buzz(CONFIG.haptics.twist);
        this.pushTimer = Math.min(m.pushIntervalMs - 60, this.pushTimer + m.pushIntervalMs * CONFIG.rules.twistPushPenalty);
        this.tweens.add({ targets: this.pushStamp, alpha: { from: 1, to: 0 }, duration: 250 });
        if (this.coaching && !this.coachedTwist) {
          this.coachedTwist = true;
          this.coachLine('The frame flips at every gap it crosses. Two away = same colour.');
        }
        break;
      }
      case 'noKnot':
        if (CONFIG.rules.actOnEmptyGapFlips) this.floatText(this.frame.x, this.frame.y - 24, 'FLIP', '#ffffff');
        else this.shake(this.frame);
        break;
      case 'ropeRemoved': {
        const dog = this.dogViews.get(e.rope.id);
        if (dog) {
          this.dogViews.delete(e.rope.id);
          this.runOff(dog);
        }
        for (const k of e.knots) {
          const kv = this.knotViews.get(k.id);
          if (kv) this.tweens.add({ targets: kv, scale: 0, alpha: 0, duration: 200, onComplete: () => kv.destroy() });
          this.knotViews.delete(k.id);
        }
        this.time.delayedCall(CONFIG.anim.untwistMs, () => this.ropeFlash(e.rope));
        playRopeClear();
        buzz(CONFIG.haptics.home);
        if (e.cause === 'untwist' && CONFIG.rules.ropeClearResetsPush) this.pushTimer = 0;
        this.hud.setHome(e.dogsFreed, e.walkTarget);
        this.callout(
          e.cause === 'candle' ? `BURNED +${CONFIG.scoring.candleRope}` : `${m.breedOf(e.rope).name.toUpperCase()} HOME! +${CONFIG.scoring.ropeRemoved}`,
          '#ffd166',
          22,
        );
        break;
      }
      case 'walkBonus':
        this.callout(`+${Math.round(e.ms / 1000)} s`, '#9dffb0', 20);
        break;
      case 'walkOver':
        if (m.score > getHighScore()) setHighScore(m.score);
        this.noteWalkEnd(false);
        playGameOver();
        buzz(CONFIG.haptics.over);
        this.time.delayedCall(500, () => this.showOverlay('walkOver', 0));
        break;
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
        if (m.score > getHighScore()) setHighScore(m.score);
        this.noteWalkEnd(true);
        playWalkClear();
        buzz(CONFIG.haptics.walkDone);
        this.cameras.main.flash(160, 140, 255, 170);
        this.time.delayedCall(250, () => this.callout(this.mode === 'daily' ? 'DAILY DONE!' : 'ALL HOME!', '#9dffb0', 38));
        this.time.delayedCall(1100, () => this.showOverlay('stageClear', e.bonusPoints));
        break;
      case 'gameOver':
        if (m.score > getHighScore()) setHighScore(m.score);
        this.noteWalkEnd(false);
        playGameOver();
        buzz(CONFIG.haptics.over);
        this.cameras.main.shake(350, 0.012);
        this.time.delayedCall(700, () => this.showOverlay('gameOver', 0));
        break;
      default:
        break;
    }
  }

  /** Local stats + daily record at the end of a walk (nothing leaves the phone). */
  private noteWalkEnd(cleared: boolean): void {
    if (this.auto) return;
    const m = this.model;
    updateStats((s) => {
      if (cleared) s.walksCleared += 1;
      s.dogsHome += m.dogsFreed;
      s.bestChain = Math.max(s.bestChain, this.maxChain);
      if (this.mode === 'run' && (m.level > s.bestLevel || (m.level === s.bestLevel && m.stage > s.bestStage))) {
        s.bestLevel = m.level;
        s.bestStage = m.stage;
      }
      s.coached = true;
    });
    if (this.mode === 'daily') {
      const d = getDaily();
      if (d.date !== dateKey()) return;
      if (cleared) {
        if (!d.cleared) d.streak += 1;
        d.cleared = true;
        d.best = Math.max(d.best, m.score);
      }
      setDaily(d);
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
      const s = (dog?.getData('s') as number) ?? 1;
      if (dog) {
        this.tweens.add({ targets: dog, scale: { from: s * 1.25, to: s }, duration: 220, ease: 'Back.easeOut' });
        this.tweens.add({ targets: dog, y: dog.y - 7, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
      }
    }
    this.floatText(v.x, v.y - 16, chain > 1 ? `+${points}  x${chain}` : `+${points}`, '#9dffb0', 14 + Math.min(chain, 8) * 2);
  }

  private animateTwist(v: KnotView): void {
    const flash = this.add.circle(v.x, v.y, this.layout.spacing * 0.6, 0xff3b3b, 0.55).setDepth(16).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    this.tweens.add({ targets: v, scale: 1.35, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** A freed dog: a happy hop, confetti, then it runs off the nearer edge with a little squash and dust. */
  private runOff(dog: Phaser.GameObjects.Image): void {
    this.tweens.killTweensOf(dog);
    const dir = dog.x < this.layout.centerX ? -1 : 1;
    const s = (dog.getData('s') as number) ?? 1;
    dog.setFlipX(dir < 0); // the sprite faces right
    dog.setDepth(12);
    this.tweens.add({ targets: dog, y: dog.y - 16, duration: 150, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: dog, scale: s * 1.25, duration: 150, yoyo: true });
    this.confetti(dog.x, dog.y - 10);
    const ms = CONFIG.anim.runOffMs;
    this.tweens.add({
      targets: dog,
      x: dog.x + dir * (this.layout.width * 0.8),
      delay: CONFIG.anim.untwistMs,
      duration: ms,
      ease: 'Quad.easeIn',
      onComplete: () => dog.destroy(),
    });
    this.tweens.add({ targets: dog, scaleY: s * 0.88, scaleX: s * 1.08, delay: CONFIG.anim.untwistMs, duration: 70, yoyo: true, repeat: Math.floor(ms / 140) });
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(CONFIG.anim.untwistMs + i * 110, () => {
        const puff = this.add.circle(dog.x - dir * 14, this.layout.boardBottom + 30, 4 + i, 0xd7dbe8, 0.35).setDepth(11);
        this.tweens.add({ targets: puff, scale: 2.2, alpha: 0, x: puff.x - dir * 18, y: puff.y - 8, duration: 380, onComplete: () => puff.destroy() });
      });
    }
  }

  private confetti(x: number, y: number): void {
    const colors = CONFIG.colors.confetti;
    for (let i = 0; i < CONFIG.anim.confettiCount; i++) {
      const c = colors[i % colors.length];
      const p = this.add.rectangle(x, y, 7, 4, c, 1).setDepth(19).setAngle(Phaser.Math.Between(0, 180));
      const tx = x + Phaser.Math.Between(-90, 90);
      const up = Phaser.Math.Between(60, 170);
      this.tweens.add({
        targets: p,
        x: tx,
        y: y - up,
        angle: p.angle + Phaser.Math.Between(-240, 240),
        duration: 280,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({ targets: p, y: y + 30, alpha: 0, angle: p.angle + 180, duration: 460 + Phaser.Math.Between(0, 200), ease: 'Quad.easeIn', onComplete: () => p.destroy() });
        },
      });
    }
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

  /** Centre callout: picks a free lane over the board so simultaneous texts never pile on each other. */
  private callout(text: string, color: string, size: number): void {
    const now = this.time.now;
    let lane = this.laneBusyUntil.findIndex((t) => t <= now);
    if (lane < 0) lane = this.laneBusyUntil.indexOf(Math.min(...this.laneBusyUntil));
    this.laneBusyUntil[lane] = now + CONFIG.anim.floatLaneMs;
    const y = this.layout.boardTop + this.layout.boardHeight * (0.22 + lane * 0.08);
    const t = this.add
      .text(this.layout.centerX, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(61)
      .setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, delay: 380, duration: 420, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
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

  private showOverlay(kind: OverlayKind, bonusPoints: number): void {
    const L = this.layout;
    const m = this.model;
    const c = this.add.container(0, 0).setDepth(100);
    const bg = this.add.rectangle(L.width / 2, L.height / 2, L.width, L.height, 0x000000, 0.72);
    const card = this.add.rectangle(L.width / 2, L.height / 2 + 6, L.width - 40, kind === 'paused' ? 300 : 250, CONFIG.colors.panel, 0.92);
    card.setStrokeStyle(1.5, CONFIG.colors.boardEdge, 1);
    const home = `${Math.min(m.dogsFreed, m.walkTarget)}/${m.walkTarget} home`; // a cascade can free one past the target
    const daily = this.mode === 'daily';
    let title: string;
    let line2: string;
    let action: string;
    switch (kind) {
      case 'stageClear':
        title = daily ? 'DAILY WALK DONE' : `WALK ${m.level}-${m.stage} DONE`;
        line2 = `${home}   +${bonusPoints} bonus\nbest chain x${Math.max(1, this.maxChain)}   score ${m.score}`;
        if (daily) {
          const d = getDaily();
          line2 += `\nstreak ${d.streak} day${d.streak === 1 ? '' : 's'}   today's best ${d.best}`;
        }
        action = daily ? 'TAP FOR THE MENU' : 'TAP FOR THE NEXT WALK';
        break;
      case 'walkOver':
      case 'gameOver':
        title = kind === 'walkOver' ? "TIME'S UP" : 'TANGLED!';
        line2 = `${home}   score ${m.score}\nbest ${Math.max(this.best, m.score)}   best chain x${Math.max(1, this.maxChain)}`;
        action = CONFIG.rules.walkMode && CONFIG.rules.retrySameWalk ? 'TAP TO WALK AGAIN' : 'TAP TO PLAY AGAIN';
        break;
      default:
        title = 'PAUSED';
        line2 = `walk ${m.level}-${m.stage}   ${home}   score ${m.score}`;
        action = 'TAP TO RESUME';
        break;
    }
    const t1 = this.add
      .text(L.width / 2, L.height / 2 - 90, title, { fontFamily: FONT, fontSize: '30px', color: CONFIG.colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    const t2 = this.add
      .text(L.width / 2, L.height / 2 - 30, line2, { fontFamily: FONT, fontSize: '16px', color: CONFIG.colors.textDim, align: 'center', lineSpacing: 6 })
      .setOrigin(0.5);
    const t3 = this.add
      .text(L.width / 2, L.height / 2 + 50, action, { fontFamily: FONT, fontSize: '20px', color: CONFIG.colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tweens.add({ targets: t3, alpha: { from: 1, to: 0.3 }, duration: 600, yoyo: true, repeat: -1 });
    c.add([bg, card, t1, t2, t3]);
    if (kind === 'paused') {
      const r = new Phaser.Geom.Rectangle(L.width / 2 - 80, L.height / 2 + 86, 160, 40);
      const qb = this.add.rectangle(r.centerX, r.centerY, r.width, r.height, 0x23263a, 1).setStrokeStyle(2, 0x343850, 1);
      const qt = this.add.text(r.centerX, r.centerY, 'QUIT TO MENU', { fontFamily: FONT, fontSize: '14px', color: CONFIG.colors.textDim, fontStyle: 'bold' }).setOrigin(0.5);
      c.add([qb, qt]);
      c.setData('quit', r);
    }
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    c.setData('kind', kind);
    this.overlay = c;
  }

  private dismissOverlay(): void {
    if (!this.overlay) return;
    const kind = this.overlay.getData('kind') as OverlayKind;
    this.overlay.destroy();
    this.overlay = null;
    this.stopWalk();
    if (kind === 'paused') return;
    if (kind === 'stageClear') {
      if (this.mode === 'daily') {
        this.scene.start('menu');
        return;
      }
      this.model.nextStage();
    } else if (CONFIG.rules.walkMode && CONFIG.rules.retrySameWalk) {
      if (this.mode === 'daily') {
        // the same board again: rebuild from the day's seed
        this.model = new Game(CONFIG, this.seed);
        this.model.startStage(CONFIG.daily.level, CONFIG.daily.stage);
      } else {
        this.model.retryWalk();
      }
    } else {
      this.scene.restart({ twoTap: this.twoTap, mode: this.mode, assist: this.assist });
      return;
    }
    this.model.drain();
    this.walkStartMs = this.model.walkMsLeft;
    this.coaching = false;
    this.maxChain = 0;
    this.pushTimer = 0;
    this.noteWalkStart();
    this.layout.setRopeCount(this.model.ropes.length);
    this.braid.setTarget(this.snapshot());
    this.braid.t = 1;
    this.buildStageViews();
    this.placeCandleMarkers();
    this.getReady();
  }

  // ---------- demo bot (?auto=1): plays a decent game for clips and smoke tests ----------

  private autoStep(): void {
    const m = this.model;
    if (this.overlay) {
      if (this.demoStyle === 'fail' || this.holdOverlay) return; // leave TIME'S UP / WALK DONE on screen for the clip
      this.dismissOverlay();
      return;
    }
    if (m.status !== 'playing') return;
    const style: BotStyle =
      this.demoStyle === 'fail'
        ? this.walkStartMs - m.walkMsLeft > CONFIG.demo.failPlayMs || m.dogsFreed >= m.walkTarget - CONFIG.demo.failStopShort
          ? 'idle'
          : 'play'
        : this.demoStyle;
    const move = chooseMove(m, style);
    if (move.kind === 'wait') return;
    this.run(() => applyMove(this.model, move));
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
      this.hud.setWalk(m.walkMsLeft);
      const frac = Math.min(1, this.pushTimer / interval);
      this.pushBar.clear();
      this.pushBar.fillStyle(0x2a2e3f, 1);
      this.pushBar.fillRoundedRect(12, L.boardTop - 8, L.width - 24, 6, 3);
      this.pushBar.fillStyle(frac > 0.8 ? 0xffb42e : CONFIG.colors.bar, 1);
      this.pushBar.fillRoundedRect(12, L.boardTop - 8, Math.max(6, (L.width - 24) * frac), 6, 3);
      this.hud.setCandle(m.candle ? m.candle.msLeft / m.candle.msTotal : null);
    }
    if (this.auto) {
      this.autoTimer += delta;
      if (this.autoTimer >= CONFIG.demo.stepMs) {
        this.autoTimer = 0;
        this.autoStep();
      }
      this.fpsTimer += delta;
      if (this.fpsTimer >= 1000) {
        this.fpsTimer = 0;
        console.info(`[demo] fps=${this.game.loop.actualFps.toFixed(1)} walk=${(m.walkMsLeft / 1000).toFixed(1)}s score=${m.score} chain=${m.chain} home=${m.dogsFreed}/${m.walkTarget}`);
      }
    }
    if (this.braid.animating || this.braid.dirty) this.braid.draw();
    for (const [id, dog] of this.dogViews) {
      const x = this.braid.bottomX(id);
      if (x !== undefined) dog.setX(x);
    }
    const dangerStart = CONFIG.board.rows - CONFIG.board.dangerRows;
    let worst = 0;
    for (const v of this.knotViews.values()) {
      const k = v.knot;
      if (k.row < dangerStart) {
        v.glow.setAlpha(0);
        continue;
      }
      const depth = (k.row - dangerStart + 1) / CONFIG.board.dangerRows;
      worst = Math.max(worst, depth);
      const speed = 0.004 + depth * 0.008;
      v.glow.setAlpha(Math.max(0, 0.25 + depth * 0.35 + Math.sin(time * speed) * 0.2));
      v.glow.setScale(1 + Math.sin(time * speed) * 0.15 * depth);
    }
    this.vignette.setAlpha(worst > 0 && m.status === 'playing' ? worst * 0.5 + Math.sin(time * 0.006) * 0.12 * worst : 0);
    if (m.candle) {
      const aligned = m.candleAligned();
      this.candleBeam.setVisible(aligned);
      if (aligned) this.candleBeam.setAlpha(0.25 + Math.sin(time * 0.01) * 0.15);
    }
  }
}
