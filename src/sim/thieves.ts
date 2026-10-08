import type { ThiefEntity } from './entities';
import type { Simulation } from './Simulation';
import type { Entity } from './entities';
import type { ThiefType } from './types';

/** Shared ability interface. A new thief is a new entry here and nothing else. */
export interface ThiefAbility {
  density: number;
  restitution: number;
  onLaunch?(sim: Simulation, t: ThiefEntity): void;
  /** Return false if the tap was not consumed. */
  onTap(sim: Simulation, t: ThiefEntity, x: number, y: number): boolean;
  update?(sim: Simulation, t: ThiefEntity): void;
  onCollide?(sim: Simulation, t: ThiefEntity, other: Entity, impulse: number): void;
}

const MAGNET_STEPS = 120;
const MAGNET_RADIUS = 6.5;
const MAGNET_MAX_MASS = 2.5;

const bouncer: ThiefAbility = {
  density: 3,
  restitution: 0.45,
  onTap(sim, t, x, y) {
    const p = t.body.getPosition();
    const v = t.body.getLinearVelocity();
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return false;
    const speed = Math.max(Math.hypot(v.x, v.y) * 1.05, 16);
    t.body.setLinearVelocity({ x: (dx / d) * speed, y: (dy / d) * speed });
    sim.emit({ type: 'ability', id: t.id, thief: t.type, x: p.x, y: p.y, tx: x, ty: y });
    return true;
  },
};

const bomber: ThiefAbility = {
  density: 3,
  restitution: 0.2,
  onTap(sim, t) {
    const p = t.body.getPosition();
    const v = t.body.getLinearVelocity();
    sim.spawnBomb(p.x, p.y + 0.55, v.x * 0.25, Math.max(v.y * 0.25, 1), t.cause);
    // Recoil hop, so the drop reads clearly and the bomber clears the blast.
    t.body.setLinearVelocity({ x: v.x * 0.9, y: Math.min(v.y, 0) - 5 });
    sim.emit({ type: 'ability', id: t.id, thief: t.type, x: p.x, y: p.y, tx: p.x, ty: p.y + 0.55 });
    return true;
  },
};

const magnet: ThiefAbility = {
  density: 3,
  restitution: 0.25,
  onTap(sim, t) {
    t.magnetUntil = sim.step + MAGNET_STEPS;
    t.body.setGravityScale(0);
    t.body.setLinearDamping(4);
    const p = t.body.getPosition();
    sim.emit({ type: 'ability', id: t.id, thief: t.type, x: p.x, y: p.y, tx: p.x, ty: p.y });
    return true;
  },
  update(sim, t) {
    if (t.magnetUntil === 0) return;
    if (sim.step >= t.magnetUntil) {
      t.magnetUntil = 0;
      t.body.setGravityScale(1);
      t.body.setLinearDamping(0);
      return;
    }
    const p = t.body.getPosition();
    for (const e of sim.entities.values()) {
      if (e.removed || (e.kind !== 'loot' && e.kind !== 'block')) continue;
      if (!e.body.isDynamic() || e.body.getMass() > MAGNET_MAX_MASS) continue;
      const q = e.body.getPosition();
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const d = Math.hypot(dx, dy);
      if (d > MAGNET_RADIUS || d < 0.05) continue;
      const accel = Math.min(70, 140 / Math.max(d, 1));
      const m = e.body.getMass();
      // Cancel gravity on pulled bodies so the pull reads as a pull.
      e.body.applyForceToCenter({ x: (dx / d) * accel * m, y: (dy / d) * accel * m - sim.gravity * m }, true);
      e.cause = t.cause;
    }
  },
};

const SPLIT_ANGLE = 0.2;

const splitter: ThiefAbility = {
  density: 2.5,
  restitution: 0.3,
  onTap(sim, t) {
    const p = t.body.getPosition();
    const v = t.body.getLinearVelocity();
    const speed = Math.max(Math.hypot(v.x, v.y), 8);
    const a = Math.atan2(v.y, v.x);
    for (const da of [-SPLIT_ANGLE, SPLIT_ANGLE]) {
      const na = a + da;
      const off = Math.sign(da) * 0.6;
      sim.spawnThief('splitter', p.x - Math.sin(a) * off, p.y + Math.cos(a) * off,
        Math.cos(na) * speed, Math.sin(na) * speed, t.cause, true);
    }
    t.body.setLinearVelocity({ x: Math.cos(a) * speed, y: Math.sin(a) * speed });
    sim.emit({ type: 'ability', id: t.id, thief: t.type, x: p.x, y: p.y, tx: p.x, ty: p.y });
    return true;
  },
};

export const ABILITIES: Record<ThiefType, ThiefAbility> = { bouncer, bomber, magnet, splitter };
