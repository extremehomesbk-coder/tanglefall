import Phaser from 'phaser';
import { playClick, setMuted, unlockAudio } from '../audio';
import { CONFIG } from '../config';
import { dateKey, streakNow } from '../daily';
import { setHapticsEnabled } from '../haptics';
import { canPromptInstall, isIosBrowser, isStandalone, promptInstall } from '../install';
import { getAssist, getDaily, getHaptics, getHighScore, getMute, getStats, getTwoTap, setAssist, setHaptics, setMute, setTwoTap } from '../storage';
import { addBackdrop, groundY } from '../view/Backdrop';
import { drawSlantFrame } from '../view/FrameView';
import { HD } from '../hd';
import type { GameSceneData } from './GameScene';

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

interface Button {
  rect: Phaser.Geom.Rectangle;
  label: Phaser.GameObjects.Text;
  sub?: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Graphics;
  onTap: () => void;
  primary: boolean;
}

/** Title screen: dusk park, the six dogs on their leashes, PLAY / DAILY / HOW TO PLAY, settings chips, stats. */
export class MenuScene extends Phaser.Scene {
  private buttons: Button[] = [];
  private chips: Button[] = [];
  private help: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('menu');
  }

  preload(): void {
    for (const b of CONFIG.breeds) {
      const key = `dog-${b.sprite}`;
      if (!this.textures.exists(key)) this.load.svg(key, `dogs/${b.sprite}.svg`, { scale: 2 * HD });
    }
  }

  create(): void {
    const { width, height } = CONFIG.layout;
    this.buttons = [];
    this.chips = [];
    this.help = null;
    this.cameras.main.setZoom(HD).centerOn(width / 2, height / 2);
    setMuted(getMute());
    setHapticsEnabled(getHaptics());
    // ?auto=1 (demo / clip recording) skips the menu
    if (new URLSearchParams(window.location.search).has('auto')) {
      setMuted(true);
      setHapticsEnabled(false);
      this.scene.start('game', { twoTap: false } satisfies GameSceneData);
      return;
    }

    addBackdrop(this);
    this.drawLeashes();
    this.drawDogs();

    const titleY = 118;
    this.add
      .text(width / 2, titleY, CONFIG.title.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '46px',
        color: CONFIG.colors.text,
        fontStyle: 'bold',
        letterSpacing: 5,
        stroke: '#000',
        strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 10, fill: true },
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.add
      .text(width / 2, titleY + 36, 'get the dogs home before the walk ends', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#c9cde0',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(5);

    // decorative frames beside the title
    const fb = this.add.graphics().setPosition(width / 2 - 26, titleY + 68).setDepth(5);
    drawSlantFrame(fb, 'blue', 30, 18, 3, 0.25);
    const fr = this.add.graphics().setPosition(width / 2 + 26, titleY + 68).setDepth(5);
    drawSlantFrame(fr, 'red', 30, 18, 3, 0.25);
    this.tweens.add({ targets: [fb, fr], y: '+=5', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // buttons
    const stats = getStats();
    const bw = width - 72;
    const bx = 36;
    let y = 212;
    const isFirst = stats.walksPlayed === 0;
    this.button(bx, y, bw, 58, isFirst ? 'PLAY' : 'PLAY', isFirst ? 'first walk: the rings show you the way' : `best ${getHighScore()}  ·  reached walk ${Math.max(1, stats.bestLevel)}-${Math.max(1, stats.bestStage)}`, true, () =>
      this.start('run'),
    );
    y += 70;
    const d = getDaily();
    const today = dateKey();
    const streak = d.date === today ? d.streak : streakNow(d.date, d.streak, d.cleared, today);
    const clearedToday = d.date === today && d.cleared;
    const dailySub = clearedToday
      ? `done today · best ${d.best}${streak > 0 ? ` · streak ${streak}` : ''}`
      : streak > 0
        ? `streak ${streak} day${streak === 1 ? '' : 's'} · keep it alive today`
        : 'one walk a day, same for everyone';
    this.button(bx, y, bw, 52, 'DAILY WALK', dailySub, false, () => this.start('daily'));
    y += 64;
    this.button(bx, y, bw, 44, 'HOW TO PLAY', undefined, false, () => this.showHelp());
    y += 56;

    // settings chips
    const cw = (bw - 8) / 2;
    const row = (i: number): number => y + Math.floor(i / 2) * 44;
    const col = (i: number): number => bx + (i % 2) * (cw + 8);
    this.chip(col(0), row(0), cw, 36, () => `Sound: ${getMute() ? 'OFF' : 'ON'}`, () => {
      const mute = !getMute();
      setMute(mute);
      setMuted(mute);
    });
    this.chip(col(1), row(1), cw, 36, () => `Buzz: ${getHaptics() ? 'ON' : 'OFF'}`, () => {
      const on = !getHaptics();
      setHaptics(on);
      setHapticsEnabled(on);
    });
    this.chip(col(2), row(2), cw, 36, () => `Assist rings: ${getAssist(CONFIG.coach.assistDefault) ? 'ON' : 'OFF'}`, () => setAssist(!getAssist(CONFIG.coach.assistDefault)));
    this.chip(col(3), row(3), cw, 36, () => `Two-tap: ${getTwoTap(CONFIG.rules.twoTapMode) ? 'ON' : 'OFF'}`, () => setTwoTap(!getTwoTap(CONFIG.rules.twoTapMode)));
    y = row(3) + 48;

    // stats line
    this.drawPanel(y + (stats.walksPlayed > 0 ? 26 : 8));
    if (stats.walksPlayed > 0) {
      this.add
        .text(width / 2, y + 6, `${stats.walksPlayed} walks · ${stats.walksCleared} cleared · ${stats.dogsHome} dogs home · best chain x${Math.max(1, stats.bestChain)}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: CONFIG.colors.textDim,
          stroke: '#000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(5);
    }

    // install hint / prompt (sits on the grass, above the dogs' feet)
    if (!isStandalone()) {
      if (canPromptInstall()) {
        this.chip(width / 2 - 90, groundY() + 14, 180, 30, () => 'ADD TO HOME SCREEN', () => void promptInstall().then(() => this.scene.restart()));
      } else if (isIosBrowser()) {
        this.add
          .text(width / 2, groundY() + 28, 'iPhone: Share → Add to Home Screen for full screen', { fontFamily: FONT, fontSize: '11px', color: '#c9cde0', stroke: '#000', strokeThickness: 2 })
          .setOrigin(0.5)
          .setDepth(5);
      }
    }

    this.add
      .text(width / 2, height - 14, `v${CONFIG.version} · desktop: ← → move · space act · F flip · C candle · P pause`, {
        fontFamily: FONT,
        fontSize: '10px',
        color: CONFIG.colors.textDim,
        stroke: '#000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.worldX, p.worldY));
    this.input.keyboard?.on('keydown-SPACE', () => (this.help ? this.hideHelp() : this.start('run')));
    this.input.keyboard?.on('keydown-ENTER', () => (this.help ? this.hideHelp() : this.start('run')));
  }

  /** Six leashes rising from the dogs into a loose braid behind the title. */
  private drawLeashes(): void {
    const { width } = CONFIG.layout;
    const g = this.add.graphics().setDepth(1);
    const n = CONFIG.breeds.length;
    const spacing = Math.min(CONFIG.layout.maxSpacing, (width - 60) / (n - 1));
    const top = 150;
    const bottom = groundY() - 28;
    const pal = CONFIG.colors.palette;
    for (let i = 0; i < n; i++) {
      const x0 = width / 2 + (i - (n - 1) / 2) * spacing;
      const color = pal[i % pal.length];
      const pts: Phaser.Math.Vector2[] = [];
      const segs = 14;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const y = bottom + (top - bottom) * t;
        const sway = Math.sin(t * Math.PI * 2 + i * 1.1) * spacing * 0.45 * (1 - t) * (t > 0.08 ? 1 : t / 0.08);
        pts.push(new Phaser.Math.Vector2(x0 + sway, y));
      }
      g.lineStyle(13, 0x000000, 0.25);
      for (let s = 0; s < segs; s++) g.lineBetween(pts[s].x + 3, pts[s].y + 4, pts[s + 1].x + 3, pts[s + 1].y + 4);
      g.lineStyle(10, color, 0.9);
      for (let s = 0; s < segs; s++) g.lineBetween(pts[s].x, pts[s].y, pts[s + 1].x, pts[s + 1].y);
      g.lineStyle(2.5, 0xffffff, 0.35);
      for (let s = 0; s < segs; s++) g.lineBetween(pts[s].x - 2.5, pts[s].y, pts[s + 1].x - 2.5, pts[s + 1].y);
    }
  }

  /** Soft dark band so the title and buttons stay readable over the leashes. */
  private drawPanel(bottom: number): void {
    const { width } = CONFIG.layout;
    const panel = this.add.graphics().setDepth(2);
    panel.fillStyle(CONFIG.colors.panel, 0.62);
    panel.fillRoundedRect(20, 70, width - 40, bottom - 70, 22);
    panel.lineStyle(1.5, CONFIG.colors.boardEdge, 0.6);
    panel.strokeRoundedRect(20, 70, width - 40, bottom - 70, 22);
  }

  private drawDogs(): void {
    const { width } = CONFIG.layout;
    const n = CONFIG.breeds.length;
    const spacing = Math.min(CONFIG.layout.maxSpacing, (width - 60) / (n - 1));
    CONFIG.breeds.forEach((b, i) => {
      const x = width / 2 + (i - (n - 1) / 2) * spacing;
      const dog = this.add.image(x, groundY() - 30, `dog-${b.sprite}`).setOrigin(CONFIG.layout.dogCollar.x, CONFIG.layout.dogCollar.y).setDepth(3);
      const s = Math.min(CONFIG.layout.dogWidth, spacing * 0.95) / dog.width;
      dog.setScale(s);
      this.tweens.add({ targets: dog, y: dog.y + 2.5, duration: 520 + i * 60, delay: i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  }

  private button(x: number, y: number, w: number, h: number, text: string, sub: string | undefined, primary: boolean, onTap: () => void): void {
    const rect = new Phaser.Geom.Rectangle(x, y, w, h);
    const bg = this.add.graphics().setDepth(6);
    this.paintButton(bg, rect, primary, false);
    const label = this.add
      .text(rect.centerX, sub ? rect.centerY - 9 : rect.centerY, text, {
        fontFamily: FONT,
        fontSize: primary ? '24px' : '18px',
        color: CONFIG.colors.text,
        fontStyle: 'bold',
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(7);
    let subText: Phaser.GameObjects.Text | undefined;
    if (sub) {
      subText = this.add
        .text(rect.centerX, rect.centerY + 13, sub, { fontFamily: FONT, fontSize: '11px', color: primary ? '#dfe4ff' : CONFIG.colors.textDim })
        .setOrigin(0.5)
        .setDepth(7);
    }
    if (primary) this.tweens.add({ targets: label, scale: { from: 1, to: 1.04 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.buttons.push({ rect, label, sub: subText, bg, onTap, primary });
  }

  private paintButton(g: Phaser.GameObjects.Graphics, r: Phaser.Geom.Rectangle, primary: boolean, pressed: boolean): void {
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(r.x + 2, r.y + 4, r.width, r.height, 16);
    g.fillStyle(primary ? (pressed ? 0x2f7fd6 : 0x3aa0ff) : pressed ? 0x1b1f2e : 0x23263a, 1);
    g.fillRoundedRect(r.x, r.y, r.width, r.height, 16);
    g.lineStyle(2, primary ? 0x8ed0ff : 0x3a3f58, 1);
    g.strokeRoundedRect(r.x, r.y, r.width, r.height, 16);
    if (primary) {
      g.fillStyle(0xffffff, 0.12);
      g.fillRoundedRect(r.x + 3, r.y + 3, r.width - 6, r.height * 0.45, { tl: 14, tr: 14, bl: 4, br: 4 });
    }
  }

  private chip(x: number, y: number, w: number, h: number, text: () => string, onTap: () => void): void {
    const rect = new Phaser.Geom.Rectangle(x, y, w, h);
    const bg = this.add.graphics().setDepth(6);
    bg.fillStyle(0x1b1f2e, 0.95);
    bg.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 12);
    bg.lineStyle(1.5, 0x343850, 1);
    bg.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 12);
    const label = this.add.text(rect.centerX, rect.centerY, text(), { fontFamily: FONT, fontSize: '13px', color: CONFIG.colors.text }).setOrigin(0.5).setDepth(7);
    this.chips.push({
      rect,
      label,
      bg,
      primary: false,
      onTap: () => {
        onTap();
        label.setText(text());
        this.tweens.add({ targets: label, scale: { from: 1.15, to: 1 }, duration: 150 });
      },
    });
  }

  private onTap(x: number, y: number): void {
    unlockAudio();
    if (this.help) {
      this.hideHelp();
      return;
    }
    for (const b of [...this.buttons, ...this.chips]) {
      if (!b.rect.contains(x, y)) continue;
      playClick();
      this.paintButton(b.bg, b.rect, b.primary, true);
      if (this.chips.includes(b)) {
        b.bg.clear();
        b.bg.fillStyle(0x1b1f2e, 0.95);
        b.bg.fillRoundedRect(b.rect.x, b.rect.y, b.rect.width, b.rect.height, 12);
        b.bg.lineStyle(1.5, 0x343850, 1);
        b.bg.strokeRoundedRect(b.rect.x, b.rect.y, b.rect.width, b.rect.height, 12);
      }
      this.time.delayedCall(70, () => b.onTap());
      return;
    }
  }

  /** HOW TO PLAY: the rules in five lines plus a drawn knot showing the bright (top) strand. */
  private showHelp(): void {
    const { width, height } = CONFIG.layout;
    const c = this.add.container(0, 0).setDepth(100);
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78);
    const card = this.add.rectangle(width / 2, height / 2, width - 36, 560, CONFIG.colors.panel, 0.96).setStrokeStyle(1.5, CONFIG.colors.boardEdge, 1);
    const title = this.add.text(width / 2, height / 2 - 250, 'HOW TO PLAY', { fontFamily: FONT, fontSize: '24px', color: CONFIG.colors.text, fontStyle: 'bold', letterSpacing: 2 }).setOrigin(0.5);
    const lines = [
      'Six dogs, six leashes, one tangle. Get the target number of dogs home before the clock runs out.',
      'Tap between two leashes: the frame walks there and works the lowest knot. It flips colour at every gap it crosses and once more when it acts, so two lanes away = same colour, next door = the other. The dots under the lanes show what you would arrive with.',
      'BLUE undoes a knot whose RIGHT leash is on top; RED undoes one whose LEFT leash is on top (bright edge = on top). Wrong colour = a tighter knot and the bar jumps. An empty lane just flips the frame.',
      'Fast untwists chain for x2 to x8. A leash with no knots left sends its dog home and resets the bar.',
      'A knot pushed to the floor, or the clock at zero, ends the walk.',
      'Sparkle knots bank a free FLIP. A candle burns a leash once its red dots line up. A brush recolours.',
    ];
    const body = this.add
      .text(width / 2, height / 2 - 232, lines.map((l) => `•  ${l}`).join('\n\n'), {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#d7dbe8',
        lineSpacing: 2,
        wordWrap: { width: width - 76 },
      })
      .setOrigin(0.5, 0);
    // drawn example: a knot with the right leash on top (= BLUE untwists it)
    const ex = this.add.graphics();
    const ey = height / 2 + 184;
    const ex0 = width / 2 - 60;
    const draw = (x0: number, topRight: boolean, type: 'blue' | 'red'): void => {
      const a = CONFIG.colors.palette[0];
      const b = CONFIG.colors.palette[3];
      const under = topRight ? a : b;
      const over = topRight ? b : a;
      const ux = topRight ? [x0 - 18, x0 + 18] : [x0 + 18, x0 - 18];
      const ox = topRight ? [x0 + 18, x0 - 18] : [x0 - 18, x0 + 18];
      ex.lineStyle(8, under, 1);
      ex.lineBetween(ux[0], ey - 26, ux[1], ey + 26);
      ex.lineStyle(14, 0xffffff, 0.9);
      ex.lineBetween(ox[0], ey - 26, ox[1], ey + 26);
      ex.lineStyle(11, CONFIG.colors.panel, 1);
      ex.lineBetween(ox[0], ey - 26, ox[1], ey + 26);
      ex.lineStyle(8, over, 1);
      ex.lineBetween(ox[0], ey - 26, ox[1], ey + 26);
      const f = this.add.graphics().setPosition(x0, ey);
      drawSlantFrame(f, type, 52, 40, 3, 0.1);
      c.add(f);
    };
    draw(ex0, true, 'blue');
    draw(ex0 + 120, false, 'red');
    const cap1 = this.add.text(ex0, ey + 34, 'right on top\n→ BLUE', { fontFamily: FONT, fontSize: '11px', color: '#8ed0ff', align: 'center' }).setOrigin(0.5, 0);
    const cap2 = this.add.text(ex0 + 120, ey + 34, 'left on top\n→ RED', { fontFamily: FONT, fontSize: '11px', color: '#ff9a9a', align: 'center' }).setOrigin(0.5, 0);
    const close = this.add.text(width / 2, height / 2 + 256, 'TAP TO CLOSE', { fontFamily: FONT, fontSize: '15px', color: CONFIG.colors.textDim, fontStyle: 'bold' }).setOrigin(0.5);
    c.add([bg, card, title, body, ex, cap1, cap2, close]);
    this.help = c;
  }

  private hideHelp(): void {
    this.help?.destroy();
    this.help = null;
  }

  private start(mode: 'run' | 'daily'): void {
    const data: GameSceneData = { twoTap: getTwoTap(CONFIG.rules.twoTapMode), mode, assist: getAssist(CONFIG.coach.assistDefault) };
    this.cameras.main.fadeOut(160, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('game', data));
  }
}
