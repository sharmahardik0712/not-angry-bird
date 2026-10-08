import Phaser from 'phaser';
import { sfx } from '../systems/Audio';
import type { StyleGoal, ThiefType } from '../sim/types';
import { C, FONT, N } from './theme';

export { FONT };

/** Plain text (no outline). Pass `halo` for text that sits over the busy game world. */
export const textStyle = (size: number, color: string = C.ink, weight: 'bold' | 'normal' = 'bold', halo = false): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: weight,
  ...(halo ? { stroke: '#ffffff', strokeThickness: Math.max(3, Math.round(size / 7)) } : {}),
});

/** White rounded card with a soft shadow. Drawn centered on (0, 0) of the returned graphics. */
export function card(scene: Phaser.Scene, w: number, h: number, radius = 22, fill: number = N.panel, alpha = 1): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(N.ink, 0.06).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, radius);
  g.fillStyle(N.ink, 0.05).fillRoundedRect(-w / 2 - 2, -h / 2 + 3, w + 4, h + 2, radius + 2);
  g.fillStyle(fill, alpha).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  return g;
}

export interface ButtonOpts {
  w?: number;
  h?: number;
  color?: number;
  textColor?: string;
  size?: number;
  icon?: IconName;
  radius?: number;
}

/** Flat pill button with a soft shadow and a gentle press. */
export function button(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, opts: ButtonOpts = {}): Phaser.GameObjects.Container {
  const w = opts.w ?? 200, h = opts.h ?? 60, color = opts.color ?? N.coral, radius = opts.radius ?? h / 2;
  const light = color === N.panel;
  const g = scene.add.graphics();
  const draw = (pressed: boolean) => {
    g.clear();
    if (!pressed) g.fillStyle(N.ink, 0.1).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, radius);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2 + (pressed ? 3 : 0), w, h, radius);
  };
  draw(false);
  const parts: Phaser.GameObjects.GameObject[] = [g];
  const textColor = opts.textColor ?? (light ? C.ink : '#ffffff');
  const t = scene.add.text(0, 0, label, textStyle(opts.size ?? 22, textColor)).setOrigin(0.5);
  let iconG: Phaser.GameObjects.Graphics | undefined;
  if (opts.icon) {
    // Center icon + label as one group so long labels never collide with the icon.
    const is = h * 0.42, gap = label ? 10 : 0;
    const total = is + gap + (label ? t.width : 0);
    iconG = scene.add.graphics();
    drawIcon(iconG, opts.icon, -total / 2 + is / 2, 0, is, Phaser.Display.Color.HexStringToColor(textColor).color);
    if (label) t.setX(-total / 2 + is + gap + t.width / 2);
    parts.push(iconG);
  }
  parts.push(t);
  const c = scene.add.container(x, y, parts).setSize(w, h).setInteractive({ useHandCursor: true });
  const setPressed = (p: boolean) => { draw(p); t.y = p ? 3 : 0; if (iconG) iconG.y = p ? 3 : 0; };
  c.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.04, duration: 100 }));
  c.on('pointerout', () => { setPressed(false); scene.tweens.add({ targets: c, scale: 1, duration: 100 }); });
  c.on('pointerdown', () => { sfx.unlock(); setPressed(true); });
  c.on('pointerup', () => { setPressed(false); sfx.click(); onClick(); });
  return c;
}

export const iconButton = (scene: Phaser.Scene, x: number, y: number, icon: IconName, onClick: () => void, size = 56) =>
  button(scene, x, y, '', onClick, { w: size, h: size, icon, color: N.panel, textColor: C.ink });

export type IconName = 'restart' | 'menu' | 'sound' | 'mute' | 'play' | 'eye' | 'back' | 'crew' | 'stats' | 'next' | 'lock' | 'shake';

/** Simple line icons drawn with Graphics, so they look the same on every platform (no emoji fonts). */
export function drawIcon(g: Phaser.GameObjects.Graphics, name: IconName, x: number, y: number, s: number, color: number): void {
  const r = s / 2;
  g.lineStyle(Math.max(2.5, s * 0.12), color, 1);
  g.fillStyle(color, 1);
  switch (name) {
    case 'restart': {
      g.beginPath(); g.arc(x, y, r * 0.8, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(250)); g.strokePath();
      const ax = x + Math.cos(Phaser.Math.DegToRad(-60)) * r * 0.8, ay = y + Math.sin(Phaser.Math.DegToRad(-60)) * r * 0.8;
      g.fillTriangle(ax - r * 0.45, ay - r * 0.15, ax + r * 0.2, ay - r * 0.45, ax + r * 0.15, ay + r * 0.3);
      break;
    }
    case 'menu':
      for (const dy of [-0.55, 0, 0.55]) g.lineBetween(x - r * 0.8, y + dy * r, x + r * 0.8, y + dy * r);
      break;
    case 'sound': case 'mute':
      g.fillRect(x - r * 0.85, y - r * 0.3, r * 0.45, r * 0.6);
      g.fillTriangle(x - r * 0.5, y - r * 0.3, x + r * 0.05, y - r * 0.8, x + r * 0.05, y + r * 0.8);
      g.fillTriangle(x - r * 0.5, y - r * 0.3, x + r * 0.05, y + r * 0.8, x - r * 0.5, y + r * 0.3);
      if (name === 'sound') { g.beginPath(); g.arc(x + r * 0.15, y, r * 0.55, -0.9, 0.9); g.strokePath(); }
      else { g.lineBetween(x + r * 0.3, y - r * 0.35, x + r * 0.9, y + r * 0.35); g.lineBetween(x + r * 0.9, y - r * 0.35, x + r * 0.3, y + r * 0.35); }
      break;
    case 'play': case 'next':
      g.fillTriangle(x - r * 0.45, y - r * 0.7, x - r * 0.45, y + r * 0.7, x + r * 0.7, y);
      break;
    case 'back':
      g.lineBetween(x + r * 0.3, y - r * 0.7, x - r * 0.4, y); g.lineBetween(x - r * 0.4, y, x + r * 0.3, y + r * 0.7);
      break;
    case 'eye':
      g.strokeEllipse(x, y, s * 0.95, s * 0.55); g.fillCircle(x, y, r * 0.25);
      break;
    case 'crew':
      g.fillCircle(x - r * 0.35, y - r * 0.2, r * 0.38); g.fillCircle(x + r * 0.4, y - r * 0.1, r * 0.3);
      g.fillRoundedRect(x - r * 0.9, y + r * 0.25, r * 1.1, r * 0.6, r * 0.3); g.fillRoundedRect(x + r * 0.1, y + r * 0.3, r * 0.75, r * 0.5, r * 0.25);
      break;
    case 'stats':
      g.fillRect(x - r * 0.8, y + r * 0.1, r * 0.4, r * 0.7); g.fillRect(x - r * 0.2, y - r * 0.4, r * 0.4, r * 1.2); g.fillRect(x + r * 0.4, y - r * 0.8, r * 0.4, r * 1.6);
      break;
    case 'lock':
      g.beginPath(); g.arc(x, y - r * 0.15, r * 0.42, Math.PI, 0); g.strokePath();
      g.fillRoundedRect(x - r * 0.65, y - r * 0.15, r * 1.3, r * 0.95, r * 0.2);
      break;
    case 'shake':
      g.strokeRoundedRect(x - r * 0.4, y - r * 0.75, r * 0.8, r * 1.5, r * 0.15);
      g.lineBetween(x - r * 0.75, y - r * 0.3, x - r * 0.75, y + r * 0.3); g.lineBetween(x + r * 0.75, y - r * 0.3, x + r * 0.75, y + r * 0.3);
      break;
  }
}

/** Thin rounded progress bar. */
export function progressBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, f: number, color: number): void {
  g.fillStyle(N.ink, 0.08).fillRoundedRect(x, y, w, h, h / 2);
  if (f > 0) g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(h, w * Math.min(1, f)), h, h / 2);
}

export function describeStyle(s: StyleGoal): string {
  switch (s.type) {
    case 'max_thieves': return `Use ${s.value === 1 ? 'only 1 thief' : `${s.value} thieves or fewer`}`;
    case 'combo': return `Hit a x${s.value} combo`;
    case 'no_break': return `Don't break any ${s.material}`;
    case 'bonus_loot': return 'Grab the bonus loot';
  }
}

export const THIEF_INFO: Record<ThiefType, { name: string; tap: string }> = {
  bouncer: { name: 'Bouncer', tap: 'Tap to redirect toward your finger' },
  bomber: { name: 'Bomber', tap: 'Tap to drop a bomb' },
  magnet: { name: 'Magnet', tap: 'Tap to hover and pull loot' },
  splitter: { name: 'Splitter', tap: 'Tap to split into three' },
};

export const BANTER: Record<ThiefType, string[]> = {
  bouncer: ['Boing!', 'Easy money!', 'Wheee!', 'Coming through!'],
  bomber: ['Fire in the hole!', 'Mind the fuse!', 'Ka-boom time!'],
  magnet: ["It's attractive!", 'Mine, mine, mine!', 'Come to papa!'],
  splitter: ['See you times three!', 'Divide and conquer!', 'Split the take!'],
};

export const FAIL_LINES = ['Eh, insurance covers it.', 'We were never here.', 'Next time, boss.', 'Plan B?'];
export const COMBO_WORDS = ['', 'Nice', 'Sweet', 'Chain!', 'Heist-tastic!', 'Mastermind!', 'Legendary!'];

export const num = (n: number) => Math.round(n).toLocaleString('en-US');

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
