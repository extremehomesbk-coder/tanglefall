import Phaser from 'phaser';
import { CONFIG } from './config';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { HD } from './hd';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: CONFIG.colors.background,
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
