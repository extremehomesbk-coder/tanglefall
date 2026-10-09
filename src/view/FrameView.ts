import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { FrameType } from '../model/types';

/** Draws the slanted frame outline: blue slants right (/), red slants left (\). */
export function drawSlantFrame(
  g: Phaser.GameObjects.Graphics,
  type: FrameType,
  w: number,
  h: number,
  lineWidth: number,
  fillAlpha = 0.12,
): void {
  const color = type === 'blue' ? CONFIG.colors.frameBlue : CONFIG.colors.frameRed;
  const s = (type === 'blue' ? 1 : -1) * h * 0.35;
  const hw = w / 2;
  const hh = h / 2;
  const pts = [
    new Phaser.Geom.Point(-hw + s, -hh),
    new Phaser.Geom.Point(hw + s, -hh),
    new Phaser.Geom.Point(hw - s, hh),
    new Phaser.Geom.Point(-hw - s, hh),
  ];
  g.fillStyle(color, fillAlpha);
  g.fillPoints(pts, true);
  g.lineStyle(lineWidth + 4, color, 0.25);
  g.strokePoints(pts, true, true);
  g.lineStyle(lineWidth, color, 1);
  g.strokePoints(pts, true, true);
}

export class FrameView extends Phaser.GameObjects.Graphics {
  type: FrameType = 'blue';

  constructor(
    scene: Phaser.Scene,
    private fw: number,
    private fh: number,
  ) {
    super(scene, {});
    scene.add.existing(this);
    this.redraw('blue');
  }

  resize(w: number, h: number): void {
    this.fw = w;
    this.fh = h;
    this.redraw(this.type);
  }

  redraw(type: FrameType): void {
    this.type = type;
    this.clear();
    drawSlantFrame(this, type, this.fw + 6, this.fh + 6, 4);
  }
}
