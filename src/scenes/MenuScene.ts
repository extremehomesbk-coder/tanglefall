import Phaser from 'phaser';
import { CONFIG } from '../config';
import { getHighScore, getTwoTap, setTwoTap } from '../storage';
import { drawSlantFrame } from '../view/FrameView';

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export class MenuScene extends Phaser.Scene {
  private twoTap = false;
  private toggleText!: Phaser.GameObjects.Text;
  private toggleRect!: Phaser.Geom.Rectangle;

  constructor() {
    super('menu');
  }

  create(): void {
    const { width, height } = CONFIG.layout;
    this.twoTap = getTwoTap(CONFIG.rules.twoTapMode);

    this.add
      .text(width / 2, height * 0.2, CONFIG.title.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '44px',
        color: CONFIG.colors.text,
        fontStyle: 'bold',
        letterSpacing: 4,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.2 + 40, 'working title · prototype', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CONFIG.colors.textDim,
      })
      .setOrigin(0.5);

    // decorative frames
    const fb = this.add.graphics().setPosition(width / 2 - 50, height * 0.34);
    drawSlantFrame(fb, 'blue', 60, 40, 4, 0.2);
    const fr = this.add.graphics().setPosition(width / 2 + 50, height * 0.34);
    drawSlantFrame(fr, 'red', 60, 40, 4, 0.2);
    this.tweens.add({ targets: [fb, fr], y: '+=6', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const rules = [
      'Tap a gap to work its lowest knot.',
      'BLUE frame undoes knots where the RIGHT rope is on top.',
      'RED frame undoes knots where the LEFT rope is on top.',
      'The frame flips after every move. Wrong frame = tighter knot.',
      'Green outline = will untwist. Red = will tighten.',
      'Clear every knot on a rope and the rope falls away.',
      'Knots that reach the floor end the game.',
    ];
    this.add
      .text(width / 2, height * 0.42, rules.join('\n'), {
        fontFamily: FONT,
        fontSize: '14px',
        color: CONFIG.colors.textDim,
        align: 'center',
        lineSpacing: 7,
        wordWrap: { width: width - 48 },
      })
      .setOrigin(0.5, 0);

    const play = this.add
      .text(width / 2, height * 0.72, 'TAP TO PLAY', {
        fontFamily: FONT,
        fontSize: '28px',
        color: CONFIG.colors.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: play, alpha: { from: 1, to: 0.35 }, duration: 650, yoyo: true, repeat: -1 });

    this.add
      .text(width / 2, height * 0.72 + 36, `BEST ${getHighScore()}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: CONFIG.colors.textDim,
      })
      .setOrigin(0.5);

    this.toggleRect = new Phaser.Geom.Rectangle(width / 2 - 110, height * 0.84, 220, 44);
    const g = this.add.graphics();
    g.fillStyle(0x23263a, 1);
    g.fillRoundedRect(this.toggleRect.x, this.toggleRect.y, this.toggleRect.width, this.toggleRect.height, 12);
    g.lineStyle(2, 0x343850, 1);
    g.strokeRoundedRect(this.toggleRect.x, this.toggleRect.y, this.toggleRect.width, this.toggleRect.height, 12);
    this.toggleText = this.add
      .text(this.toggleRect.centerX, this.toggleRect.centerY, '', {
        fontFamily: FONT,
        fontSize: '15px',
        color: CONFIG.colors.text,
      })
      .setOrigin(0.5);
    this.refreshToggle();

    this.add
      .text(width / 2, height - 24, 'desktop: ← → move · space act · F flip · C candle', {
        fontFamily: FONT,
        fontSize: '11px',
        color: CONFIG.colors.textDim,
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.toggleRect.contains(p.x, p.y)) {
        this.twoTap = !this.twoTap;
        setTwoTap(this.twoTap);
        this.refreshToggle();
        return;
      }
      this.start();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.start());
    this.input.keyboard?.on('keydown-ENTER', () => this.start());
  }

  private refreshToggle(): void {
    this.toggleText.setText(`Two-tap mode: ${this.twoTap ? 'ON' : 'OFF'}`);
  }

  private start(): void {
    this.scene.start('game', { twoTap: this.twoTap });
  }
}
