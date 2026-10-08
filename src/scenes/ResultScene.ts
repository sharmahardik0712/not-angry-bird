import Phaser from 'phaser';
import { levelById, levelIndex, LEVELS } from '../levels';
import { VIEW_H, VIEW_W } from '../sim/constants';
import type { LevelResult } from '../sim/types';
import { sfx } from '../systems/Audio';
import { load, type RunRewards } from '../systems/Save';
import { C, N, SKINS } from '../ui/theme';
import { button, card, describeStyle, iconButton, num, textStyle } from '../ui/ui';
import type { LevelScene, PlayMode } from './LevelScene';

interface ResultData {
  levelId: string;
  result: LevelResult;
  rewards: RunRewards | null;
  mode: PlayMode;
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: ResultData): void {
    const { result: r, levelId, rewards, mode } = data;
    const level = levelById(levelId)!;
    const levelScene = this.scene.get('Level') as LevelScene;
    const best = load().levels[levelId]?.best ?? 0;
    const cx = VIEW_W / 2, cy = VIEW_H / 2;

    const dim = this.add.rectangle(cx, cy, VIEW_W, VIEW_H, N.ink, 0).setInteractive();
    this.tweens.add({ targets: dim, fillAlpha: 0.3, duration: 250 });

    const PW = 520, PH = 430;
    const panel = this.add.container(cx, cy + 24).setAlpha(0);
    panel.add(card(this, PW, PH, 32));
    this.tweens.add({ targets: panel, alpha: 1, y: cy, duration: 280, ease: 'Cubic.easeOut' });

    const title = mode !== 'play' ? 'Replay finished' : r.win ? 'Nice heist!' : 'Not this time';
    panel.add(this.add.text(0, -PH / 2 + 50, title, textStyle(34, r.win ? C.ink : C.coral)).setOrigin(0.5));
    if (mode === 'play') (r.win ? sfx.win() : sfx.lose());

    // Stars pop in one by one; each says what it was for.
    const labels = ['Grab the loot', `Score ${num(level.stars.score)}`, describeStyle(level.stars.style)];
    labels.forEach((label, i) => {
      const x = (i - 1) * 150, y = -PH / 2 + 128;
      const size = i === 1 ? 1.25 : 1.05;
      panel.add(this.add.image(x, i === 1 ? y - 10 : y, 'star').setTint(0xeee9f5).setScale(size));
      const full = this.add.image(x, i === 1 ? y - 10 : y, 'star').setTint(N.sun).setScale(0);
      panel.add(full);
      panel.add(this.add.text(x, y + 40, label, { ...textStyle(13, r.stars[i] ? C.ink : C.faint, 'normal'), align: 'center', wordWrap: { width: 140 } }).setOrigin(0.5, 0));
      if (r.stars[i]) this.time.delayedCall(350 + i * 260, () => { sfx.star(i); this.tweens.add({ targets: full, scale: size, duration: 360, ease: 'Back.easeOut' }); });
    });

    const scoreY = 40;
    const scoreText = this.add.text(0, scoreY, '0', textStyle(52)).setOrigin(0.5);
    panel.add(scoreText);
    this.tweens.addCounter({ from: 0, to: r.score, duration: 800, delay: 250, ease: 'Cubic.easeOut', onUpdate: (tw) => scoreText.setText(num(tw.getValue() ?? 0)) });
    const sub = rewards?.newBest && rewards.prevBest > 0 ? 'New best!' : mode === 'play' && best ? `Best ${num(best)}` : '';
    if (sub) panel.add(this.add.text(0, scoreY + 40, sub, textStyle(15, sub === 'New best!' ? '#3FAE73' : C.muted)).setOrigin(0.5));

    // One quiet line of news: a finished daily challenge or a newly unlocked crew look.
    const unlocked = rewards && rewards.newStars > 0 ? SKINS.find((s) => s.stars > rewards.totalStars - rewards.newStars && s.stars <= rewards.totalStars) : undefined;
    const news = unlocked ? `New crew look unlocked: ${unlocked.name}` : rewards?.goalsDone.length ? `Challenge done: ${rewards.goalsDone[0].text}` : '';
    if (news) panel.add(this.add.text(0, scoreY + 72, news, textStyle(14, C.coral)).setOrigin(0.5));

    const next = LEVELS[levelIndex(levelId) + 1];
    const btnY = PH / 2 - 54;
    const hasBest = !!load().levels[levelId]?.bestInputs?.length;
    panel.add(iconButton(this, -PW / 2 + 60, btnY, 'menu', () => levelScene.toMenu(), 56));
    if (hasBest) panel.add(iconButton(this, -PW / 2 + 128, btnY, 'eye', () => levelScene.restart('watch'), 56));
    if (r.win && next) {
      panel.add(button(this, 25, btnY, 'Retry', () => levelScene.restart(), { w: 130, h: 56, size: 18, color: N.panel, icon: 'restart' }));
      panel.add(button(this, PW / 2 - 85, btnY, 'Next', () => levelScene.nextLevel(), { w: 130, h: 56, size: 18, icon: 'next' }));
    } else {
      panel.add(button(this, PW / 2 - 110, btnY, 'Try again', () => levelScene.restart(), { w: 180, h: 56, size: 18, icon: 'restart' }));
    }

    const kb = this.input.keyboard;
    kb?.on('keydown-R', () => levelScene.restart());
    kb?.on('keydown-ENTER', () => (r.win && next ? levelScene.nextLevel() : levelScene.restart()));
  }
}
