export type ThiefType = 'bouncer' | 'bomber' | 'magnet' | 'splitter';
export type MaterialId = 'wood' | 'stone' | 'glass' | 'ice' | 'rubber' | 'tnt' | 'vault' | 'steel';
export type LootType = 'coin' | 'gem' | 'cash' | 'idol';

export const THIEF_TYPES: readonly ThiefType[] = ['bouncer', 'bomber', 'magnet', 'splitter'];
export const LOOT_TYPES: readonly LootType[] = ['coin', 'gem', 'cash', 'idol'];

/** Player inputs, recorded with the step they were applied on. A level + inputs fully determines the outcome. */
export type Input =
  /** ox/oy: where the thief was released, as an offset from the slingshot (m). Omitted = rest point. */
  | { step: number; type: 'launch'; vx: number; vy: number; ox?: number; oy?: number }
  | { step: number; type: 'tap'; x: number; y: number }
  | { step: number; type: 'getaway' };

/** Input without a step, as issued by live play (the sim stamps the current step). */
export type InputCommand =
  | { type: 'launch'; vx: number; vy: number; ox?: number; oy?: number }
  | { type: 'tap'; x: number; y: number }
  | { type: 'getaway' };

export type StyleGoal =
  | { type: 'max_thieves'; value: number }
  | { type: 'combo'; value: number }
  | { type: 'no_break'; material: MaterialId }
  | { type: 'bonus_loot' };

export interface BlockDef {
  type: MaterialId;
  /** Center, in pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees. */
  angle?: number;
  static?: boolean;
}

export interface LootDef {
  type: LootType;
  x: number;
  y: number;
  value: number;
  bonus?: boolean;
}

export interface LevelData {
  id: string;
  name: string;
  world: number;
  width?: number;
  groundY?: number;
  gravity: number;
  slingshot: { x: number; y: number };
  thieves: ThiefType[];
  goal: { type: 'loot'; required: number };
  stars: { score: number; style: StyleGoal };
  blocks: BlockDef[];
  loot: LootDef[];
  hint?: string;
  /** A known winning input sequence. Physics regression tests replay it. */
  solution?: Input[];
}

export type Phase = 'ready' | 'flying' | 'resolving' | 'ended';

export interface LevelResult {
  win: boolean;
  score: number;
  breakdown: { loot: number; breaks: number; chainBonus: number; thiefBonus: number };
  stars: [boolean, boolean, boolean];
  thievesUsed: number;
  thievesLeft: number;
  maxMultiplier: number;
  lootValue: number;
  /** Loot pieces grabbed this run. */
  lootCount: number;
  required: number;
  steps: number;
  /** Per-run counts, for daily jobs and lifetime stats. */
  broken: Partial<Record<MaterialId, number>>;
  thiefTypes: ThiefType[];
}

export type ImpactKind = MaterialId | 'thief' | 'loot' | 'ground' | 'bomb';

/** Everything the renderer needs to add juice. Positions are in meters. */
export type SimEvent =
  | { type: 'spawn'; id: number }
  | { type: 'remove'; id: number }
  | { type: 'launch'; id: number; thief: ThiefType }
  | { type: 'ability'; id: number; thief: ThiefType; x: number; y: number; tx: number; ty: number }
  | { type: 'impact'; x: number; y: number; strength: number; kind: ImpactKind; thiefId?: number }
  | { type: 'damage'; id: number; ratio: number }
  | { type: 'break'; id: number; material: MaterialId; x: number; y: number; angle: number; vx: number; vy: number; points: number; mult: number }
  | { type: 'explode'; x: number; y: number; radius: number }
  | { type: 'loot'; id: number; lootType: LootType; x: number; y: number; value: number; points: number; mult: number }
  | { type: 'chain'; count: number; mult: number; x: number; y: number }
  | { type: 'nearMiss'; x: number; y: number }
  | { type: 'thiefDone'; id: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'end'; result: LevelResult };
