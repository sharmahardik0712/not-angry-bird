import type { Input, LevelResult } from '../sim/types';

/** Everything persisted. Pure data so progression rules can be unit-tested without a browser. */
export interface Attempt {
  at: number;
  score: number;
  win: boolean;
  stars: number;
  loot: number;
  maxMult: number;
}

export interface LevelProgress {
  stars: [boolean, boolean, boolean];
  best: number;
  /** Inputs of the best winning run: replayed for "watch best" and the ghost trail. */
  bestInputs?: Input[];
  plays: number;
  wins: number;
  /** Most recent first, capped. */
  attempts: Attempt[];
}

export interface Settings {
  sound: boolean;
  shake: boolean;
  volume: number;
  ghost: boolean;
}

export interface Stats {
  plays: number;
  wins: number;
  lootGrabbed: number;
  blocksBroken: number;
  explosions: number;
  bestCombo: number;
}

export interface Daily {
  date: string;
  progress: Record<string, number>;
  done: string[];
  /** Content available when today's challenges were first drawn; frozen for the day. */
  available?: string[];
}

export interface SaveData {
  v: 3;
  levels: Record<string, LevelProgress>;
  settings: Settings;
  stats: Stats;
  skin: string;
  daily: Daily;
  streak: { last: string; count: number; best: number };
}

export const MAX_ATTEMPTS = 15;

export const freshSave = (): SaveData => ({
  v: 3,
  levels: {},
  settings: { sound: true, shake: true, volume: 0.7, ghost: true },
  stats: { plays: 0, wins: 0, lootGrabbed: 0, blocksBroken: 0, explosions: 0, bestCombo: 1 },
  skin: 'classic',
  daily: { date: '', progress: {}, done: [] },
  streak: { last: '', count: 0, best: 0 },
});

/** Accepts any older (v1/v2) or partial save and returns a complete v3 save. Coins from v2 are dropped. */
export function migrate(raw: unknown): SaveData {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  const levels: Record<string, LevelProgress> = {};
  for (const [id, l] of Object.entries((r.levels ?? {}) as Record<string, any>)) {
    levels[id] = {
      stars: l.stars ?? [false, false, false],
      best: l.best ?? 0,
      bestInputs: l.bestInputs,
      plays: l.plays ?? (l.best ? 1 : 0),
      wins: l.wins ?? (l.best ? 1 : 0),
      attempts: (l.attempts ?? []).map((a: any) => ({ at: a.at, score: a.score, win: a.win, stars: a.stars, loot: a.loot ?? 0, maxMult: a.maxMult ?? 1 })),
    };
  }
  const st = r.stats ?? {};
  return {
    v: 3,
    levels,
    settings: { ...base.settings, ...r.settings },
    stats: {
      plays: st.plays ?? 0, wins: st.wins ?? 0, lootGrabbed: st.lootGrabbed ?? 0,
      blocksBroken: st.blocksBroken ?? 0, explosions: st.explosions ?? 0, bestCombo: st.bestCombo ?? 1,
    },
    skin: r.skin ?? r.skins?.equipped ?? 'classic',
    daily: { ...base.daily, ...r.daily },
    streak: { last: r.streak?.last ?? '', count: r.streak?.count ?? 0, best: r.streak?.best ?? r.streak?.count ?? 0 },
  };
}

export const totalStarsIn = (s: SaveData) => Object.values(s.levels).reduce((n, l) => n + l.stars.filter(Boolean).length, 0);

// ---------------------------------------------------------------- daily challenges

export interface RunFacts {
  win: boolean;
  loot: number;
  maxMult: number;
  threeStars: boolean;
  broken: LevelResult['broken'];
  thieves: LevelResult['thiefTypes'];
}

export interface DailyGoal {
  id: string;
  text: string;
  target: number;
  measure: (r: RunFacts) => number;
  /** A thief or material the player must have access to for this challenge to be offered. */
  needs?: string;
}

export const GOAL_POOL: DailyGoal[] = [
  { id: 'win3', text: 'Pull off 3 heists', target: 3, measure: (r) => (r.win ? 1 : 0) },
  { id: 'loot12', text: 'Grab 12 pieces of loot', target: 12, measure: (r) => r.loot },
  { id: 'combo3', text: 'Hit a ×3 combo', target: 1, measure: (r) => (r.maxMult >= 3 ? 1 : 0) },
  { id: 'combo2x3', text: 'Hit a ×2 combo in 3 runs', target: 3, measure: (r) => (r.maxMult >= 2 ? 1 : 0) },
  { id: 'wood25', text: 'Smash 25 wood blocks', target: 25, measure: (r) => r.broken.wood ?? 0, needs: 'wood' },
  { id: 'stone6', text: 'Crack 6 stone blocks', target: 6, measure: (r) => r.broken.stone ?? 0, needs: 'stone' },
  { id: 'tnt4', text: 'Set off 4 TNT crates', target: 4, measure: (r) => r.broken.tnt ?? 0, needs: 'tnt' },
  { id: 'bomber4', text: 'Launch the Bomber 4 times', target: 4, measure: (r) => r.thieves.filter((t) => t === 'bomber').length, needs: 'bomber' },
  { id: 'splitter3', text: 'Launch the Splitter 3 times', target: 3, measure: (r) => r.thieves.filter((t) => t === 'splitter').length, needs: 'splitter' },
  { id: 'magnet3', text: 'Launch the Magnet 3 times', target: 3, measure: (r) => r.thieves.filter((t) => t === 'magnet').length, needs: 'magnet' },
  { id: 'stars3', text: 'Earn 3 stars on any level', target: 1, measure: (r) => (r.threeStars ? 1 : 0) },
];

export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Three challenges for the date, stable for that date. `available` (thieves and materials in the
 * player's unlocked levels) keeps them achievable; omit it to draw from the whole pool.
 */
export function goalsFor(date: string, available?: ReadonlySet<string>): DailyGoal[] {
  const pool = GOAL_POOL.filter((g) => !g.needs || !available || available.has(g.needs));
  const out: DailyGoal[] = [];
  let h = hashStr(date);
  while (out.length < 3 && pool.length) {
    out.push(pool.splice(h % pool.length, 1)[0]);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return out;
}

/** Resets daily progress when the date changes. */
export function rollDaily(s: SaveData, today: string, available?: ReadonlySet<string>): void {
  if (s.daily.date !== today) s.daily = { date: today, progress: {}, done: [], available: available ? [...available].sort() : undefined };
  else if (!s.daily.available && available) s.daily.available = [...available].sort();
}

/** The challenges currently on offer for the save's day. */
export const todaysGoals = (s: SaveData) => goalsFor(s.daily.date, s.daily.available ? new Set(s.daily.available) : undefined);

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// ---------------------------------------------------------------- applying a run

export interface RunRewards {
  newStars: number;
  newBest: boolean;
  prevBest: number;
  goalsDone: DailyGoal[];
  streak: number;
  /** Total stars after this run (skins unlock by stars). */
  totalStars: number;
}

/**
 * Applies one finished run to the save: history, stars, best run, lifetime stats,
 * daily challenges and streak. Mutates `s` and returns what changed, for the results screen.
 */
export function applyRun(s: SaveData, levelId: string, r: LevelResult, inputs: Input[], now: Date, available?: ReadonlySet<string>): RunRewards {
  const today = dateKey(now);
  rollDaily(s, today, available);

  const lp: LevelProgress = s.levels[levelId] ?? { stars: [false, false, false], best: 0, plays: 0, wins: 0, attempts: [] };
  const hadStars = lp.stars.filter(Boolean).length;
  lp.stars = lp.stars.map((v, i) => v || r.stars[i]) as LevelProgress['stars'];
  const newStars = lp.stars.filter(Boolean).length - hadStars;
  const prevBest = lp.best;
  const newBest = r.win && r.score > lp.best;
  if (newBest) {
    lp.best = r.score;
    lp.bestInputs = inputs;
  }
  lp.plays++;
  if (r.win) lp.wins++;
  lp.attempts = [
    { at: now.getTime(), score: r.score, win: r.win, stars: r.stars.filter(Boolean).length, loot: r.lootCount, maxMult: r.maxMultiplier },
    ...lp.attempts,
  ].slice(0, MAX_ATTEMPTS);
  s.levels[levelId] = lp;

  s.stats.plays++;
  if (r.win) s.stats.wins++;
  s.stats.lootGrabbed += r.lootCount;
  s.stats.blocksBroken += Object.values(r.broken).reduce((a, b) => a + (b ?? 0), 0);
  s.stats.explosions += r.broken.tnt ?? 0;
  s.stats.bestCombo = Math.max(s.stats.bestCombo, r.maxMultiplier);

  // Streak: the first win of each day extends it; missing a day resets it.
  if (r.win && s.streak.last !== today) {
    s.streak.count = s.streak.last && daysBetween(s.streak.last, today) === 1 ? s.streak.count + 1 : 1;
    s.streak.last = today;
    s.streak.best = Math.max(s.streak.best, s.streak.count);
  }

  const facts: RunFacts = { win: r.win, loot: r.lootCount, maxMult: r.maxMultiplier, threeStars: r.stars.every(Boolean), broken: r.broken, thieves: r.thiefTypes };
  const goalsDone: DailyGoal[] = [];
  for (const g of todaysGoals(s)) {
    if (s.daily.done.includes(g.id)) continue;
    const v = (s.daily.progress[g.id] ?? 0) + g.measure(facts);
    s.daily.progress[g.id] = Math.min(v, g.target);
    if (v >= g.target) {
      s.daily.done.push(g.id);
      goalsDone.push(g);
    }
  }

  return { newStars, newBest, prevBest, goalsDone, streak: s.streak.count, totalStars: totalStarsIn(s) };
}
