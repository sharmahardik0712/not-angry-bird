import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { Simulation } from '../src/sim/Simulation';
import { MAX_LAUNCH_SPEED, SETTLE_STEPS, UNUSED_THIEF_BONUS } from '../src/sim/constants';
import type { Input, LevelData } from '../src/sim/types';

const shot = (deg: number, power = 1, step = SETTLE_STEPS): Input => {
  const a = (-deg * Math.PI) / 180;
  return { step, type: 'launch', vx: Math.cos(a) * MAX_LAUNCH_SPEED * power, vy: Math.sin(a) * MAX_LAUNCH_SPEED * power };
};

function runFor(level: LevelData, inputs: Input[], steps: number): Simulation {
  const sim = new Simulation(level);
  let i = 0;
  while (sim.step < steps && sim.phase !== 'ended') {
    while (i < inputs.length && inputs[i].step <= sim.step) {
      const { step: _s, ...cmd } = inputs[i++];
      sim.apply(cmd);
    }
    sim.update();
    sim.drainEvents();
  }
  return sim;
}

describe('Simulation', () => {
  it('is deterministic: same level + same inputs = identical state', () => {
    const level = LEVELS.find((l) => l.id === 'w1-04')!;
    const inputs = [shot(8, 0.9), { step: SETTLE_STEPS + 20, type: 'tap', x: 30, y: 15 } as Input];
    const a = runFor(level, inputs, 900);
    const b = runFor(level, inputs, 900);
    expect(a.hash()).toBe(b.hash());
    expect(a.liveScore).toBe(b.liveScore);
  });

  it('records applied inputs with the step they happened on, and those inputs replay exactly', () => {
    const level = LEVELS[0];
    const sim = new Simulation(level);
    for (let i = 0; i < SETTLE_STEPS + 7; i++) sim.update();
    expect(sim.apply({ type: 'launch', vx: 15, vy: -9 })).toBe(true);
    for (let i = 0; i < 25; i++) sim.update();
    sim.apply({ type: 'tap', x: 33, y: 17 });
    for (let i = 0; i < 400; i++) sim.update();
    const replayed = runFor(level, sim.inputs, sim.step);
    expect(sim.inputs.map((i) => i.step)).toEqual([SETTLE_STEPS + 7, SETTLE_STEPS + 32]);
    expect(replayed.hash()).toBe(sim.hash());
  });

  it('rejects launches while settling or flying, and taps with nothing in the air', () => {
    const sim = new Simulation(LEVELS[0]);
    expect(sim.apply({ type: 'launch', vx: 10, vy: -5 })).toBe(false);
    expect(sim.apply({ type: 'tap', x: 1, y: 1 })).toBe(false);
    for (let i = 0; i < SETTLE_STEPS; i++) sim.update();
    expect(sim.apply({ type: 'launch', vx: 10, vy: -5 })).toBe(true);
    expect(sim.apply({ type: 'launch', vx: 10, vy: -5 })).toBe(false);
    expect(sim.inputs).toHaveLength(1);
  });

  it('clamps launch speed so inputs cannot exceed the slingshot', () => {
    const sim = new Simulation(LEVELS[0]);
    for (let i = 0; i < SETTLE_STEPS; i++) sim.update();
    sim.apply({ type: 'launch', vx: 500, vy: 0 });
    const thief = [...sim.entities.values()].find((e) => e.kind === 'thief')!;
    expect(thief.body.getLinearVelocity().length()).toBeCloseTo(MAX_LAUNCH_SPEED, 5);
  });

  it('score is the sum of its parts, and stars follow the rules', () => {
    for (const level of LEVELS) {
      const r = Simulation.replay(level, level.solution!).result!;
      const b = r.breakdown;
      expect(r.score).toBe(b.loot + b.breaks + b.chainBonus + b.thiefBonus);
      expect(r.stars[0]).toBe(r.win);
      expect(r.stars[1]).toBe(r.win && r.score >= level.stars.score);
      expect(b.thiefBonus).toBe(r.win ? r.thievesLeft * UNUSED_THIEF_BONUS : 0);
    }
  });

  it('getaway is only allowed once the goal is met', () => {
    const level = LEVELS[0];
    const sim = new Simulation(level);
    for (let i = 0; i < SETTLE_STEPS; i++) sim.update();
    expect(sim.apply({ type: 'getaway' })).toBe(false);
  });
});
