import Phaser from 'phaser';
import type { LootType, MaterialId, ThiefType } from '../sim/types';
import { THIEF_TYPES } from '../sim/types';
import { C, MATERIAL_COLORS, skinById } from '../ui/theme';

/**
 * Procedural canvas art in a clean minimal style: flat pastel shapes, soft shadows, no outlines.
 * Every material keeps a faint pattern as well as a color, so it reads for colorblind players.
 */

export type Expression = 'idle' | 'fly' | 'hit' | 'cheer';
export const EXPRESSIONS: Expression[] = ['idle', 'fly', 'hit', 'cheer'];

const TEX = 72;
type Ctx = CanvasRenderingContext2D;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h))!;
  draw(tex.getContext());
  tex.refresh();
}

let activeSkin = 'classic';
export const setActiveSkin = (id: string) => { activeSkin = id; };
export const thiefKey = (t: ThiefType, e: Expression, skin = activeSkin) => `thief-${skin}-${t}-${e}`;
export const blockKey = (m: MaterialId, w: number, h: number) => `block2-${m}-${w}x${h}`;
export const lootKey = (t: LootType) => `loot2-${t}`;

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

// ---------------------------------------------------------------- thieves

function drawThief(ctx: Ctx, t: ThiefType, e: Expression, color: string, mask: string) {
  const c = TEX / 2, r = 27, cy = c + 3;
  // Type cue, drawn first so it sits behind the head.
  ctx.lineCap = 'round';
  if (t === 'magnet') {
    ctx.strokeStyle = C.coral; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(c, 12, 7, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(c - 10, 11, 6, 4); ctx.fillRect(c + 4, 11, 6, 4);
  } else if (t === 'bomber') {
    ctx.strokeStyle = C.muted; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c + 6, 12); ctx.quadraticCurveTo(c + 13, 3, c + 19, 7); ctx.stroke();
    ctx.fillStyle = C.sun; ctx.beginPath(); ctx.arc(c + 20, 6, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(c, cy, r, 0, Math.PI * 2); ctx.fill();
  // Soft lower shade + top highlight instead of outlines.
  ctx.save();
  ctx.beginPath(); ctx.arc(c, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(61,53,83,0.10)'; ctx.beginPath(); ctx.arc(c + 6, cy + 10, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(c - 9, cy - 13, 9, 5, -0.5, 0, Math.PI * 2); ctx.fill();
  if (t === 'bouncer') { ctx.fillStyle = mask; ctx.globalAlpha = 0.85; ctx.fillRect(c - r, cy - r, r * 2, 12); ctx.globalAlpha = 1; }
  if (t === 'splitter') { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(c, cy - r); ctx.lineTo(c, cy - 9); ctx.moveTo(c, cy + 11); ctx.lineTo(c, cy + r); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
  if (t === 'bouncer') { ctx.fillStyle = C.sun; ctx.beginPath(); ctx.arc(c, cy - r - 1, 4.5, 0, Math.PI * 2); ctx.fill(); }

  // Mask.
  ctx.fillStyle = mask;
  rrect(ctx, c - r + 4, cy - 7, (r - 4) * 2, 13, 6.5); ctx.fill();
  // Eyes.
  for (const s of [-1, 1]) {
    const x = c + s * 10, y = cy - 1;
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2.6;
    if (e === 'hit') { ctx.beginPath(); ctx.moveTo(x - 3.5, y - 3.5); ctx.lineTo(x + 3.5, y + 3.5); ctx.moveTo(x + 3.5, y - 3.5); ctx.lineTo(x - 3.5, y + 3.5); ctx.stroke(); }
    else if (e === 'cheer') { ctx.beginPath(); ctx.arc(x, y + 2, 3.8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, y, e === 'fly' ? 4.6 : 3.8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = mask; ctx.beginPath(); ctx.arc(x + 1, y + 0.5, e === 'fly' ? 1.6 : 2, 0, Math.PI * 2); ctx.fill(); }
  }
  // Mouth.
  ctx.strokeStyle = mask; ctx.fillStyle = mask; ctx.lineWidth = 2.4;
  const my = cy + 14;
  ctx.beginPath();
  if (e === 'fly') { ctx.ellipse(c, my, 3.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (e === 'hit') { ctx.moveTo(c - 5, my + 1); ctx.quadraticCurveTo(c, my - 3, c + 5, my + 1); ctx.stroke(); }
  else if (e === 'cheer') { ctx.arc(c, my - 2, 6, 0.1 * Math.PI, 0.9 * Math.PI); ctx.closePath(); ctx.fill(); }
  else { ctx.arc(c, my - 3, 5, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke(); }
}

export function ensureThiefTextures(scene: Phaser.Scene, skinId: string): void {
  const skin = skinById(skinId);
  for (const t of THIEF_TYPES) for (const e of EXPRESSIONS) {
    canvas(scene, thiefKey(t, e, skin.id), TEX, TEX, (ctx) => drawThief(ctx, t, e, skin.colors[t], skin.mask));
  }
}

// ---------------------------------------------------------------- blocks

function drawBlock(ctx: Ctx, m: MaterialId, w: number, h: number) {
  const { base, accent } = MATERIAL_COLORS[m];
  const r = Math.min(5, w / 4, h / 4);
  ctx.save();
  rrect(ctx, 0, 0, w, h, r);
  ctx.clip();
  ctx.globalAlpha = m === 'glass' ? 0.6 : 1;
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  // Bottom shade and top light give volume without outlines.
  ctx.fillStyle = 'rgba(61,53,83,0.12)'; ctx.fillRect(0, h - Math.min(5, h * 0.25), w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, w, Math.min(3, h * 0.2));

  ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 1.5;
  switch (m) {
    case 'wood': {
      ctx.globalAlpha = 0.45;
      const along = w >= h, len = along ? w : h, across = along ? h : w;
      for (let i = across / 3; i < across - 2; i += across / 3) {
        ctx.beginPath();
        along ? (ctx.moveTo(4, i), ctx.lineTo(len - 4, i)) : (ctx.moveTo(i, 4), ctx.lineTo(i, len - 4));
        ctx.stroke();
      }
      break;
    }
    case 'stone': {
      ctx.globalAlpha = 0.5;
      const bh = 13, bw = 24;
      for (let y = bh, row = 1; y < h; y += bh, row++) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let y = 0, row = 0; y < h; y += bh, row++) for (let x = row % 2 ? bw / 2 : bw; x < w; x += bw) { ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, Math.min(h, y + bh) - 2); ctx.stroke(); }
      break;
    }
    case 'glass':
      ctx.globalAlpha = 0.8; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * 0.2, h); ctx.lineTo(w * 0.2 + h * 0.5, 0); ctx.stroke();
      break;
    case 'ice':
      ctx.globalAlpha = 0.7;
      for (let x = 8; x < w; x += 18) { ctx.beginPath(); ctx.moveTo(x, 3); ctx.lineTo(x + 4, h / 2); ctx.lineTo(x, h - 3); ctx.stroke(); }
      break;
    case 'rubber':
      ctx.globalAlpha = 0.6;
      for (let y = 7; y < h; y += 10) for (let x = 7; x < w; x += 10) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'tnt': {
      const fs = Math.min(h * 0.42, w * 0.3);
      ctx.fillStyle = '#ffffff'; rrect(ctx, w * 0.12, h / 2 - fs * 0.7, w * 0.76, fs * 1.4, 4); ctx.fill();
      ctx.fillStyle = C.ink; ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TNT', w / 2, h / 2 + 1);
      break;
    }
    case 'vault': {
      const rr = Math.min(w, h) * 0.28;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
      for (const x of [6, w - 6]) { ctx.beginPath(); ctx.arc(x, h / 2, 2, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'steel':
      ctx.globalAlpha = 0.5; ctx.lineWidth = 4;
      for (let x = -h; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); }
      break;
  }
  ctx.restore();
}

export function ensureBlockTexture(scene: Phaser.Scene, m: MaterialId, w: number, h: number): string {
  const key = blockKey(m, w, h);
  canvas(scene, key, w, h, (ctx) => drawBlock(ctx, m, w, h));
  return key;
}

// ---------------------------------------------------------------- loot and misc

function drawLoot(ctx: Ctx, t: LootType, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  if (t === 'coin') {
    ctx.fillStyle = '#F5B94A'; ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFD27A'; ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(cx - 6, cy - 7, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill();
  } else if (t === 'gem') {
    ctx.fillStyle = '#6FD6C0';
    ctx.beginPath(); ctx.moveTo(cx, 3); ctx.lineTo(w - 4, cy - 5); ctx.lineTo(cx, h - 3); ctx.lineTo(4, cy - 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#B8F0E3'; ctx.beginPath(); ctx.moveTo(cx, 3); ctx.lineTo(cx + 9, cy - 5); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 9, cy - 5); ctx.closePath(); ctx.fill();
  } else if (t === 'cash') {
    ctx.fillStyle = '#7FCFA0';
    ctx.beginPath(); ctx.moveTo(cx - 9, 11); ctx.quadraticCurveTo(3, h * 0.45, 5, h - 7); ctx.quadraticCurveTo(cx, h + 1, w - 5, h - 7); ctx.quadraticCurveTo(w - 3, h * 0.45, cx + 9, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5DB583'; rrect(ctx, cx - 11, 6, 22, 7, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(cx - 7, h * 0.55, 5, 8, -0.3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#FFC773';
    ctx.beginPath(); ctx.arc(cx, 13, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 10, 22); ctx.lineTo(cx + 10, 22); ctx.lineTo(cx + 13, h - 13); ctx.lineTo(cx - 13, h - 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F5A94A'; rrect(ctx, cx - 17, h - 14, 34, 11, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(cx - 6, 26, 3, h - 44);
  }
}

/** Generates every texture that doesn't depend on level data. */
export function generateStaticTextures(scene: Phaser.Scene, skinId: string): void {
  ensureThiefTextures(scene, skinId);
  setActiveSkin(skinById(skinId).id);
  const lootSizes: Record<LootType, [number, number]> = { coin: [46, 46], gem: [52, 52], cash: [64, 54], idol: [48, 78] };
  for (const [t, [w, h]] of Object.entries(lootSizes) as [LootType, [number, number]][]) canvas(scene, lootKey(t), w, h, (ctx) => drawLoot(ctx, t, w, h));

  canvas(scene, 'bomb', 40, 40, (ctx) => {
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(20, 22, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.muted; ctx.fillRect(16, 4, 8, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(14, 16, 4, 0, Math.PI * 2); ctx.fill();
  });
  canvas(scene, 'px', 8, 8, (ctx) => { ctx.fillStyle = '#fff'; rrect(ctx, 0, 0, 8, 8, 2); ctx.fill(); });
  canvas(scene, 'dot', 16, 16, (ctx) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, 8, 7, 0, Math.PI * 2); ctx.fill(); });
  canvas(scene, 'shard', 12, 12, (ctx) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(6, 0); ctx.lineTo(12, 9); ctx.closePath(); ctx.fill(); });
  canvas(scene, 'splinter', 14, 5, (ctx) => { ctx.fillStyle = '#fff'; rrect(ctx, 0, 0, 14, 5, 2.5); ctx.fill(); });
  canvas(scene, 'confetti', 10, 6, (ctx) => { ctx.fillStyle = '#fff'; rrect(ctx, 0, 0, 10, 6, 2); ctx.fill(); });
  canvas(scene, 'glow', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#ffffffff'); g.addColorStop(0.45, '#ffffff99'); g.addColorStop(1, '#ffffff00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });
  canvas(scene, 'shadow', 64, 16, (ctx) => {
    const g = ctx.createRadialGradient(32, 8, 0, 32, 8, 32);
    g.addColorStop(0, 'rgba(61,53,83,0.25)'); g.addColorStop(1, 'rgba(61,53,83,0)');
    ctx.fillStyle = g; ctx.scale(1, 0.25); ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
  });
  canvas(scene, 'star', 64, 64, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? 14 : 30, a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(32 + Math.cos(a) * rad, 34 + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fill();
  });
}

/** Soft pastel skyline sized to the level. Deterministic, so restarts look identical. */
export function generateBackdrop(scene: Phaser.Scene, key: string, w: number, top: number, groundY: number, bottom: number): void {
  const h = bottom - top;
  canvas(scene, key, w, h, (ctx) => {
    const gy = groundY - top;
    const sky = ctx.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, C.skyBottom); sky.addColorStop(1, C.skyTop);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    ctx.fillStyle = '#FFE3C2'; ctx.beginPath(); ctx.arc(w * 0.42, gy * 0.62, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < Math.ceil(w / 380); i++) {
      const cx = rnd() * w, cy = gy * (0.15 + rnd() * 0.35), s = 0.7 + rnd() * 0.6;
      rrect(ctx, cx - 60 * s, cy, 120 * s, 26 * s, 13 * s); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 10 * s, cy, 22 * s, 0, Math.PI * 2); ctx.arc(cx + 22 * s, cy + 4 * s, 15 * s, 0, Math.PI * 2); ctx.fill();
    }
    for (const [col, minH, maxH] of [[C.far, 110, 260], [C.near, 60, 170]] as const) {
      for (let x = -10; x < w; ) {
        const bw = 60 + rnd() * 80, bh = minH + rnd() * (maxH - minH);
        ctx.fillStyle = col; rrect(ctx, x, gy - bh, bw, bh + 4, 6); ctx.fill();
        x += bw + 6 + rnd() * 26;
      }
    }
    ctx.fillStyle = C.ground; ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = C.groundLine; ctx.fillRect(0, gy, w, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = 30; x < w; x += 110) rrect(ctx, x, gy + 22, 50, 5, 2.5), ctx.fill();
  });
}
