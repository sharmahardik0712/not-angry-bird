import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { clampPull, pullAngle, pullPosition, pullToVelocity } from '../src/sim/aim';
import { DEFAULT_GROUND_Y, MAX_LAUNCH_SPEED, MAX_PULL_PX, PPM, SETTLE_STEPS, toM } from '../src/sim/constants';
import { Simulation } from '../src/sim/Simulation';

function launchFromPull(dx: number, dy: number) {
  const level = LEVELS[0];
  const sim = new Simulation(level);
  for (let i = 0; i < SETTLE_STEPS; i++) sim.update();
  const { x, y } = level.slingshot;
  const p = clampPull(dx, dy);
  const at = pullPosition(x, y, p.dx, p.dy, level.groundY ?? DEFAULT_GROUND_Y);
  const v = pullToVelocity(p.dx, p.dy);
  sim.apply({ type: 'launch', ...v, ox: toM(at.x - x), oy: toM(at.y - y) });
  const thief = [...sim.entities.values()].find((e) => e.kind === 'thief')!;
  return { at, body: thief.body.getPosition(), speed: thief.body.getLinearVelocity().length() };
}

describe('slingshot aim', () => {
  it('the thief launches exactly where it was released (no jump)', () => {
    const { at, body } = launchFromPull(-120, 40);
    expect(body.x * PPM).toBeCloseTo(at.x, 6);
    expect(body.y * PPM).toBeCloseTo(at.y, 6);
  });

  it('a pull below street level slides along the street instead of sinking', () => {
    const { at, body } = launchFromPull(-60, 180);
    expect(at.y).toBeLessThan(DEFAULT_GROUND_Y);
    expect(body.y * PPM).toBeCloseTo(at.y, 6);
  });

  it('full stretch gives top speed, and over-pulling is clamped', () => {
    expect(launchFromPull(-MAX_PULL_PX, 0).speed).toBeCloseTo(MAX_LAUNCH_SPEED, 6);
    expect(launchFromPull(-MAX_PULL_PX * 3, 0).speed).toBeCloseTo(MAX_LAUNCH_SPEED, 6);
    expect(clampPull(0, 999).tension).toBe(1);
  });

  it('launches opposite to the pull, and reports the angle above horizontal', () => {
    const v = pullToVelocity(-100, 100);
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vy).toBeLessThan(0);
    expect(pullAngle(-100, 100)).toBe(45);
    expect(pullAngle(-100, 0)).toBe(0);
  });

  it('older inputs without a release point still launch from the rest point', () => {
    const level = LEVELS[0];
    const sim = new Simulation(level);
    for (let i = 0; i < SETTLE_STEPS; i++) sim.update();
    sim.apply({ type: 'launch', vx: 10, vy: -5 });
    const thief = [...sim.entities.values()].find((e) => e.kind === 'thief')!;
    expect(thief.body.getPosition().x * PPM).toBeCloseTo(level.slingshot.x, 6);
  });
});
