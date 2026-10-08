import { describe, expect, it } from 'vitest';
import { ComboTracker } from '../src/sim/ComboTracker';

describe('ComboTracker', () => {
  it('direct hits from a launch keep the chain alive but do not raise the multiplier', () => {
    const c = new ComboTracker(90);
    const launch = c.record(null, 0);
    const hit1 = c.record(launch.id, 30);
    const hit2 = c.record(launch.id, 40);
    expect([hit1.mult, hit2.mult]).toEqual([1, 1]);
    expect(hit1.depth).toBe(1);
  });

  it('caused events extend the chain: multiplier = 1 + 0.5 × chained events', () => {
    const c = new ComboTracker(90);
    const launch = c.record(null, 0);
    const tnt = c.record(launch.id, 20);
    const blast = c.record(tnt.id, 21);
    const fall1 = c.record(blast.id, 40);
    const fall2 = c.record(fall1.id, 80);
    expect([blast.mult, fall1.mult, fall2.mult]).toEqual([1.5, 2, 2.5]);
    expect(fall2.extended).toBe(true);
    expect(c.maxMultiplier).toBe(2.5);
  });

  it('a chain expires after the window; later effects start a fresh chain', () => {
    const c = new ComboTracker(90);
    const launch = c.record(null, 0);
    const a = c.record(launch.id, 10);
    const b = c.record(a.id, 20);
    expect(b.mult).toBe(1.5);
    const late = c.record(b.id, 20 + 91);
    expect(late.mult).toBe(1);
    expect(late.chainId).not.toBe(b.chainId);
    const followUp = c.record(late.id, 120);
    expect(followUp.mult).toBe(1.5);
  });

  it('events with no cause are their own root', () => {
    const c = new ComboTracker();
    const e = c.record(null, 5);
    expect(e).toMatchObject({ depth: 0, count: 0, mult: 1, extended: false });
  });
});
