import Phaser from 'phaser';
import { CONFIG } from './config';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { HD } from './hd';
import { watchInstall } from './install';

// ?canvas=1 forces the Canvas renderer (headless recorders have no GPU; WebGL there crawls)
const CANVAS = new URLSearchParams(window.location.search).has('canvas');

watchInstall();

new Phaser.Game({
  type: CANVAS ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'app',
  backgroundColor: CONFIG.colors.skyTop,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CONFIG.layout.width * HD,
    height: CONFIG.layout.height * HD,
  },
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 2 },
  scene: [MenuScene, GameScene],
});

// Offline shell for the installed app (production builds only, so dev never serves a stale bundle).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
