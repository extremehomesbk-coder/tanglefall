import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { FrameType } from '../model/types';
import { drawSlantFrame } from './FrameView';

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** Top strip (score, level, frame now/next) and bottom strip (flip button, candle timer). */
export class Hud {
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly chainText: Phaser.GameObjects.Text;
  private readonly frameNow: Phaser.GameObjects.Graphics;
  private readonly frameNext: Phaser.GameObjects.Graphics;
  private readonly nowLabel: Phaser.GameObjects.Text;
  private readonly flipBg: Phaser.GameObjects.Graphics;
  private readonly flipText: Phaser.GameObjects.Text;
  private readonly flipRect: Phaser.Geom.Rectangle;
  private readonly candleBar: Phaser.GameObjects.Graphics;
  private readonly candleText: Phaser.GameObjects.Text;
  flipEnabled = false;

  constructor(private readonly scene: Phaser.Scene) {
    const L = CONFIG.layout;
    const dim = CONFIG.colors.textDim;
    const txt = CONFIG.colors.text;

    scene.add.text(16, 12, 'SCORE', { fontFamily: FONT, fontSize: '11px', color: dim }).setDepth(50);
    this.scoreText = scene.add
      .text(16, 26, '0', { fontFamily: FONT, fontSize: '30px', color: txt, fontStyle: 'bold' })
      .setDepth(50);
    this.bestText = scene.add.text(16, 64, 'BEST 0', { fontFamily: FONT, fontSize: '12px', color: dim }).setDepth(50);
    this.chainText = scene.add
      .text(L.width / 2, 66, '', { fontFamily: FONT, fontSize: '13px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setDepth(50);

    this.levelText = scene.add
      .text(L.width / 2, 22, '1-1', { fontFamily: FONT, fontSize: '22px', color: txt, fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setDepth(50);
    scene.add
      .text(L.width / 2, 50, 'STAGE', { fontFamily: FONT, fontSize: '11px', color: dim })
      .setOrigin(0.5, 0)
      .setDepth(50);

    this.frameNow = scene.add.graphics().setPosition(L.width - 92, 48).setDepth(50);
    this.frameNext = scene.add.graphics().setPosition(L.width - 32, 56).setDepth(50);
    this.nowLabel = scene.add
      .text(L.width - 92, 78, 'NOW', { fontFamily: FONT, fontSize: '11px', color: dim })
      .setOrigin(0.5, 0)
      .setDepth(50);
    scene.add
      .text(L.width - 32, 78, 'NEXT', { fontFamily: FONT, fontSize: '11px', color: dim })
      .setOrigin(0.5, 0)
      .setDepth(50);

    const footerTop = L.height - L.footerHeight;
    this.flipRect = new Phaser.Geom.Rectangle(L.width - 16 - 132, footerTop + 22, 132, 56);
    this.flipBg = scene.add.graphics().setDepth(50);
    this.flipText = scene.add
      .text(this.flipRect.centerX, this.flipRect.centerY, 'FLIP  ✦ 0', {
        fontFamily: FONT,
        fontSize: '18px',
        color: txt,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.candleBar = scene.add.graphics().setDepth(50);
    this.candleText = scene.add
      .text(16, footerTop + 30, '', { fontFamily: FONT, fontSize: '12px', color: '#ffb07a', fontStyle: 'bold' })
      .setDepth(50);

    this.setBonuses(0);
    this.setFrame('blue');
    this.setCandle(null);
  }

  setScore(n: number): void {
    this.scoreText.setText(String(n));
  }

  setBest(n: number): void {
    this.bestText.setText(`BEST ${n}`);
  }

  setLevel(level: number, stage: number): void {
    this.levelText.setText(`${level}-${stage}`);
  }

  setChain(chain: number): void {
    this.chainText.setText(chain >= 2 ? `CHAIN x${chain}` : '');
  }

  setFrame(now: FrameType): void {
    const next: FrameType = now === 'blue' ? 'red' : 'blue';
    this.frameNow.clear();
    drawSlantFrame(this.frameNow, now, 44, 30, 4, 0.25);
    this.frameNext.clear();
    drawSlantFrame(this.frameNext, next, 26, 18, 3, 0.15);
    this.nowLabel.setText(now === 'blue' ? 'NOW: BLUE' : 'NOW: RED');
    this.scene.tweens.add({ targets: this.frameNow, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.easeOut' });
  }

  setBonuses(n: number): void {
    this.flipEnabled = n > 0;
    this.flipText.setText(`FLIP  ✦ ${n}`);
    const r = this.flipRect;
    this.flipBg.clear();
    this.flipBg.fillStyle(this.flipEnabled ? 0x3f4a7a : 0x23263a, 1);
    this.flipBg.fillRoundedRect(r.x, r.y, r.width, r.height, 14);
    this.flipBg.lineStyle(2, this.flipEnabled ? 0x8aa4ff : 0x343850, 1);
    this.flipBg.strokeRoundedRect(r.x, r.y, r.width, r.height, 14);
    this.flipText.setAlpha(this.flipEnabled ? 1 : 0.45);
  }

  hitFlip(x: number, y: number): boolean {
    return this.flipRect.contains(x, y);
  }

  /** fraction 0..1 of candle time left, or null when no candle burns. */
  setCandle(fraction: number | null): void {
    this.candleBar.clear();
    if (fraction === null) {
      this.candleText.setText('');
      return;
    }
    const L = CONFIG.layout;
    const x = 16;
    const y = L.height - L.footerHeight + 50;
    const w = 150;
    this.candleText.setText('CANDLE: line up the dots, tap the bottom one');
    this.candleBar.fillStyle(0x2a2e3f, 1);
    this.candleBar.fillRoundedRect(x, y, w, 10, 5);
    this.candleBar.fillStyle(CONFIG.colors.candle, 1);
    this.candleBar.fillRoundedRect(x, y, Math.max(6, w * fraction), 10, 5);
  }

  flashFlip(): void {
    this.scene.tweens.add({ targets: this.flipText, scale: { from: 1.2, to: 1 }, duration: 150 });
  }
}
