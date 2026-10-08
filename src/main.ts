import Phaser from 'phaser';
import { generateStaticTextures } from './render/textures';
import { CrewScene } from './scenes/CrewScene';
import { HUDScene } from './scenes/HUDScene';
import { LevelScene } from './scenes/LevelScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { StatsScene } from './scenes/StatsScene';
import { VIEW_H, VIEW_W } from './sim/constants';
import { sfx } from './systems/Audio';
import { load } from './systems/Save';

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create(): void {
    const save = load();
    generateStaticTextures(this, save.skin);
    const s = save.settings;
    sfx.enabled = s.sound;
    sfx.setVolume(s.volume);
    const params = new URLSearchParams(location.search);
    const level = params.get('level');
    this.scene.start(level ? 'Level' : 'Menu', level ? { levelId: level, mode: params.has('demo') ? 'demo' : 'play' } : undefined);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#FDF3EA',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  render: { antialias: true, powerPreference: 'high-performance' },
  scene: [BootScene, MenuScene, LevelScene, HUDScene, ResultScene, CrewScene, StatsScene],
});

// Handy for debugging in the console; harmless in production.
(window as unknown as { game: Phaser.Game }).game = game;
