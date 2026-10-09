import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { Knot } from '../model/types';

export type Preview = 'none' | 'good' | 'bad';

/** One knot: a crossing glyph between two rope columns, plus glow/preview/power-up markers. */
export class KnotView extends Phaser.GameObjects.Container {
  readonly glow: Phaser.GameObjects.Arc;
  readonly ring: Phaser.GameObjects.Arc;
  readonly glyph: Phaser.GameObjects.Graphics;
  readonly marker: Phaser.GameObjects.Graphics;
  knot: Knot;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    knot: Knot,
    private readonly kw: number,
    private readonly kh: number,
    leftColor: number,
    rightColor: number,
  ) {
    super(scene, x, y);
    this.knot = knot;
    const r = Math.max(kw, kh) * 0.5;
    this.glow = scene.add.circle(0, 0, r * 1.25, CONFIG.colors.danger, 1).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.ring = scene.add.circle(0, 0, r * 0.95).setVisible(false);
    this.ring.setStrokeStyle(3, CONFIG.colors.previewGood, 1);
    this.glyph = scene.add.graphics();
    this.marker = scene.add.graphics();
    this.add([this.glow, this.ring, this.glyph, this.marker]);
    this.redraw(leftColor, rightColor);
    scene.add.existing(this);
  }

  redraw(leftColorIndex: number, rightColorIndex: number): void {
    const pal = CONFIG.colors.palette;
    const left = pal[leftColorIndex % pal.length];
    const right = pal[rightColorIndex % pal.length];
    const thick = CONFIG.layout.beadRadius * 2;
    const hw = this.kw / 2;
    const hh = this.kh / 2 - 1;
    const g = this.glyph;
    g.clear();
    // knot body hides the straight rope segments behind the crossing
    g.fillStyle(CONFIG.colors.board, 1);
    g.fillRoundedRect(-hw - thick * 0.7, -hh, this.kw + thick * 1.4, this.kh - 2, 6);

    const under = this.knot.top === 'left' ? 'right' : 'left';
    this.strand(g, under, left, right, thick, hw, hh, false);
    this.strand(g, this.knot.top, left, right, thick, hw, hh, true);
    this.drawMarker();
  }

  private strand(
    g: Phaser.GameObjects.Graphics,
    side: 'left' | 'right',
    left: number,
    right: number,
    thick: number,
    hw: number,
    hh: number,
    onTop: boolean,
  ): void {
    // left rope travels top-left -> bottom-right; right rope travels top-right -> bottom-left
    const x1 = side === 'left' ? -hw : hw;
    const x2 = -x1;
    const base = side === 'left' ? left : right;
    const color = onTop ? base : Phaser.Display.Color.ValueToColor(base).darken(45).color;
    if (onTop) {
      g.lineStyle(thick + 6, 0xffffff, 0.9);
      g.lineBetween(x1, -hh, x2, hh);
      g.lineStyle(thick + 3, CONFIG.colors.board, 1);
      g.lineBetween(x1, -hh, x2, hh);
    }
    g.lineStyle(thick, color, 1);
    g.lineBetween(x1, -hh, x2, hh);
    g.fillStyle(color, 1);
    g.fillCircle(x1, -hh, thick / 2);
    g.fillCircle(x2, hh, thick / 2);
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
