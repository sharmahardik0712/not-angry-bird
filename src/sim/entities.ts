import type { Body } from 'planck';
import type { Material } from './materials';
import type { LootType, MaterialId, ThiefType } from './types';

interface BaseEntity {
  id: number;
  body: Body;
  /** Id of the combo event that last set this body in motion (null = untouched). */
  cause: number | null;
  removed: boolean;
}

export interface BlockEntity extends BaseEntity {
  kind: 'block';
  material: MaterialId;
  mat: Material;
  health: number;
  maxHealth: number;
  /** Pixels, for rendering. */
  w: number;
  h: number;
  lastDamageCause: number | null;
  breaking: boolean;
}

export interface LootEntity extends BaseEntity {
  kind: 'loot';
  type: LootType;
  value: number;
  bonus: boolean;
}

export interface ThiefEntity extends BaseEntity {
  kind: 'thief';
  type: ThiefType;
  abilityUsed: boolean;
  /** Set on first solid contact; abilities only work before it. */
  landed: boolean;
  launchStep: number;
  slowSteps: number;
  magnetUntil: number;
  nearLootId: number | null;
  nearLootDist: number;
}

export interface BombEntity extends BaseEntity {
  kind: 'bomb';
  explodeAt: number;
}

export interface GroundEntity extends BaseEntity {
  kind: 'ground';
}

export type Entity = BlockEntity | LootEntity | ThiefEntity | BombEntity | GroundEntity;
