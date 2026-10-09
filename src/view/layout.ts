import { CONFIG } from '../config';

/** Pixel geometry of the board: rope columns and knot rows. Spacing is fixed per stage. */
export class Layout {
  readonly width = CONFIG.layout.width;
  readonly height = CONFIG.layout.height;
  readonly boardTop = CONFIG.layout.hudHeight;
  readonly boardBottom = CONFIG.layout.height - CONFIG.layout.footerHeight;
  readonly boardHeight = this.boardBottom - this.boardTop;
  readonly padTop = 14; // keeps row 0 clear of the board's top edge
  readonly rowH = (this.boardHeight - this.padTop) / CONFIG.board.rows;
  readonly centerX = CONFIG.layout.width / 2;
  spacing = CONFIG.layout.maxSpacing;

  setRopeCount(n: number): void {
    const usable = this.width - 2 * CONFIG.layout.boardMarginX;
    this.spacing = Math.min(CONFIG.layout.maxSpacing, usable / Math.max(1, n - 1));
  }

  /** x of rope i when n ropes hang (the group stays centred as ropes vanish). */
  colX(i: number, n: number): number {
    return this.centerX + (i - (n - 1) / 2) * this.spacing;
  }

  gapX(gap: number, n: number): number {
    return (this.colX(gap, n) + this.colX(gap + 1, n)) / 2;
  }

  rowY(row: number): number {
    return this.boardTop + this.padTop + (row + 0.5) * this.rowH;
  }

  gapFromX(x: number, n: number): number {
    if (n < 2) return 0;
    const g = Math.floor((x - this.colX(0, n)) / this.spacing);
    return Math.max(0, Math.min(n - 2, g));
  }

  dangerY(): number {
    return this.boardTop + this.padTop + (CONFIG.board.rows - CONFIG.board.dangerRows) * this.rowH;
  }
}
