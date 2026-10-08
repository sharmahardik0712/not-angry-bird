import Phaser from 'phaser';
import { LEVELS, WORLDS } from '../levels';
import { generateBackdrop, thiefKey } from '../render/textures';
import { VIEW_H, VIEW_W } from '../sim/constants';
import type { LevelData } from '../sim/types';
import { THIEF_TYPES } from '../sim/types';
import { sfx } from '../systems/Audio';
import { todaysGoals } from '../systems/Progress';
import { load, starCount, totalStars, updateSettings } from '../systems/Save';
import { C, N } from '../ui/theme';
import { button, card, describeStyle, drawIcon, iconButton, num, textStyle, timeAgo } from '../ui/ui';

export class MenuScene extends Phaser.Scene {
  private popup?: Phaser.GameObjects.Container;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.popup = undefined;
    generateBackdrop(this, 'bg3-menu', VIEW_W, 0, VIEW_H - 50, VIEW_H);
    this.add.image(0, 0, 'bg3-menu').setOrigin(0);
    const save = load();
    sfx.enabled = save.settings.sound;

    this.add.text(48, 36, 'Chain Reaction Heist', textStyle(38));
    const starPill = this.add.container(VIEW_W - 100, 58, [card(this, 130, 48, 24)]);
    starPill.add(this.add.image(-38, 0, 'star').setTint(N.sun).setDisplaySize(28, 28));
    starPill.add(this.add.text(-18, 0, `${totalStars()}/${LEVELS.length * 3}`, textStyle(20)).setOrigin(0, 0.5));

    const world = WORLDS[0];
    this.add.text(48, 110, world.name, textStyle(18, C.muted));
    const levels = LEVELS.filter((l) => l.world === world.id);
    levels.forEach((l, i) => {
      const unlocked = i === 0 || starCount(levels[i - 1].id) > 0;
      this.levelCard(l, i, 48 + 130 + (i % 3) * 276, 238 + Math.floor(i / 3) * 196, unlocked);
    });

    this.today(VIEW_W - 48 - 170, 336);

    // The crew strolls along the street.
    THIEF_TYPES.forEach((t, i) => {
      const img = this.add.image(-60 - i * 46, VIEW_H - 70, thiefKey(t, 'idle')).setDisplaySize(38, 38);
      this.tweens.add({ targets: img, x: VIEW_W + 60, duration: 22000, repeat: -1, delay: i * 500 });
      this.tweens.add({ targets: img, y: img.y - 5, yoyo: true, repeat: -1, duration: 300, ease: 'Sine.easeInOut', delay: i * 80 });
    });

    // Footer.
    button(this, 48 + 75, VIEW_H - 28, 'Crew', () => this.scene.start('Crew'), { w: 140, h: 46, size: 17, color: N.panel, icon: 'crew' });
    button(this, 48 + 230, VIEW_H - 28, 'Stats', () => this.scene.start('Stats'), { w: 140, h: 46, size: 17, color: N.panel, icon: 'stats' });
    const sound = iconButton(this, 48 + 345, VIEW_H - 28, save.settings.sound ? 'sound' : 'mute', () => {
      const s = updateSettings({ sound: !load().settings.sound });
      sfx.enabled = s.sound;
      const g = sound.list[1] as Phaser.GameObjects.Graphics;
      g.clear(); drawIcon(g, s.sound ? 'sound' : 'mute', 0, 0, 46 * 0.42, N.ink);
    }, 46);
    const shake = iconButton(this, 48 + 401, VIEW_H - 28, 'shake', () => shake.setAlpha(updateSettings({ shake: !load().settings.shake }).shake ? 1 : 0.4), 46);
    shake.setAlpha(save.settings.shake ? 1 : 0.4);
  }

  private levelCard(l: LevelData, i: number, x: number, y: number, unlocked: boolean): void {
    const p = load().levels[l.id];
    const stars = p?.stars.filter(Boolean).length ?? 0;
    const w = 252, h = 172;
    const c = this.add.container(x, y);
    c.add(card(this, w, h, 26, unlocked ? N.panel : 0xf3f0f8));
    if (!unlocked) {
      const g = this.add.graphics();
      drawIcon(g, 'lock', 0, -10, 34, N.faint);
      c.add(g);
      return;
    }
    c.add(this.add.text(0, -h / 2 + 46, `${i + 1}`, textStyle(48, C.coral)).setOrigin(0.5));
    c.add(this.add.text(0, 10, l.name, textStyle(18)).setOrigin(0.5));
    for (let s = 0; s < 3; s++) c.add(this.add.image((s - 1) * 32, h / 2 - 34, 'star').setTint(s < stars ? N.sun : 0xeee9f5).setDisplaySize(28, 28));
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.03, duration: 100 }));
    c.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 100 }));
    c.on('pointerup', () => { sfx.unlock(); sfx.click(); this.showLevel(l, i); });
  }

  /** Today's three optional challenges, as a plain checklist. */
  private today(x: number, y: number): void {
    const save = load();
    const goals = todaysGoals(save);
    const w = 320, h = 260;
    const c = this.add.container(x, y, [card(this, w, h, 24)]);
    c.add(this.add.text(-w / 2 + 24, -h / 2 + 22, 'Today', textStyle(22)));
    goals.forEach((g, i) => {
      const gy = -h / 2 + 88 + i * 58;
      const done = save.daily.done.includes(g.id);
      const v = save.daily.progress[g.id] ?? 0;
      const box = this.add.graphics();
      box.lineStyle(2.5, done ? N.mint : N.faint).strokeRoundedRect(-w / 2 + 24, gy - 11, 22, 22, 6);
      if (done) box.fillStyle(N.mint).fillRoundedRect(-w / 2 + 24, gy - 11, 22, 22, 6).lineStyle(3, 0xffffff).beginPath().moveTo(-w / 2 + 29, gy).lineTo(-w / 2 + 34, gy + 5).lineTo(-w / 2 + 42, gy - 5).strokePath();
      c.add(box);
      c.add(this.add.text(-w / 2 + 58, gy - 10, g.text, textStyle(15, done ? C.muted : C.ink, done ? 'normal' : 'bold')));
      if (!done && g.target > 1) c.add(this.add.text(-w / 2 + 58, gy + 10, `${num(v)} of ${num(g.target)}`, textStyle(12, C.muted, 'normal')));
    });
  }

  /** Level detail: what each star asks, best score, recent attempts, play / watch best. */
  private showLevel(l: LevelData, i: number): void {
    this.popup?.destroy();
    const p = load().levels[l.id];
    const w = 520, h = 420;
    const shade = this.add.rectangle(0, 0, VIEW_W, VIEW_H, N.ink, 0.3).setOrigin(0).setInteractive();
    const box = this.add.container(VIEW_W / 2, VIEW_H / 2, [card(this, w, h, 30)]);
    const root = this.add.container(0, 0, [shade, box]).setDepth(10);
    this.popup = root;
    const close = () => { root.destroy(); this.popup = undefined; };
    shade.on('pointerup', close);

    box.add(this.add.text(-w / 2 + 32, -h / 2 + 28, `${i + 1}. ${l.name}`, textStyle(28)));
    ['Grab the loot', `Score ${num(l.stars.score)}`, describeStyle(l.stars.style)].forEach((g, k) => {
      const gy = -h / 2 + 96 + k * 34;
      const got = p?.stars[k];
      box.add(this.add.image(-w / 2 + 44, gy, 'star').setTint(got ? N.sun : 0xeee9f5).setDisplaySize(24, 24));
      box.add(this.add.text(-w / 2 + 66, gy, g, textStyle(16, got ? C.ink : C.muted, 'normal')).setOrigin(0, 0.5));
    });
    box.add(this.add.text(w / 2 - 32, -h / 2 + 96, 'Best', textStyle(13, C.muted)).setOrigin(1, 0.5));
    box.add(this.add.text(w / 2 - 32, -h / 2 + 126, p?.best ? num(p.best) : '—', textStyle(30)).setOrigin(1, 0.5));

    box.add(this.add.text(-w / 2 + 32, -h / 2 + 210, 'Recent tries', textStyle(16)));
    const attempts = p?.attempts.slice(0, 4) ?? [];
    if (!attempts.length) box.add(this.add.text(-w / 2 + 32, -h / 2 + 244, 'Nothing yet. Your tries will show up here.', textStyle(14, C.muted, 'normal')));
    attempts.forEach((a, k) => {
      const ay = -h / 2 + 246 + k * 28;
      box.add(this.add.text(-w / 2 + 32, ay, timeAgo(a.at), textStyle(14, C.muted, 'normal')).setOrigin(0, 0.5));
      box.add(this.add.text(-w / 2 + 160, ay, a.win ? '★'.repeat(a.stars) || 'Won' : 'Missed', textStyle(14, a.win ? '#D9922E' : C.coral)).setOrigin(0, 0.5));
      box.add(this.add.text(w / 2 - 32, ay, num(a.score), textStyle(15)).setOrigin(1, 0.5));
    });

    const by = h / 2 - 48;
    const hasBest = !!p?.bestInputs?.length;
    box.add(button(this, hasBest ? 100 : 0, by, 'Play', () => this.scene.start('Level', { levelId: l.id }), { w: 200, h: 58, size: 22, icon: 'play' }));
    if (hasBest) box.add(button(this, -110, by, 'Watch best', () => this.scene.start('Level', { levelId: l.id, mode: 'watch' }), { w: 190, h: 58, size: 17, color: N.panel, icon: 'eye' }));
    box.add(button(this, w / 2 - 34, -h / 2 + 34, '', close, { w: 40, h: 40, color: 0xf1edf7, icon: 'back', textColor: C.muted }));
    box.setScale(0.94).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 180, ease: 'Cubic.easeOut' });
  }
}
