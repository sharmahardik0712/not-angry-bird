import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../sim/constants';
import type { LevelResult } from '../sim/types';
import { lootKey } from '../render/textures';
import { C, N } from '../ui/theme';
import { button, card, FAIL_LINES, iconButton, num, textStyle } from '../ui/ui';
import type { LevelScene, PlayMode } from './LevelScene';

const SLOT = 34;

/**
 * Minimal screen-space overlay: menu + restart buttons, the score, and one icon per piece of loot
 * that fills in as it's grabbed. Everything else lives in the world, next to the action.
 */
export class HUDScene extends Phaser.Scene {
  private score!: Phaser.GameObjects.Text;
  private slots = new Map<number, Phaser.GameObjects.Image>();
  private slotBg!: Phaser.GameObjects.Graphics;
  private slotRow!: Phaser.GameObjects.Container;
  private goalTag!: Phaser.GameObjects.Text;
  private getawayBtn!: Phaser.GameObjects.Container;
  private intro?: Phaser.GameObjects.Container;
  private shownScore = 0;

  constructor() {
    super('HUD');
  }

  get level(): LevelScene {
    return this.scene.get('Level') as LevelScene;
  }

  create(data: { mode?: PlayMode }): void {
    const lvl = this.level.level;
    this.shownScore = 0;
    this.slots = new Map();

    iconButton(this, 44, 44, 'menu', () => this.level.toMenu(), 52);
    iconButton(this, VIEW_W - 44, 44, 'restart', () => this.level.restart(), 52);

    this.score = this.add.text(VIEW_W / 2, 30, '0', textStyle(30, C.ink, 'bold', true)).setOrigin(0.5);

    // One slot per loot piece, in the order they appear in the level.
    const loot = [...this.level.sim.entities.values()].filter((e) => e.kind === 'loot');
    const w = loot.length * (SLOT + 8) + 16;
    this.slotBg = this.add.graphics();
    this.slotRow = this.add.container(VIEW_W / 2, 74, [this.slotBg]);
    this.drawSlotBg(w, false);
    loot.forEach((e, i) => {
      const img = this.add.image(-w / 2 + 8 + SLOT / 2 + i * (SLOT + 8), 0, lootKey(e.kind === 'loot' ? e.type : 'coin')).setTintFill(N.faint).setAlpha(0.6);
      img.setScale(SLOT / Math.max(img.width, img.height));
      this.slots.set(e.id, img);
      this.slotRow.add(img);
    });
    this.goalTag = this.add.text(VIEW_W / 2, 104, 'Goal met', textStyle(14, '#3FAE73', 'bold', true)).setOrigin(0.5).setAlpha(0);

    this.getawayBtn = button(this, VIEW_W - 110, VIEW_H - 48, 'Getaway', () => this.level.getaway(), { w: 180, h: 52, size: 18, color: N.mint, icon: 'next' });
    this.getawayBtn.setVisible(false);

    if (data.mode && data.mode !== 'play') {
      const label = data.mode === 'watch' ? 'Replaying your best run' : 'Watching a solution';
      const tag = this.add.container(VIEW_W / 2, VIEW_H - 40, [card(this, 250, 38, 19, N.ink), this.add.text(0, 0, label, textStyle(14, '#ffffff')).setOrigin(0.5)]);
      this.tweens.add({ targets: tag, alpha: 0.6, yoyo: true, repeat: -1, duration: 900 });
    }

    this.showIntro(lvl.name, lvl.hint);
  }

  private drawSlotBg(w: number, met: boolean): void {
    this.slotBg.clear();
    this.slotBg.fillStyle(N.ink, 0.06).fillRoundedRect(-w / 2, -SLOT / 2 - 3, w, SLOT + 8 + 2, (SLOT + 8) / 2);
    this.slotBg.fillStyle(met ? 0xe4f6ec : N.panel, 0.9).fillRoundedRect(-w / 2, -SLOT / 2 - 4, w, SLOT + 8, (SLOT + 8) / 2);
  }

  /** Level name and one-line hint, briefly, under the loot row. */
  private showIntro(name: string, hint?: string): void {
    const parts: Phaser.GameObjects.GameObject[] = [this.add.text(0, 0, name, textStyle(26, C.ink, 'bold', true)).setOrigin(0.5)];
    if (hint) parts.push(this.add.text(0, 32, hint, textStyle(16, C.muted, 'normal', true)).setOrigin(0.5));
    const box = this.add.container(VIEW_W / 2, 150, parts).setAlpha(0);
    this.intro = box;
    this.tweens.add({ targets: box, alpha: 1, y: 140, duration: 250, ease: 'Sine.easeOut' });
    this.time.delayedCall(2600, () => this.hideIntro());
  }

  hideIntro(): void {
    if (!this.intro) return;
    const box = this.intro;
    this.intro = undefined;
    this.tweens.add({ targets: box, alpha: 0, duration: 250, onComplete: () => box.destroy() });
  }

  // ---------------------------------------------------------------- called by Level

  onLaunch(): void {
    this.hideIntro();
  }

  /** Fly a grabbed piece of loot from where it was (screen coords) into its slot. */
  collectLoot(id: number, texKey: string, from: { x: number; y: number }, size: number): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    const target = { x: this.slotRow.x + slot.x, y: this.slotRow.y + slot.y };
    const fly = this.add.image(from.x, from.y, texKey).setDepth(10);
    const startScale = size / Math.max(fly.width, fly.height);
    const endScale = slot.scale;
    const peak = Math.min(from.y, target.y) - 80;
    this.tweens.addCounter({
      from: 0, to: 1, duration: 520, ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        // Quadratic arc up and over into the slot.
        const y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * peak + k * k * target.y;
        fly.setPosition(Phaser.Math.Linear(from.x, target.x, k), y)
          .setScale(Phaser.Math.Linear(startScale * 1.3, endScale, k))
          .setRotation(Math.sin(k * Math.PI) * 0.6);
      },
      onComplete: () => {
        fly.destroy();
        slot.clearTint().setAlpha(1);
        this.tweens.add({ targets: slot, scale: endScale * 1.4, yoyo: true, duration: 120, ease: 'Sine.easeOut' });
      },
    });
  }

  goalMet(): void {
    this.drawSlotBg(this.slots.size * (SLOT + 8) + 16, true);
    this.goalTag.setAlpha(1).setScale(0.5);
    this.tweens.add({ targets: this.goalTag, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private banner(text: string, color: string): void {
    const t = this.add.text(VIEW_W / 2, VIEW_H / 2 - 60, text, textStyle(44, color, 'bold', true)).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: VIEW_H / 2 - 70, duration: 220, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 300, onComplete: () => t.destroy() });
  }

  onEnd(r: LevelResult): void {
    this.getawayBtn.setVisible(false);
    if (!r.win) {
      const close = r.lootValue >= r.required * 0.7;
      this.banner(close ? 'So close!' : Phaser.Utils.Array.GetRandom(FAIL_LINES), close ? C.coral : C.muted);
    }
  }

  update(): void {
    const sim = this.level.sim;
    if (!sim) return;
    const target = sim.liveScore;
    if (this.shownScore !== target) {
      this.shownScore += Math.max(1, Math.ceil((target - this.shownScore) * 0.18));
      if (this.shownScore > target) this.shownScore = target;
      this.score.setText(num(this.shownScore));
    }
    const showGetaway = sim.canGetaway && this.level.mode === 'play';
    if (showGetaway !== this.getawayBtn.visible) {
      this.getawayBtn.setVisible(showGetaway);
      if (showGetaway) { this.getawayBtn.setScale(0.5); this.tweens.add({ targets: this.getawayBtn, scale: 1, duration: 220, ease: 'Back.easeOut' }); }
    }
  }
}
