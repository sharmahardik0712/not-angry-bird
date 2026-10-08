import Phaser from 'phaser';
import type { MaterialId } from '../sim/types';
import { C, MATERIAL_COLORS, N, hex, FONT } from '../ui/theme';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

const mc = (m: MaterialId) => hex(MATERIAL_COLORS[m].base);
const ma = (m: MaterialId) => hex(MATERIAL_COLORS[m].accent);

const MATERIAL_PARTICLES: Partial<Record<MaterialId, { tex: string; tint: number[]; gravity: number; speed: [number, number]; scale: [number, number] }>> = {
  wood: { tex: 'splinter', tint: [mc('wood'), ma('wood'), 0xf6d7b3], gravity: 900, speed: [140, 420], scale: [1, 0.3] },
  stone: { tex: 'px', tint: [mc('stone'), ma('stone'), 0xdddbe8], gravity: 1200, speed: [90, 330], scale: [1.4, 0.4] },
  glass: { tex: 'shard', tint: [mc('glass'), 0xffffff, 0x9fd8ee], gravity: 1000, speed: [160, 480], scale: [1, 0.2] },
  ice: { tex: 'shard', tint: [mc('ice'), 0xffffff], gravity: 900, speed: [120, 380], scale: [0.9, 0.2] },
  tnt: { tex: 'px', tint: [mc('tnt'), 0xffffff, N.sun], gravity: 700, speed: [220, 520], scale: [1.3, 0.2] },
  vault: { tex: 'px', tint: [mc('vault'), ma('vault'), 0xb9b6cc], gravity: 1100, speed: [100, 360], scale: [1.5, 0.4] },
};

/**
 * Game-feel layer: particles, popups, shake, hit stop and slow motion.
 * Time effects are exposed as `timeScale(now)` so the scene can feed scaled time into the fixed-step sim
 * without ever changing the step size (keeps the simulation deterministic).
 */
export class Effects {
  private emitters = new Map<string, Emitter>();
  private hitStopUntil = 0;
  private slowUntil = 0;
  private slowScale = 1;
  shakeEnabled = true;
  private debris: { img: Phaser.GameObjects.Image; life: number; ttl: number; vx: number; vy: number; vr: number }[] = [];
  private kickUntil = 0;
  private kickAmount = 0;

  constructor(private scene: Phaser.Scene) {
    for (const [m, p] of Object.entries(MATERIAL_PARTICLES)) {
      this.emitters.set(m, scene.add.particles(0, 0, p.tex, {
        emitting: false, lifespan: { min: 500, max: 1100 }, speed: { min: p.speed[0], max: p.speed[1] },
        angle: { min: 200, max: 340 }, gravityY: p.gravity, rotate: { min: 0, max: 360 },
        scale: { start: p.scale[0], end: p.scale[1] }, alpha: { start: 1, end: 0.2 }, tint: p.tint,
      }).setDepth(30));
    }
    this.emitters.set('coin', scene.add.particles(0, 0, 'dot', {
      emitting: false, lifespan: 700, speed: { min: 120, max: 320 }, angle: { min: 210, max: 330 }, gravityY: 700,
      scale: { start: 0.55, end: 0.1 }, tint: [0xffd27a, 0xffffff, 0xf5b94a],
    }).setDepth(31));
    this.emitters.set('fire', scene.add.particles(0, 0, 'glow', {
      emitting: false, lifespan: { min: 300, max: 650 }, speed: { min: 60, max: 420 }, angle: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0.1 }, alpha: { start: 1, end: 0 }, tint: [0xffc773, 0xff8a80, 0xffe3c2, 0xffffff],
    }).setDepth(32));
    this.emitters.set('smoke', scene.add.particles(0, 0, 'glow', {
      emitting: false, lifespan: { min: 700, max: 1300 }, speed: { min: 20, max: 140 }, angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 2.2 }, alpha: { start: 0.45, end: 0 }, tint: [0xd8cfe8, 0xbdb5d4], gravityY: -60,
    }).setDepth(29));
    this.emitters.set('confetti', scene.add.particles(0, 0, 'confetti', {
      emitting: false, lifespan: { min: 1400, max: 2200 }, speed: { min: 250, max: 650 }, angle: { min: 235, max: 305 },
      gravityY: 520, rotate: { min: 0, max: 360 }, scale: { start: 1.2, end: 0.8 }, alpha: { start: 1, end: 0 },
      tint: [N.coral, N.sky, N.mint, N.sun, N.lilac],
    }).setDepth(45));
    this.emitters.set('dust', scene.add.particles(0, 0, 'dot', {
      emitting: false, lifespan: { min: 350, max: 600 }, speed: { min: 40, max: 160 }, angle: { min: 190, max: 350 },
      gravityY: 200, scale: { start: 0.8, end: 0.1 }, alpha: { start: 0.6, end: 0 }, tint: [N.ground, 0xffffff, N.groundLine],
    }).setDepth(19));
    this.emitters.set('poof', scene.add.particles(0, 0, 'dot', {
      emitting: false, lifespan: 450, speed: { min: 40, max: 140 }, angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: [0xffffff, 0xe4dcf1],
    }).setDepth(31));
    this.emitters.set('sparkle', scene.add.particles(0, 0, 'star', {
      emitting: false, lifespan: 600, speed: { min: 40, max: 160 }, angle: { min: 0, max: 360 },
      scale: { start: 0.35, end: 0 }, rotate: { min: 0, max: 360 }, tint: [0xffe3a0, 0xffffff],
    }).setDepth(33));
  }

  /**
   * Break a block into tumbling chunks cut from its own texture, so it visibly cracks apart
   * instead of vanishing. Pieces carry the block's velocity, fly apart, spin and fade.
   */
  crumble(texKey: string, x: number, y: number, angle: number, vx: number, vy: number, w: number, h: number): void {
    const tex = this.scene.textures.get(texKey);
    const cols = w >= h ? Math.min(4, Math.max(2, Math.round(w / h))) : 1;
    const rows = h > w ? Math.min(4, Math.max(2, Math.round(h / w))) : w >= h && h >= 40 ? 2 : 1;
    const pw = w / cols, ph = h / rows;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const name = `p${cols}x${rows}-${c}-${r}`;
        if (!tex.has(name)) tex.add(name, 0, c * pw, r * ph, pw, ph);
        // Piece center in block-local space, rotated into the world.
        const lx = (c + 0.5) * pw - w / 2, ly = (r + 0.5) * ph - h / 2;
        const px = x + lx * cos - ly * sin, py = y + lx * sin + ly * cos;
        const img = this.scene.add.image(px, py, texKey, name).setRotation(angle).setDepth(11);
        const out = Math.hypot(lx, ly) || 1;
        const spread = 140 + Math.random() * 120;
        this.debris.push({
          img, life: 0, ttl: 0.7 + Math.random() * 0.4,
          vx: vx + (lx / out) * spread + (Math.random() - 0.5) * 60,
          vy: vy + (ly / out) * spread - 160 - Math.random() * 120,
          vr: (Math.random() - 0.5) * 9,
        });
      }
    }
  }

  /** Advance debris; call once per frame with the (time-scaled) frame delta in seconds. */
  updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      d.vy += 1500 * dt;
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      d.img.rotation += d.vr * dt;
      const f = d.life / d.ttl;
      d.img.setAlpha(f < 0.55 ? 1 : 1 - (f - 0.55) / 0.45);
      d.img.setScale(1 - f * 0.25);
      if (f >= 1) { d.img.destroy(); this.debris.splice(i, 1); }
    }
  }

  /** Puff of street dust, e.g. when a thief lands. */
  dust(x: number, y: number, n = 8): void {
    this.emitters.get('dust')!.explode(n, x, y);
  }

  /** Soft trail that follows a flying thief. Returns the emitter so the caller can stop/destroy it. */
  trail(target: Phaser.GameObjects.Image, color: number): Emitter {
    const e = this.scene.add.particles(0, 0, 'dot', {
      lifespan: 280, frequency: 22, quantity: 1, scale: { start: 0.9, end: 0 }, alpha: { start: 0.45, end: 0 }, tint: color,
    }).setDepth(19);
    e.startFollow(target);
    return e;
  }

  /** Small pill that floats up from a chain reaction: "×2.5". */
  badge(x: number, y: number, text: string, color: number): void {
    const t = this.scene.add.text(0, 0, text, { fontFamily: FONT, fontStyle: 'bold', fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
    const bg = this.scene.add.graphics();
    bg.fillStyle(color, 1).fillRoundedRect(-t.width / 2 - 12, -17, t.width + 24, 34, 17);
    const c = this.scene.add.container(x, y, [bg, t]).setDepth(41).setScale(0.3);
    this.scene.tweens.add({ targets: c, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: c, y: y - 56, alpha: 0, delay: 500, duration: 500, ease: 'Sine.easeIn', onComplete: () => c.destroy() });
  }

  confetti(x: number, y: number, n = 60): void {
    this.emitters.get('confetti')!.explode(n, x, y);
  }

  /** Expanding ring at a strong impact: readable, and fits the flat style. */
  ring(x: number, y: number, r: number, color: number = 0xffffff): void {
    const ring = this.scene.add.circle(x, y, r, 0, 0).setStrokeStyle(4, color, 0.9).setDepth(34).setScale(0.3);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** Quick zoom "kick" toward the action. */
  kick(amount = 0.04): void {
    if (!this.shakeEnabled) return;
    this.kickUntil = this.scene.time.now + 160;
    this.kickAmount = amount;
  }

  kickZoom(now: number): number {
    if (now >= this.kickUntil) return 0;
    return this.kickAmount * ((this.kickUntil - now) / 160);
  }

  burst(material: MaterialId, x: number, y: number, n = 14): void {
    this.emitters.get(material)?.explode(n, x, y);
  }

  coins(x: number, y: number, n = 12): void {
    this.emitters.get('coin')!.explode(n, x, y);
    this.emitters.get('sparkle')!.explode(Math.ceil(n / 2), x, y);
  }

  poof(x: number, y: number): void {
    this.emitters.get('poof')!.explode(10, x, y);
  }

  explosion(x: number, y: number, radiusPx: number): void {
    this.emitters.get('fire')!.explode(36, x, y);
    this.emitters.get('smoke')!.explode(14, x, y);
    const flash = this.scene.add.image(x, y, 'glow').setDepth(34).setTint(0xffffff);
    flash.setDisplaySize(radiusPx * 0.5, radiusPx * 0.5);
    this.scene.tweens.add({ targets: flash, displayWidth: radiusPx * 2.6, displayHeight: radiusPx * 2.6, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    const ring = this.scene.add.circle(x, y, radiusPx, 0, 0).setStrokeStyle(6, 0xffffff, 0.8).setDepth(34).setScale(0.2);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  popup(x: number, y: number, text: string, color: string = C.ink, size = 22): void {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: FONT, fontStyle: 'bold', fontSize: `${size}px`, color, stroke: '#ffffff', strokeThickness: Math.max(4, size / 6),
    }).setOrigin(0.5).setDepth(40).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 450, duration: 550, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
  }

  shake(strength: number): void {
    if (!this.shakeEnabled) return;
    const s = Math.min(1, strength);
    this.scene.cameras.main.shake(120 + s * 220, 0.002 + s * 0.012, true);
  }

  hitStop(now: number, ms: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, now + ms);
  }

  slowMo(now: number, ms: number, scale: number): void {
    this.slowUntil = now + ms;
    this.slowScale = scale;
  }

  isSlow(now: number): boolean {
    return now < this.slowUntil;
  }

  timeScale(now: number): number {
    if (now < this.hitStopUntil) return 0;
    if (now < this.slowUntil) {
      // Ease back to full speed over the last 30% of the slow-mo.
      const left = (this.slowUntil - now) / 600;
      return Phaser.Math.Linear(1, this.slowScale, Math.min(1, left));
    }
    return 1;
  }
}
