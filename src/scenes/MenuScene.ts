import Phaser from 'phaser';
import { CONFIG } from '../config';
import { getHighScore, getMute, getTwoTap, setMute, setTwoTap } from '../storage';
import { setMuted, unlockAudio } from '../audio';
import { drawSlantFrame } from '../view/FrameView';

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export class MenuScene extends Phaser.Scene {
  private twoTap = false;
  private toggleText!: Phaser.GameObjects.Text;
  private toggleRect!: Phaser.Geom.Rectangle;
  private soundText!: Phaser.GameObjects.Text;
  private soundRect!: Phaser.Geom.Rectangle;

  constructor() {
    super('menu');
  }

  create(): void {
    const { width, height } = CONFIG.layout;
    this.twoTap = getTwoTap(CONFIG.rules.twoTapMode);
    setMuted(getMute());

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
      'Six dogs, six leashes, one tangle. Tap a gap to work its lowest knot.',
      'BLUE frame undoes knots where the RIGHT leash is on top (bright strand).',
      'RED frame undoes knots where the LEFT leash is on top.',
      'The frame flips after every move. Wrong frame = tighter knot and the bar jumps.',
      'Chain untwists fast for x2..x8. Free a dog and the bar resets.',
      'A knot that reaches the floor ends the walk.',
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
      .text(width / 2, height * 0.755, 'TAP TO PLAY', {
        fontFamily: FONT,
        fontSize: '28px',
        color: CONFIG.colors.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: play, alpha: { from: 1, to: 0.35 }, duration: 650, yoyo: true, repeat: -1 });

    this.add
      .text(width / 2, height * 0.755 + 32, `BEST ${getHighScore()}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: CONFIG.colors.textDim,
      })
      .setOrigin(0.5);

    this.toggleRect = new Phaser.Geom.Rectangle(width / 2 - 150, height * 0.855, 140, 44);
    this.soundRect = new Phaser.Geom.Rectangle(width / 2 + 10, height * 0.855, 140, 44);
    const g = this.add.graphics();
    for (const r of [this.toggleRect, this.soundRect]) {
      g.fillStyle(0x23263a, 1);
      g.fillRoundedRect(r.x, r.y, r.width, r.height, 12);
      g.lineStyle(2, 0x343850, 1);
      g.strokeRoundedRect(r.x, r.y, r.width, r.height, 12);
    }
    this.toggleText = this.add
      .text(this.toggleRect.centerX, this.toggleRect.centerY, '', { fontFamily: FONT, fontSize: '14px', color: CONFIG.colors.text })
      .setOrigin(0.5);
    this.soundText = this.add
      .text(this.soundRect.centerX, this.soundRect.centerY, '', { fontFamily: FONT, fontSize: '14px', color: CONFIG.colors.text })
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
      unlockAudio();
      if (this.toggleRect.contains(p.x, p.y)) {
        this.twoTap = !this.twoTap;
        setTwoTap(this.twoTap);
        this.refreshToggle();
        return;
      }
      if (this.soundRect.contains(p.x, p.y)) {
        const mute = !getMute();
        setMute(mute);
        setMuted(mute);
        this.refreshToggle();
        return;
      }
      this.start();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.start());
    this.input.keyboard?.on('keydown-ENTER', () => this.start());
  }

  private refreshToggle(): void {
    this.toggleText.setText(`Two-tap: ${this.twoTap ? 'ON' : 'OFF'}`);
    this.soundText.setText(`Sound: ${getMute() ? 'OFF' : 'ON'}`);
  }

  private start(): void {
    this.scene.start('game', { twoTap: this.twoTap });
  }
}
