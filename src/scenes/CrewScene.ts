import Phaser from 'phaser';
import { ensureThiefTextures, setActiveSkin, thiefKey } from '../render/textures';
import { VIEW_W } from '../sim/constants';
import { THIEF_TYPES } from '../sim/types';
import { sfx } from '../systems/Audio';
import { equipSkin, load, totalStars } from '../systems/Save';
import { C, N, SKINS, skinUnlocked, type Skin } from '../ui/theme';
import { button, card, drawIcon, textStyle } from '../ui/ui';

/** Crew looks. Each one unlocks at a star total. Purely cosmetic. */
export class CrewScene extends Phaser.Scene {
  constructor() {
    super('Crew');
  }

  create(): void {
    this.add.image(0, 0, 'bg3-menu').setOrigin(0);
    for (const s of SKINS) ensureThiefTextures(this, s.id);
    button(this, 80, 58, 'Back', () => this.scene.start('Menu'), { w: 120, h: 50, size: 18, color: N.panel, icon: 'back' });
    this.add.text(170, 36, 'Your crew', textStyle(34));
    this.add.text(172, 80, 'Earn stars to unlock new looks.', textStyle(15, C.muted, 'normal'));
    const pill = this.add.container(VIEW_W - 110, 58, [card(this, 130, 48, 24)]);
    pill.add(this.add.image(-38, 0, 'star').setTint(N.sun).setDisplaySize(28, 28));
    pill.add(this.add.text(-18, 0, `${totalStars()}`, textStyle(20)).setOrigin(0, 0.5));
    SKINS.forEach((s, i) => this.skinCard(s, 48 + 190 + (i % 3) * 400, 250 + Math.floor(i / 3) * 250));
  }

  private skinCard(s: Skin, x: number, y: number): void {
    const stars = totalStars();
    const open = skinUnlocked(s, stars);
    const equipped = load().skin === s.id;
    const w = 370, h = 220;
    const c = this.add.container(x, y, [card(this, w, h, 26)]);
    if (equipped) {
      const g = this.add.graphics();
      g.lineStyle(3, N.coral).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
      c.add(g);
    }
    c.add(this.add.text(-w / 2 + 24, -h / 2 + 20, s.name, textStyle(22, open ? C.ink : C.faint)));
    THIEF_TYPES.forEach((t, k) => {
      const img = this.add.image(-w / 2 + 60 + k * 82, -8, thiefKey(t, k % 2 ? 'cheer' : 'idle', s.id)).setDisplaySize(60, 60).setAlpha(open ? 1 : 0.35);
      c.add(img);
      if (open) this.tweens.add({ targets: img, scaleY: img.scaleY * 1.05, yoyo: true, repeat: -1, duration: 900 + k * 120, ease: 'Sine.easeInOut' });
    });
    const by = h / 2 - 40;
    if (equipped) {
      c.add(this.add.text(0, by, 'Equipped', textStyle(18, C.coral)).setOrigin(0.5));
    } else if (open) {
      c.add(button(this, 0, by, 'Use', () => { if (equipSkin(s.id)) { setActiveSkin(s.id); sfx.star(1); this.scene.restart(); } }, { w: 150, h: 46, size: 18 }));
    } else {
      const g = this.add.graphics();
      drawIcon(g, 'lock', -48, by, 22, N.faint);
      c.add([g, this.add.text(-30, by, `${s.stars} stars`, textStyle(17, C.muted)).setOrigin(0, 0.5)]);
    }
  }
}
