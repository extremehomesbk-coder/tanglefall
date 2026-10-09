import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { Knot } from '../model/types';

export type Preview = 'none' | 'good' | 'bad';

/** Overlay for one knot: danger glow, optional preview ring and power-up marker. The crossing itself is drawn by BraidView. */
export class KnotView extends Phaser.GameObjects.Container {
  readonly glow: Phaser.GameObjects.Arc;
  readonly ring: Phaser.GameObjects.Arc;
  readonly marker: Phaser.GameObjects.Graphics;
  knot: Knot;

  constructor(scene: Phaser.Scene, x: number, y: number, knot: Knot, w: number, h: number) {
    super(scene, x, y);
    this.knot = knot;
    const r = Math.max(w, h) * 0.5;
    this.glow = scene.add.circle(0, 0, r * 1.2, CONFIG.colors.danger, 1).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.ring = scene.add.circle(0, 0, r * 0.9).setVisible(false);
    this.ring.setStrokeStyle(3, CONFIG.colors.previewGood, 1);
    this.marker = scene.add.graphics();
    this.add([this.glow, this.ring, this.marker]);
    this.drawMarker();
    scene.add.existing(this);
  }

  private drawMarker(): void {
    const m = this.marker;
    m.clear();
    const s = 7;
    switch (this.knot.power) {
      case 'sparkle': {
        m.fillStyle(CONFIG.colors.sparkle, 1);
        const pts = [];
        for (let i = 0; i < 8; i++) {
          const rad = i % 2 === 0 ? s * 1.4 : s * 0.5;
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          pts.push(new Phaser.Geom.Point(Math.cos(a) * rad, Math.sin(a) * rad));
        }
        m.fillPoints(pts, true);
        m.fillStyle(0xffffff, 1);
        m.fillCircle(0, 0, s * 0.35);
        break;
      }
      case 'candle': {
        m.fillStyle(0xfff1c4, 1);
        m.fillRoundedRect(-s * 0.45, -s * 0.2, s * 0.9, s * 1.5, 2);
        m.fillStyle(CONFIG.colors.candle, 1);
        m.fillTriangle(-s * 0.6, -s * 0.1, s * 0.6, -s * 0.1, 0, -s * 1.7);
        m.fillStyle(0xfff176, 1);
        m.fillTriangle(-s * 0.3, -s * 0.15, s * 0.3, -s * 0.15, 0, -s * 1.0);
        break;
      }
      case 'brush': {
        m.fillStyle(0xd7b98a, 1);
        m.fillRoundedRect(-s * 0.35, -s * 1.4, s * 0.7, s * 1.6, 2);
        m.fillStyle(CONFIG.colors.brush, 1);
        m.fillRoundedRect(-s * 0.7, s * 0.1, s * 1.4, s * 1.1, 2);
        m.fillStyle(0xff6ad5, 1);
        m.fillRect(-s * 0.7, s * 0.8, s * 1.4, s * 0.4);
        break;
      }
      default:
        break;
    }
  }

  setPreview(p: Preview): void {
    if (p === 'none') {
      this.ring.setVisible(false);
      return;
    }
    this.ring.setVisible(true);
    this.ring.setStrokeStyle(3, p === 'good' ? CONFIG.colors.previewGood : CONFIG.colors.previewBad, 1);
  }
}
