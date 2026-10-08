import { MATERIALS } from '../sim/materials';
import { DEFAULT_GROUND_Y, DEFAULT_LEVEL_WIDTH } from '../sim/constants';
import { LOOT_TYPES, THIEF_TYPES, type LevelData } from '../sim/types';

const MAX_BLOCKS = 150;
const MAX_LOOT = 40;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates a level and returns a list of problems (empty = valid).
 * Hand-rolled to avoid a runtime dependency; also used for player-made levels later,
 * so it checks budgets and geometry, not just shape.
 */
export function validateLevel(raw: unknown): string[] {
  const errs: string[] = [];
  const err = (m: string) => errs.push(m);
  if (!isObj(raw)) return ['level must be an object'];
  const l = raw as Partial<LevelData> & Record<string, unknown>;

  if (typeof l.id !== 'string' || !/^w\d+-\d{2}$/.test(l.id)) err('id must look like "w1-04"');
  if (typeof l.name !== 'string' || !l.name) err('name is required');
  if (!isNum(l.world) || l.world < 1) err('world must be a positive number');
  if (!isNum(l.gravity) || l.gravity <= 0 || l.gravity > 3) err('gravity must be in (0, 3]');
  const width = l.width ?? DEFAULT_LEVEL_WIDTH;
  const groundY = l.groundY ?? DEFAULT_GROUND_Y;
  if (!isNum(width) || width < 800 || width > 4000) err('width must be in [800, 4000]');
  if (!isNum(groundY) || groundY < 300 || groundY > 700) err('groundY must be in [300, 700]');

  if (!isObj(l.slingshot) || !isNum(l.slingshot.x) || !isNum(l.slingshot.y)) err('slingshot {x, y} required');
  else if (l.slingshot.y >= groundY) err('slingshot must be above the ground');

  if (!Array.isArray(l.thieves) || l.thieves.length < 1 || l.thieves.length > 6) err('thieves must have 1-6 entries');
  else l.thieves.forEach((t, i) => { if (!THIEF_TYPES.includes(t)) err(`thieves[${i}] unknown "${t}"`); });

  if (!isObj(l.goal) || l.goal.type !== 'loot' || !isNum(l.goal.required) || l.goal.required <= 0) err('goal {type: "loot", required > 0} required');

  if (!isObj(l.stars) || !isNum(l.stars.score) || !isObj(l.stars.style)) err('stars {score, style} required');
  else {
    const s = l.stars.style as Record<string, unknown>;
    if (s.type === 'max_thieves' || s.type === 'combo') { if (!isNum(s.value)) err(`style ${s.type} needs value`); }
    else if (s.type === 'no_break') { if (!(typeof s.material === 'string' && s.material in MATERIALS)) err('style no_break needs a material'); }
    else if (s.type !== 'bonus_loot') err(`unknown style type "${String(s.type)}"`);
  }

  const boxes: { x0: number; y0: number; x1: number; y1: number; i: number }[] = [];
  if (!Array.isArray(l.blocks) || l.blocks.length > MAX_BLOCKS) err(`blocks must be an array of at most ${MAX_BLOCKS}`);
  else l.blocks.forEach((b, i) => {
    if (!isObj(b)) return err(`blocks[${i}] must be an object`);
    if (!(typeof b.type === 'string' && b.type in MATERIALS)) err(`blocks[${i}] unknown material "${String(b.type)}"`);
    if (![b.x, b.y, b.w, b.h].every(isNum)) return err(`blocks[${i}] needs numeric x, y, w, h`);
    if (b.w < 8 || b.h < 8 || b.w > 600 || b.h > 600) err(`blocks[${i}] size out of range`);
    if (b.y + b.h / 2 > groundY + 0.5 && !b.angle) err(`blocks[${i}] sinks into the ground`);
    if (b.x < 0 || b.x > width) err(`blocks[${i}] outside level width`);
    if (b.type === 'tnt' && (b.static ?? false)) err(`blocks[${i}] TNT can't be static`);
    if (!b.angle) boxes.push({ x0: b.x - b.w / 2, y0: b.y - b.h / 2, x1: b.x + b.w / 2, y1: b.y + b.h / 2, i });
  });

  // Overlapping blocks explode apart on the first step. Allow 0.5px of slop for authored stacks.
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      if (A.x0 < B.x1 - 0.5 && B.x0 < A.x1 - 0.5 && A.y0 < B.y1 - 0.5 && B.y0 < A.y1 - 0.5) err(`blocks[${A.i}] overlaps blocks[${B.i}]`);
    }
  }

  if (!Array.isArray(l.loot) || l.loot.length < 1 || l.loot.length > MAX_LOOT) err(`loot must have 1-${MAX_LOOT} entries`);
  else {
    let total = 0;
    l.loot.forEach((t, i) => {
      if (!isObj(t)) return err(`loot[${i}] must be an object`);
      if (!LOOT_TYPES.includes(t.type)) err(`loot[${i}] unknown type "${String(t.type)}"`);
      if (![t.x, t.y, t.value].every(isNum) || t.value <= 0) err(`loot[${i}] needs x, y, value > 0`);
      else total += t.value;
    });
    if (isObj(l.goal) && isNum(l.goal.required) && l.goal.required > total) err(`goal.required ${l.goal.required} exceeds total loot ${total}`);
  }

  if (l.solution !== undefined && !Array.isArray(l.solution)) err('solution must be an array of inputs');
  return errs;
}

export function assertLevel(raw: unknown): LevelData {
  const errs = validateLevel(raw);
  if (errs.length) throw new Error(`Invalid level ${(raw as { id?: string })?.id ?? '?'}:\n  ${errs.join('\n  ')}`);
  return raw as LevelData;
}

