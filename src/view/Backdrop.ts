import Phaser from 'phaser';
import { CONFIG } from '../config';
import { HD } from '../hd';

/** Where the ground starts (dogs stand on it); everything above is sky. */
export function groundY(): number {
  return CONFIG.layout.height - CONFIG.layout.footerHeight + 30;
}

const hex = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Seeded so the stars sit still between scenes. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dusk park painted once into a canvas texture (works on WebGL and Canvas): sky gradient, stars, moon,
 * two hill lines, a grass bank and the path. Scenes add it as a plain image behind everything.
 */
export function addBackdrop(scene: Phaser.Scene): Phaser.GameObjects.Image {
  const key = `backdrop-${HD}`;
  if (!scene.textures.exists(key)) paint(scene, key);
  return scene.add.image(0, 0, key).setOrigin(0, 0).setScale(1 / HD).setDepth(-10);
}

function paint(scene: Phaser.Scene, key: string): void {
  const W = CONFIG.layout.width;
  const H = CONFIG.layout.height;
  const C = CONFIG.colors;
  const tex = scene.textures.createCanvas(key, W * HD, H * HD);
  if (!tex) return;
  const ctx = tex.context;
  ctx.scale(HD, HD);
  const gY = groundY();

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, gY);
  sky.addColorStop(0, hex(C.skyTop));
  sky.addColorStop(0.5, hex(C.skyMid));
  sky.addColorStop(1, hex(C.skyHorizon));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, gY);

  // stars
  const r = rng(20261013);
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = r() * gY * 0.6;
    const a = 0.25 + r() * 0.65;
    const rad = 0.5 + r() * 1.1;
    ctx.fillStyle = hex(C.star, a);
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // moon with a soft halo
  const mx = W * 0.84;
  const my = 168;
  const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 70);
  halo.addColorStop(0, hex(C.moon, 0.35));
  halo.addColorStop(1, hex(C.moon, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 70, my - 70, 140, 140);
  ctx.fillStyle = hex(C.moon, 0.95);
  ctx.beginPath();
  ctx.arc(mx, my, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hex(C.moon, 0.55);
  for (const [dx, dy, rr] of [
    [-5, -4, 3.2],
    [6, 3, 2.4],
    [-2, 7, 1.8],
  ]) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // hills: far and near, rolling bumps
  const hills = (base: number, amp: number, color: number, seed: number): void => {
    const q = rng(seed);
    ctx.fillStyle = hex(color);
    ctx.beginPath();
    ctx.moveTo(0, gY);
    ctx.lineTo(0, base);
    let x = 0;
    while (x < W) {
      const w = 60 + q() * 90;
      const h = amp * (0.5 + q());
      ctx.quadraticCurveTo(x + w / 2, base - h, x + w, base);
      x += w;
    }
    ctx.lineTo(W, gY);
    ctx.closePath();
    ctx.fill();
  };
  hills(gY - 48, 46, C.hillFar, 11);
  hills(gY - 18, 30, C.hillNear, 23);

  // ground: grass bank then the path the dogs stand on
  const grass = ctx.createLinearGradient(0, gY, 0, gY + 50);
  grass.addColorStop(0, hex(C.grassLight));
  grass.addColorStop(0.18, hex(C.grass));
  grass.addColorStop(1, hex(C.grass));
  ctx.fillStyle = grass;
  ctx.fillRect(0, gY, W, 50);
  // grass blades along the edge
  ctx.strokeStyle = hex(C.grassLight, 0.9);
  ctx.lineWidth = 1.5;
  const b = rng(99);
  for (let x = 4; x < W; x += 7 + b() * 8) {
    const h = 4 + b() * 7;
    ctx.beginPath();
    ctx.moveTo(x, gY + 1);
    ctx.lineTo(x + (b() - 0.5) * 4, gY + 1 - h);
    ctx.stroke();
  }
  ctx.fillStyle = hex(C.path);
  ctx.fillRect(0, gY + 50, W, H - gY - 50);
  ctx.fillStyle = hex(C.grassLight, 0.35);
  ctx.fillRect(0, gY + 50, W, 2);
  tex.refresh();
}

/** Red glow at the screen edges while knots sit in the danger rows (alpha driven by the scene). */
export function addDangerVignette(scene: Phaser.Scene): Phaser.GameObjects.Image {
  const key = `vignette-${HD}`;
  const W = CONFIG.layout.width;
  const H = CONFIG.layout.height;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, W * HD, H * HD);
    if (tex) {
      const ctx = tex.context;
      ctx.scale(HD, HD);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.62);
      g.addColorStop(0, hex(CONFIG.colors.danger, 0));
      g.addColorStop(1, hex(CONFIG.colors.danger, 0.75));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      tex.refresh();
    }
  }
  return scene.add.image(0, 0, key).setOrigin(0, 0).setScale(1 / HD).setDepth(45).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
}
