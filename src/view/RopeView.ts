import Phaser from 'phaser';
import { CONFIG } from '../config';

/** Placeholder rope: a vertical strand of beads. Swap this class for sprite art later. */
export class RopeView extends Phaser.GameObjects.Graphics {
  colorIndex: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    private readonly top: number,
    private readonly bottom: number,
    colorIndex: number,
  ) {
    super(scene, {});
    this.colorIndex = colorIndex;
    this.setPosition(x, 0);
    this.redraw(colorIndex);
    scene.add.existing(this);
  }

  redraw(colorIndex: number): void {
    this.colorIndex = colorIndex;
    const color = CONFIG.colors.palette[colorIndex % CONFIG.colors.palette.length];
    const r = CONFIG.layout.beadRadius;
    const pitch = r * 2 + CONFIG.layout.beadGap;
    const light = Phaser.Display.Color.ValueToColor(color).lighten(35).color;
    this.clear();
    for (let y = this.top + r; y <= this.bottom - r; y += pitch) {
      this.fillStyle(color, 1);
      this.fillCircle(0, y, r);
      this.fillStyle(light, 0.9);
      this.fillCircle(-r * 0.3, y - r * 0.3, r * 0.35);
    }
  }
}
