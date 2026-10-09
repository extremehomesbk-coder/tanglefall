import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { Layout } from './layout';

export interface Crossing {
  row: number;
  col: number; // left column of the pair
  topRope: number; // rope id drawn over
  underRope: number; // rope id drawn under
}

/** Where every rope runs: x per row boundary (0..rows), plus colours and which rope is over at each crossing. */
export interface BraidSnapshot {
  paths: Map<number, number[]>;
  colors: Map<number, number>;
  crossings: Crossing[];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Draws all leashes as one braid. Any state change becomes a transition: the previous snapshot morphs into the
 * next one over `t` 0..1 (ropes swing across columns, removed ropes fade). A push also slides the whole braid
 * down one row via `pushOffset`.
 */
export class BraidView extends Phaser.GameObjects.Graphics {
  t = 1;
  pushOffset = 0;
  dirty = true;
  private prev: BraidSnapshot;
  private next: BraidSnapshot;
  private readonly rows = CONFIG.board.rows;
  private readonly light: number[];
  private readonly dark: number[];
  private readonly thick = CONFIG.layout.beadRadius * 2;

  constructor(
    scene: Phaser.Scene,
    private readonly layout: Layout,
    initial: BraidSnapshot,
  ) {
    super(scene, {});
    this.prev = initial;
    this.next = initial;
    this.light = CONFIG.colors.palette.map((c) => Phaser.Display.Color.ValueToColor(c).lighten(32).color);
    this.dark = CONFIG.colors.palette.map((c) => Phaser.Display.Color.ValueToColor(c).darken(38).color);
    scene.add.existing(this);
    const maskG = scene.make.graphics({ x: 0, y: 0 });
    maskG.fillStyle(0xffffff, 1);
    maskG.fillRect(0, layout.boardTop, layout.width, layout.boardHeight);
    this.setMask(maskG.createGeometryMask());
    this.draw();
  }

  /** Start morphing towards `snap`. shiftDown: the old picture is treated as one row higher (a push). */
  setTarget(snap: BraidSnapshot, shiftDown = false): void {
    const current = this.currentSnapshot();
    if (shiftDown) {
      for (const [id, path] of current.paths) current.paths.set(id, [path[0], ...path.slice(0, path.length - 1)]);
    }
    this.prev = current;
    this.next = snap;
    this.t = 0;
    this.dirty = true;
  }

  get animating(): boolean {
    return this.t < 1 || this.pushOffset !== 0;
  }

  /** x of the rope's floor end right now (dogs follow this). */
  bottomX(ropeId: number): number | undefined {
    const p = this.pathNow(ropeId);
    return p ? p.x[this.rows] : undefined;
  }

  private pathNow(id: number): { x: number[]; alpha: number } | null {
    const a = this.prev.paths.get(id);
    const b = this.next.paths.get(id);
    if (a && b) return { x: a.map((v, i) => lerp(v, b[i], this.t)), alpha: 1 };
    if (b) return { x: b, alpha: 1 };
    if (a) return { x: a, alpha: 1 - this.t };
    return null;
  }

  private currentSnapshot(): BraidSnapshot {
    const paths = new Map<number, number[]>();
    for (const id of new Set([...this.prev.paths.keys(), ...this.next.paths.keys()])) {
      const p = this.pathNow(id);
      if (p && p.alpha > 0.05) paths.set(id, p.x);
    }
    return { paths, colors: new Map(this.next.colors), crossings: this.next.crossings };
  }

  draw(): void {
    this.dirty = false;
    this.clear();
    const L = this.layout;
    const y = (r: number): number => L.boardTop + L.padTop + r * L.rowH + this.pushOffset;
    const ids = new Set([...this.prev.paths.keys(), ...this.next.paths.keys()]);
    const paths = new Map<number, { x: number[]; alpha: number }>();
    for (const id of ids) {
      const p = this.pathNow(id);
      if (p && p.alpha > 0.02) paths.set(id, p);
    }
    const byRow = new Map<number, Crossing[]>();
    for (const c of this.next.crossings) {
      const list = byRow.get(c.row) ?? [];
      list.push(c);
      byRow.set(c.row, list);
    }
    for (let r = 0; r < this.rows; r++) {
      const crossings = byRow.get(r) ?? [];
      const busy = new Set<number>();
      for (const c of crossings) {
        busy.add(c.topRope);
        busy.add(c.underRope);
      }
      for (const [id, p] of paths) if (!busy.has(id)) this.segment(id, p, r, y, false);
      for (const c of crossings) {
        const under = paths.get(c.underRope);
        const top = paths.get(c.topRope);
        if (under) this.segment(c.underRope, under, r, y, false);
        if (top) this.segment(c.topRope, top, r, y, true);
      }
    }
  }

  private segment(id: number, p: { x: number[]; alpha: number }, r: number, y: (r: number) => number, over: boolean): void {
    const colorIndex = this.next.colors.get(id) ?? this.prev.colors.get(id) ?? 0;
    const color = CONFIG.colors.palette[colorIndex % CONFIG.colors.palette.length];
    const light = this.light[colorIndex % this.light.length];
    const x0 = p.x[r];
    const x1 = p.x[r + 1];
    const y0 = y(r);
    const y1 = y(r + 1);
    const a = p.alpha;
    const w = this.thick;
    if (over) {
      this.lineStyle(w + 7, 0xffffff, 0.9 * a);
      this.lineBetween(x0, y0, x1, y1);
      this.lineStyle(w + 4, CONFIG.colors.board, a);
      this.lineBetween(x0, y0, x1, y1);
    }
    this.lineStyle(w, color, a);
    this.lineBetween(x0, y0, x1, y1);
    this.fillStyle(color, a);
    this.fillCircle(x0, y0, w / 2);
    this.fillCircle(x1, y1, w / 2);
    this.lineStyle(2.5, light, 0.5 * a);
    this.lineBetween(x0 - 2.5, y0, x1 - 2.5, y1);
    // twisted-rope texture: short diagonal ticks across the strand, so a leash reads as a leash and not a bar
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ux = dx / len;
    const uy = dy / len;
    const k = w * 0.42;
    const ax = (-uy - ux) * k;
    const ay = (ux - uy) * k;
    const n = Math.max(1, Math.round(len / 8));
    this.lineStyle(1.8, this.dark[colorIndex % this.dark.length], 0.55 * a);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      this.lineBetween(cx - ax, cy - ay, cx + ax, cy + ay);
    }
  }
}
