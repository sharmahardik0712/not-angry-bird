# Chain Reaction Heist

Browser physics launcher: fling thieves at a fortress, tap mid-air for abilities, chain collapses into combos.

```bash
npm install
npm run dev        # http://localhost:5173  (also on your LAN for phone testing)
npm test           # schema, combo, determinism, and level-solution regression tests
npm run solve      # re-find a winning input list for every level (add -- --calibrate to reset score stars)
npm run build
```

Debug URLs: `?level=w1-04` jumps to a level; `?level=w1-04&demo=1` plays its recorded solution.

## Architecture

- `src/sim/` is a **deterministic, render-free simulation** (Planck.js, fixed 60 Hz step, no `Math.random`).
  The same level + the same `Input[]` always gives the same result. That's what makes replays,
  challenge links, server validation, and the solver possible.
  - `Simulation.ts`: world, contacts, damage, explosions, loot, phases, scoring
  - `ComboTracker.ts`: causal chains (every event names its cause)
  - `thieves.ts`: one `ThiefAbility` per thief (`onTap`, `update`, `onCollide`)
  - `materials.ts`: all material tuning in one table
- `src/scenes/` is Phaser rendering + input only. Slow motion and hit stop scale the *time fed in*, never the step size.
- `src/render/` has procedural canvas art and the effects layer (no asset downloads).
- `src/levels/` holds JSON levels, the validator, and recorded `solution`s.

## Rules worth knowing

- Store replay inputs at full float precision. Rounding a launch velocity by 0.001 changes a collapse.
- Loot is stolen when a thief touches it or when it's knocked down to the street.
- A thief's ability works until its first solid hit.
- Direct thief hits keep a chain alive; only *caused* events (break → fall → break) raise the multiplier.
