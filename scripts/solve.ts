/**
 * Level solver: greedy search over launch angle, power, and tap timing/target for each thief in turn.
 * Because the simulation is deterministic, a found input list is a permanent proof the level is beatable.
 *
 *   npm run solve            # solve all levels, write `solution` into each JSON
 *   npm run solve -- w1-04   # just one level
 *   npm run solve -- --calibrate   # also set the score-star threshold to 90% of the solver's score
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Simulation } from '../src/sim/Simulation';
import { MAX_LAUNCH_SPEED } from '../src/sim/constants';
import type { Input, InputCommand, LevelData } from '../src/sim/types';

const DIR = join(import.meta.dirname, '../src/levels');
const calibrate = process.argv.includes('--calibrate');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));

interface Eval { inputs: Input[]; win: boolean; loot: number; score: number }

/** Replay `inputs`, then run until the next launch is possible (or the level ends). */
function advance(level: LevelData, inputs: Input[], maxSteps = 4000): Simulation {
  const sim = new Simulation(level);
  let i = 0;
  while (sim.phase !== 'ended' && sim.step < maxSteps) {
    while (i < inputs.length && inputs[i].step <= sim.step) {
      const { step: _s, ...cmd } = inputs[i++];
      sim.apply(cmd as InputCommand);
    }
    if (i >= inputs.length && (sim.canLaunch || sim.canGetaway) && sim.phase === 'ready') break;
    sim.update();
    sim.drainEvents();
  }
  return sim;
}

function finish(level: LevelData, inputs: Input[]): Eval {
  let sim = advance(level, inputs);
  if (sim.phase !== 'ended' && sim.canGetaway) {
    inputs = [...inputs, { step: sim.step, type: 'getaway' }];
    sim = Simulation.replay(level, inputs, 8000);
  } else if (sim.phase !== 'ended') {
    // Out of good ideas but thieves remain: let the run play out by waiting.
    sim = Simulation.replay(level, inputs, sim.step + 600);
  }
  const r = sim.result;
  return { inputs, win: !!r?.win, loot: sim.lootValue, score: r?.score ?? sim.liveScore };
}

function candidates(level: LevelData, sim: Simulation): InputCommand[][] {
  const type = sim.queue[0];
  const out: InputCommand[][] = [];
  const angles: number[] = [];
  for (let d = -6; d <= 72; d += 3) angles.push(d);
  const powers = [0.62, 0.74, 0.86, 1];
  const delays = type === 'magnet' ? [30, 45, 60, 75] : [18, 30, 42, 54, 66];
  const lootTargets = level.loot.map((l) => ({ x: l.x / 32, y: l.y / 32 }));
  for (const deg of angles) {
    for (const p of powers) {
      const a = (-deg * Math.PI) / 180;
      const launch: InputCommand = { type: 'launch', vx: Math.cos(a) * MAX_LAUNCH_SPEED * p, vy: Math.sin(a) * MAX_LAUNCH_SPEED * p };
      out.push([launch]);
      for (const delay of delays) {
        const taps = type === 'bouncer' ? lootTargets : [{ x: 0, y: 0 }];
        for (const t of taps) out.push([launch, { type: 'tap', ...t }, { delay } as unknown as InputCommand]);
      }
    }
  }
  return out;
}

function evalCandidate(level: LevelData, prefix: Input[], at: number, cand: InputCommand[]): Eval {
  const inputs: Input[] = [...prefix, { ...cand[0], step: at } as Input];
  if (cand.length > 1) {
    const delay = (cand[2] as unknown as { delay: number }).delay;
    inputs.push({ ...cand[1], step: at + delay } as Input);
  }
  const sim = advance(level, inputs);
  if (sim.phase === 'ended' || sim.canGetaway) return finish(level, inputs);
  return { inputs, win: false, loot: sim.lootValue, score: sim.liveScore };
}

const better = (a: Eval, b: Eval | null) =>
  !b || (a.win !== b.win ? a.win : a.loot !== b.loot ? a.loot > b.loot : a.score > b.score);

function solve(level: LevelData): Eval | null {
  let prefix: Input[] = [];
  let best: Eval | null = null;
  for (let k = 0; k < level.thieves.length; k++) {
    const sim = advance(level, prefix);
    if (!sim.canLaunch) break;
    let stepBest: Eval | null = null;
    for (const cand of candidates(level, sim)) {
      const e = evalCandidate(level, prefix, sim.step, cand);
      if (better(e, stepBest)) stepBest = e;
    }
    if (!stepBest) break;
    best = stepBest;
    if (stepBest.win) return stepBest;
    prefix = stepBest.inputs.filter((i) => i.type !== 'getaway');
    console.log(`  thief ${k + 1}: loot ${stepBest.loot}, score ${stepBest.score}`);
  }
  return best;
}

for (const world of readdirSync(DIR).filter((d) => d.startsWith('world'))) {
  for (const file of readdirSync(join(DIR, world)).filter((f) => f.endsWith('.json'))) {
    const path = join(DIR, world, file);
    const level = JSON.parse(readFileSync(path, 'utf8')) as LevelData;
    if (only && level.id !== only) continue;
    const t0 = Date.now();
    const { solution: _old, ...clean } = level;
    const res = solve(clean);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!res?.win) {
      console.log(`${level.id} UNSOLVED (best loot ${res?.loot}/${level.goal.required}) in ${secs}s`);
      continue;
    }
    // Store inputs at full precision: rounding a launch velocity by 0.001 is enough to change a chaotic collapse.
    const solution = res.inputs;
    const verified = Simulation.replay(clean, solution).result;
    if (!verified) {
      console.log(`${level.id} solution did not reproduce`);
      continue;
    }
    console.log(`${level.id} solved in ${secs}s: score ${verified.score} stars ${verified.stars.map(Number).join('')} thieves ${verified.thievesUsed}/${level.thieves.length} maxMult ${verified.maxMultiplier}`);
    const stars = calibrate ? { ...clean.stars, score: Math.floor((verified.score * 0.9) / 100) * 100 } : clean.stars;
    if (verified.win) writeFileSync(path, JSON.stringify({ ...clean, stars, solution }, null, 2) + '\n');
  }
}
