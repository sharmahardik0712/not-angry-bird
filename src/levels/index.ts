import type { LevelData } from '../sim/types';
import { assertLevel } from './schema';
import w1l01 from './world1/01.json';
import w1l02 from './world1/02.json';
import w1l03 from './world1/03.json';
import w1l04 from './world1/04.json';
import w1l05 from './world1/05.json';
import w1l06 from './world1/06.json';

export interface WorldInfo {
  id: number;
  name: string;
  /** Stars needed (across earlier worlds) to unlock. */
  starsToUnlock: number;
}

export const WORLDS: WorldInfo[] = [{ id: 1, name: 'Corner Bank', starsToUnlock: 0 }];

export const LEVELS: LevelData[] = [w1l01, w1l02, w1l03, w1l04, w1l05, w1l06].map((l) => assertLevel(l));

export const levelById = (id: string) => LEVELS.find((l) => l.id === id);
export const levelIndex = (id: string) => LEVELS.findIndex((l) => l.id === id);
