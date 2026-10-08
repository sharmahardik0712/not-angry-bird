import type { MaterialId } from './types';

export interface ExplosionSpec {
  radius: number; // m
  power: number; // impulse scale
  damage: number; // at the center, falls off linearly
}

export interface Material {
  density: number;
  friction: number;
  restitution: number;
  /** Infinity = unbreakable. */
  health: number;
  /** Impact "impulse" (reduced mass × approach speed) below this does nothing. */
  impactThreshold: number;
  /** Damage per unit of impulse above the threshold. */
  impactMult: number;
  /** Multiplier on explosion damage. */
  blastMult: number;
  points: number;
  explodes?: ExplosionSpec;
  defaultStatic?: boolean;
}

/** All per-material behavior lives here (render colors live in ui/theme). Scenes and the sim never branch on material names for tuning. */
export const MATERIALS: Record<MaterialId, Material> = {
  wood: {
    density: 0.5, friction: 0.7, restitution: 0.1, health: 45,
    impactThreshold: 1.5, impactMult: 6, blastMult: 1.2, points: 100,
  },
  stone: {
    density: 2.5, friction: 0.8, restitution: 0.05, health: 240,
    impactThreshold: 12, impactMult: 4, blastMult: 1, points: 250,
  },
  glass: {
    density: 1.0, friction: 0.3, restitution: 0.2, health: 18,
    impactThreshold: 0.6, impactMult: 10, blastMult: 2, points: 150,
  },
  ice: {
    density: 0.9, friction: 0.02, restitution: 0.1, health: 50,
    impactThreshold: 2, impactMult: 6, blastMult: 1.5, points: 120,
  },
  rubber: {
    density: 0.8, friction: 0.9, restitution: 0.9, health: Infinity,
    impactThreshold: Infinity, impactMult: 0, blastMult: 0, points: 0,
  },
  tnt: {
    density: 0.6, friction: 0.6, restitution: 0.1, health: 25,
    impactThreshold: 2.5, impactMult: 6, blastMult: 3, points: 300,
    explodes: { radius: 3.6, power: 22, damage: 240 },
  },
  vault: {
    density: 3.0, friction: 0.8, restitution: 0.0, health: 160,
    impactThreshold: 60, impactMult: 1, blastMult: 1, points: 500,
  },
  steel: {
    density: 4, friction: 0.7, restitution: 0.05, health: Infinity,
    impactThreshold: Infinity, impactMult: 0, blastMult: 0, points: 0, defaultStatic: true,
  },
};

export const BOMB_EXPLOSION: ExplosionSpec = { radius: 3.4, power: 20, damage: 260 };
export const BOMB_FUSE_STEPS = 72;

export const LOOT_SHAPES = {
  coin: { kind: 'circle', r: 0.35 },
  gem: { kind: 'circle', r: 0.4 },
  cash: { kind: 'box', hw: 0.5, hh: 0.42 },
  idol: { kind: 'box', hw: 0.38, hh: 0.6 },
} as const;
