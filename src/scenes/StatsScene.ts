import Phaser from 'phaser';
import { LEVELS } from '../levels';
import { VIEW_W } from '../sim/constants';
import { load } from '../systems/Save';
import { C, N } from '../ui/theme';
import { button, card, num, textStyle } from '../ui/ui';

/** Lifetime stats and per-level history, all from this device's save. */
export class StatsScene extends Phaser.Scene {
  constructor() {
    super('Stats');
  }

  create(): void {
    this.add.image(0, 0, 'bg3-menu').setOrigin(0);
    const s = load();
    button(this, 80, 58, 'Back', () => this.scene.start('Menu'), { w: 120, h: 50, size: 18, color: N.panel, icon: 'back' });
    this.add.text(170, 36, 'Your record', textStyle(34));
    this.add.text(172, 80, 'Saved in this browser on this device.', textStyle(15, C.muted, 'normal'));

    const tiles: [string, string][] = [
      ['Heists played', num(s.stats.plays)],
      ['Heists won', num(s.stats.wins)],
      ['Loot grabbed', num(s.stats.lootGrabbed)],
      ['Blocks smashed', num(s.stats.blocksBroken)],
      ['TNT set off', num(s.stats.explosions)],
      ['Best combo', `×${s.stats.bestCombo}`],
      ['Day streak', `${s.streak.count}`],
      ['Longest streak', `${s.streak.best}`],
    ];
    tiles.forEach(([label, value], i) => {
      const x = 48 + 140 + (i % 4) * 300, y = 175 + Math.floor(i / 4) * 116;
      this.add.container(x, y, [
        card(this, 280, 100, 22),
        this.add.text(-116, -26, label, textStyle(14, C.muted, 'normal')),
        this.add.text(-116, 2, value, textStyle(30)),
      ]);
    });

    const w = VIEW_W - 96, top = 420;
    const table = this.add.container(VIEW_W / 2, top + 130, [card(this, w, 270, 22)]);
    const cols = [-w / 2 + 30, -w / 2 + 330, -w / 2 + 470, -w / 2 + 610, -w / 2 + 790, -w / 2 + 960];
    ['Level', 'Stars', 'Played', 'Won', 'Best', 'Last played'].forEach((h, i) => table.add(this.add.text(cols[i], -112, h, textStyle(13, C.muted))));
    LEVELS.forEach((l, r) => {
      const p = s.levels[l.id];
      const y = -78 + r * 32;
      const stars = p?.stars.filter(Boolean).length ?? 0;
      const last = p?.attempts[0]?.at;
      const vals = [l.name, '★'.repeat(stars) + '☆'.repeat(3 - stars), num(p?.plays ?? 0), num(p?.wins ?? 0), p?.best ? num(p.best) : '—', last ? new Date(last).toLocaleDateString() : '—'];
      vals.forEach((v, i) => table.add(this.add.text(cols[i], y, v, textStyle(15, i === 1 ? '#D9922E' : p ? C.ink : C.faint, i === 0 ? 'bold' : 'normal'))));
    });
  }
}
