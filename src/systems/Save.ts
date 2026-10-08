import { LEVELS } from '../levels';
import type { Input, LevelResult } from '../sim/types';
import { skinById, skinUnlocked } from '../ui/theme';
import { applyRun, dateKey, migrate, rollDaily, totalStarsIn, type RunRewards, type SaveData, type Settings } from './Progress';

export type { LevelProgress, SaveData, Settings, RunRewards } from './Progress';

const KEY = 'crh-save';
const LEGACY_KEYS = ['crh-save-v1'];

let cache: SaveData | null = null;

/**
 * Progress lives in this browser's localStorage. It can be missing or throw (private mode,
 * blocked storage); the game still runs, it just won't remember.
 */
export function load(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY) ?? LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ?? null;
    cache = migrate(raw ? JSON.parse(raw) : null);
  } catch {
    cache = migrate(null);
  }
  rollDaily(cache, dateKey(new Date()), availableContent(cache));
  return cache;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable */
  }
}

/** Thieves and materials in levels the player has unlocked (a level unlocks once the previous one has a star). */
export function availableContent(s: SaveData): Set<string> {
  const out = new Set<string>();
  LEVELS.forEach((l, i) => {
    if (i > 0 && !s.levels[LEVELS[i - 1].id]?.stars.some(Boolean)) return;
    l.thieves.forEach((t) => out.add(t));
    l.blocks.forEach((b) => out.add(b.type));
  });
  return out;
}

export function recordRun(levelId: string, r: LevelResult, inputs: Input[]): RunRewards {
  const s = load();
  const rewards = applyRun(s, levelId, r, inputs, new Date(), availableContent(s));
  persist();
  return rewards;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const s = load();
  s.settings = { ...s.settings, ...patch };
  persist();
  return s.settings;
}

/** Equips a crew look if enough stars have been earned for it. */
export function equipSkin(id: string): boolean {
  const s = load();
  if (!skinUnlocked(skinById(id), totalStarsIn(s))) return false;
  s.skin = id;
  persist();
  return true;
}

export const levelProgress = (levelId: string) => load().levels[levelId];
export const starCount = (levelId: string) => load().levels[levelId]?.stars.filter(Boolean).length ?? 0;
export const totalStars = () => totalStarsIn(load());
