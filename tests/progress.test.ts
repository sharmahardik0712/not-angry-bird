import { describe, expect, it } from 'vitest';
import type { LevelResult } from '../src/sim/types';
import { applyRun, freshSave, goalsFor, GOAL_POOL, MAX_ATTEMPTS, migrate, totalStarsIn } from '../src/systems/Progress';
import { SKINS, skinUnlocked } from '../src/ui/theme';

const result = (over: Partial<LevelResult> = {}): LevelResult => ({
  win: true, score: 2000, breakdown: { loot: 400, breaks: 600, chainBonus: 500, thiefBonus: 500 },
  stars: [true, true, false], thievesUsed: 1, thievesLeft: 1, maxMultiplier: 2, lootValue: 400, lootCount: 3, required: 300,
  steps: 600, broken: { wood: 5, tnt: 1 }, thiefTypes: ['bouncer'], ...over,
});
const day = (d: string) => new Date(`${d}T12:00:00`);

describe('save migration', () => {
  it('upgrades a v1 save without losing stars or best runs', () => {
    const v1 = { v: 1, levels: { 'w1-01': { stars: [true, false, true], best: 1800, bestInputs: [{ step: 45, type: 'launch', vx: 1, vy: -1 }] } }, settings: { sound: false, shake: true, volume: 0.5 } };
    const s = migrate(v1);
    expect(s.v).toBe(3);
    expect(s.levels['w1-01']).toMatchObject({ stars: [true, false, true], best: 1800, plays: 1, wins: 1, attempts: [] });
    expect(s.levels['w1-01'].bestInputs).toHaveLength(1);
    expect(s.settings).toMatchObject({ sound: false, volume: 0.5, ghost: true });
    expect(s.skin).toBe('classic');
  });

  it('upgrades a v2 save: keeps history, stats and equipped look, drops coins', () => {
    const v2 = {
      v: 2, coins: 999, levels: { 'w1-01': { stars: [true, true, true], best: 2400, plays: 4, wins: 3, attempts: [{ at: 1, score: 2400, win: true, stars: 3, lootValue: 400, maxMult: 2.5 }] } },
      stats: { plays: 4, wins: 3, lootStolen: 1200, blocksBroken: 30, explosions: 2, bestCombo: 2.5, coinsEarned: 999 },
      skins: { owned: ['classic', 'ocean'], equipped: 'ocean' }, streak: { last: '2026-10-08', count: 2 },
    };
    const s = migrate(v2);
    expect(s).not.toHaveProperty('coins');
    expect(s.skin).toBe('ocean');
    expect(s.levels['w1-01'].attempts[0]).toMatchObject({ score: 2400, maxMult: 2.5 });
    expect(s.stats).toMatchObject({ plays: 4, wins: 3, blocksBroken: 30, bestCombo: 2.5 });
    expect(s.streak).toMatchObject({ count: 2, best: 2 });
  });

  it('survives garbage', () => {
    expect(migrate('nope').v).toBe(3);
    expect(migrate(null).levels).toEqual({});
  });
});

describe('applyRun', () => {
  it('records history newest-first and caps it', () => {
    const s = freshSave();
    for (let i = 0; i < MAX_ATTEMPTS + 5; i++) applyRun(s, 'w1-01', result({ score: i }), [], day('2026-10-08'));
    const lp = s.levels['w1-01'];
    expect(lp.attempts).toHaveLength(MAX_ATTEMPTS);
    expect(lp.attempts[0].score).toBe(MAX_ATTEMPTS + 4);
    expect(lp.plays).toBe(MAX_ATTEMPTS + 5);
  });

  it('keeps the best winning run inputs, and a loss never replaces them', () => {
    const s = freshSave();
    const inputs = [{ step: 45, type: 'launch' as const, vx: 10, vy: -5 }];
    applyRun(s, 'w1-01', result({ score: 2000 }), inputs, day('2026-10-08'));
    applyRun(s, 'w1-01', result({ win: false, score: 9999, stars: [false, false, false] }), [], day('2026-10-08'));
    applyRun(s, 'w1-01', result({ score: 1500 }), [], day('2026-10-08'));
    expect(s.levels['w1-01'].best).toBe(2000);
    expect(s.levels['w1-01'].bestInputs).toEqual(inputs);
  });

  it('counts only newly earned stars, and tracks loot pieces (not money)', () => {
    const s = freshSave();
    expect(applyRun(s, 'w1-01', result(), [], day('2026-10-08')).newStars).toBe(2);
    expect(applyRun(s, 'w1-01', result(), [], day('2026-10-08')).newStars).toBe(0);
    expect(s.stats.lootGrabbed).toBe(6);
    expect(totalStarsIn(s)).toBe(2);
  });

  it('streak grows on consecutive days and resets after a gap; best is remembered', () => {
    const s = freshSave();
    applyRun(s, 'w1-01', result(), [], day('2026-10-08'));
    applyRun(s, 'w1-01', result(), [], day('2026-10-08'));
    expect(s.streak.count).toBe(1);
    applyRun(s, 'w1-01', result(), [], day('2026-10-09'));
    expect(s.streak.count).toBe(2);
    applyRun(s, 'w1-01', result(), [], day('2026-10-12'));
    expect(s.streak).toMatchObject({ count: 1, best: 2 });
  });

  it('completes daily challenges once and resets them the next day', () => {
    const date = '2026-10-08';
    const goals = goalsFor(date);
    const s = freshSave();
    const huge = result({ lootCount: 20, maxMultiplier: 4, stars: [true, true, true], broken: { wood: 40, stone: 10, tnt: 6 }, thiefTypes: ['bomber', 'bomber', 'bomber', 'bomber', 'splitter', 'splitter', 'splitter', 'magnet', 'magnet', 'magnet'] });
    let done = 0;
    for (let i = 0; i < 3; i++) done += applyRun(s, 'w1-01', huge, [], day(date)).goalsDone.length;
    expect(done).toBe(3);
    expect(new Set(s.daily.done)).toEqual(new Set(goals.map((g) => g.id)));
    expect(applyRun(s, 'w1-01', huge, [], day(date)).goalsDone).toHaveLength(0);
    applyRun(s, 'w1-01', result({ win: false, lootCount: 0, stars: [false, false, false], broken: {}, thiefTypes: [] }), [], day('2026-10-09'));
    expect(s.daily.date).toBe('2026-10-09');
  });

  it('daily challenges are 3 distinct, stable per date', () => {
    for (const d of ['2026-01-01', '2026-10-08', '2027-03-15']) {
      const g = goalsFor(d);
      expect(new Set(g.map((x) => x.id)).size).toBe(3);
      expect(goalsFor(d).map((x) => x.id)).toEqual(g.map((x) => x.id));
      for (const x of g) expect(GOAL_POOL).toContain(x);
    }
  });
});

describe('daily challenges respect unlocked content', () => {
  it('never offers a challenge for a thief or material the player cannot reach yet', () => {
    const early = new Set(['bouncer', 'wood', 'steel']);
    for (let d = 1; d <= 28; d++) {
      for (const g of goalsFor(`2026-02-${String(d).padStart(2, '0')}`, early)) expect(!g.needs || early.has(g.needs)).toBe(true);
    }
  });

  it('freezes the challenge set for the day even if more content unlocks', () => {
    const s = freshSave();
    applyRun(s, 'w1-01', result(), [], day('2026-10-08'), new Set(['bouncer', 'wood']));
    const before = s.daily.available;
    applyRun(s, 'w1-02', result(), [], day('2026-10-08'), new Set(['bouncer', 'wood', 'tnt', 'bomber']));
    expect(s.daily.available).toEqual(before);
  });
});

describe('crew looks', () => {
  it('unlock by star total, classic always available, thresholds ascending', () => {
    expect(skinUnlocked(SKINS[0], 0)).toBe(true);
    expect(skinUnlocked(SKINS[1], SKINS[1].stars - 1)).toBe(false);
    expect(skinUnlocked(SKINS[1], SKINS[1].stars)).toBe(true);
    for (let i = 1; i < SKINS.length; i++) expect(SKINS[i].stars).toBeGreaterThan(SKINS[i - 1].stars);
  });
});
