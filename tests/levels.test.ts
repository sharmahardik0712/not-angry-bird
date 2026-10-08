import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { validateLevel } from '../src/levels/schema';
import { Simulation } from '../src/sim/Simulation';
import type { LevelData } from '../src/sim/types';

describe('level schema', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s is valid', (_id, level) => {
    expect(validateLevel(level)).toEqual([]);
  });

  it('level ids are unique', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it('rejects overlapping blocks, unknown materials and impossible goals', () => {
    const bad = {
      ...LEVELS[0],
      blocks: [
        { type: 'wood', x: 1000, y: 570, w: 40, h: 100 },
        { type: 'wood', x: 1010, y: 570, w: 40, h: 100 },
        { type: 'plutonium', x: 1200, y: 600, w: 40, h: 40 },
      ],
      goal: { type: 'loot', required: 999999 },
    };
    const errs = validateLevel(bad).join('\n');
    expect(errs).toMatch(/overlaps/);
    expect(errs).toMatch(/unknown material "plutonium"/);
    expect(errs).toMatch(/exceeds total loot/);
  });

  it('every level stands still until the player acts', () => {
    for (const level of LEVELS) {
      const sim = new Simulation(level);
      for (let i = 0; i < 240; i++) sim.update();
      expect(sim.liveScore, level.id).toBe(0);
      expect(sim.lootValue, level.id).toBe(0);
    }
  });
});

// Physics regression: each level ships with a recorded winning input list (found by `npm run solve`).
// If a physics or tuning change breaks a level, this fails and tells you which one.
describe('level solutions still win', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s', (_id, level: LevelData) => {
    expect(level.solution, `${level.id} has no solution; run npm run solve`).toBeDefined();
    const sim = Simulation.replay(level, level.solution!);
    expect(sim.result?.win).toBe(true);
  });
});
