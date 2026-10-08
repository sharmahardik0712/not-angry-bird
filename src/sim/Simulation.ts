import { Box, Circle, World, type Contact } from 'planck';
import { ComboTracker } from './ComboTracker';
import {
  DEFAULT_GROUND_Y, DEFAULT_LEVEL_WIDTH, DT, GRAVITY, MAX_LAUNCH_SPEED, MAX_PULL_PX, MAX_THIEF_STEPS,
  RESOLVE_TIMEOUT_STEPS, SETTLE_STEPS, THIEF_RADIUS, UNUSED_THIEF_BONUS, toM,
} from './constants';
import type { BlockEntity, BombEntity, Entity, LootEntity, ThiefEntity } from './entities';
import { BOMB_EXPLOSION, BOMB_FUSE_STEPS, LOOT_SHAPES, MATERIALS, type ExplosionSpec } from './materials';
import { ABILITIES } from './thieves';
import type {
  ImpactKind, Input, InputCommand, LevelData, LevelResult, MaterialId, Phase, SimEvent, ThiefType,
} from './types';

interface PendingContact {
  a: Entity;
  b: Entity;
  impulse: number;
  x: number;
  y: number;
}

const CAUSE_IMPULSE = 0.4;
const IMPACT_EVENT_IMPULSE = 2;
const LAND_IMPULSE = 0.5;
const THIEF_REST_SPEED = 0.8;
const THIEF_REST_STEPS = 40;

/**
 * Deterministic, render-free game simulation. Same level + same inputs = same result,
 * so it runs identically in the browser, in tests, in the level solver, and (later) on a server.
 * Never use Math.random or wall-clock time in here.
 */
export class Simulation {
  readonly world: World;
  readonly entities = new Map<number, Entity>();
  readonly inputs: Input[] = [];
  readonly combo = new ComboTracker();
  readonly gravity: number;
  readonly widthM: number;
  readonly groundYM: number;
  readonly anchor: { x: number; y: number };

  step = 0;
  phase: Phase = 'ready';
  queue: ThiefType[];
  thievesUsed = 0;
  lootValue = 0;
  bonusCollected = 0;
  lootCount = 0;
  score = { loot: 0, breaks: 0, chainBonus: 0 };
  readonly broken: Partial<Record<MaterialId, number>> = {};
  readonly launched: ThiefType[] = [];
  result: LevelResult | null = null;

  private nextId = 1;
  private events: SimEvent[] = [];
  private contacts: PendingContact[] = [];
  private breakQueue: BlockEntity[] = [];
  private resolveSteps = 0;

  constructor(readonly level: LevelData) {
    this.gravity = GRAVITY * level.gravity;
    this.world = new World({ gravity: { x: 0, y: this.gravity } });
    this.widthM = toM(level.width ?? DEFAULT_LEVEL_WIDTH);
    this.groundYM = toM(level.groundY ?? DEFAULT_GROUND_Y);
    this.anchor = { x: toM(level.slingshot.x), y: toM(level.slingshot.y) };
    this.queue = [...level.thieves];

    this.createGround();
    for (const b of level.blocks) this.createBlock(b.type, toM(b.x), toM(b.y), b.w, b.h, ((b.angle ?? 0) * Math.PI) / 180, b.static);
    for (const l of level.loot) this.createLoot(l.type, toM(l.x), toM(l.y), l.value, !!l.bonus);

    this.world.on('begin-contact', (c) => this.onBeginContact(c));
  }

  // ---------------------------------------------------------------- queries

  get required(): number {
    return this.level.goal.required;
  }
  get settling(): boolean {
    return this.step < SETTLE_STEPS;
  }
  get canLaunch(): boolean {
    return this.phase === 'ready' && this.queue.length > 0 && !this.settling;
  }
  get canGetaway(): boolean {
    return this.phase === 'ready' && this.lootValue >= this.required;
  }
  get tappableThief(): ThiefEntity | undefined {
    for (const e of this.entities.values()) {
      if (e.kind === 'thief' && !e.removed && !e.abilityUsed && !e.landed) return e;
    }
    return undefined;
  }
  get liveScore(): number {
    return Math.round(this.score.loot + this.score.breaks + this.score.chainBonus);
  }
  get lootRemaining(): number {
    let n = 0;
    for (const e of this.entities.values()) if (e.kind === 'loot' && !e.removed) n++;
    return n;
  }

  // ---------------------------------------------------------------- input

  /** Apply an input now. Returns false (and records nothing) if it isn't valid in the current state. */
  apply(cmd: InputCommand): boolean {
    let ok = false;
    if (cmd.type === 'launch') ok = this.launch(cmd.vx, cmd.vy, cmd.ox ?? 0, cmd.oy ?? 0);
    else if (cmd.type === 'tap') ok = this.tap(cmd.x, cmd.y);
    else if (cmd.type === 'getaway') ok = this.getaway();
    if (ok) this.inputs.push({ ...cmd, step: this.step } as Input);
    return ok;
  }

  private launch(vx: number, vy: number, ox: number, oy: number): boolean {
    if (!this.canLaunch) return false;
    const speed = Math.hypot(vx, vy);
    if (speed > MAX_LAUNCH_SPEED) {
      vx = (vx / speed) * MAX_LAUNCH_SPEED;
      vy = (vy / speed) * MAX_LAUNCH_SPEED;
    }
    const type = this.queue.shift()!;
    this.thievesUsed++;
    this.launched.push(type);
    const root = this.combo.record(null, this.step);
    // Launch from the release point (same rule the renderer uses, so there's no visual jump).
    const maxO = toM(MAX_PULL_PX);
    const ol = Math.hypot(ox, oy);
    if (ol > maxO) { ox = (ox / ol) * maxO; oy = (oy / ol) * maxO; }
    const sx = this.anchor.x + ox;
    const sy = Math.min(this.anchor.y + oy, this.groundYM - THIEF_RADIUS - toM(2));
    const t = this.spawnThief(type, sx, sy, vx, vy, root.id, false);
    ABILITIES[type].onLaunch?.(this, t);
    this.emit({ type: 'launch', id: t.id, thief: type });
    this.setPhase('flying');
    return true;
  }

  private tap(x: number, y: number): boolean {
    const t = this.tappableThief;
    if (!t) return false;
    if (!ABILITIES[t.type].onTap(this, t, x, y)) return false;
    t.abilityUsed = true;
    return true;
  }

  private getaway(): boolean {
    if (!this.canGetaway) return false;
    this.setPhase('resolving');
    return true;
  }

  // ---------------------------------------------------------------- stepping

  update(): void {
    if (this.phase === 'ended') return;

    for (const e of this.entities.values()) {
      if (e.removed) continue;
      if (e.kind === 'thief') ABILITIES[e.type].update?.(this, e);
      else if (e.kind === 'bomb' && this.step >= e.explodeAt) {
        const p = e.body.getPosition();
        this.removeEntity(e);
        this.explode(p.x, p.y, BOMB_EXPLOSION, e.cause, 0);
      }
    }

    this.world.step(DT, 8, 3);

    const contacts = this.contacts;
    this.contacts = [];
    for (const c of contacts) this.handleContact(c);
    this.processBreaks();
    this.checkLoot();
    this.updateThieves();
    this.cullOutOfBounds();
    this.updatePhase();
    this.step++;
  }

  drainEvents(): SimEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  /** Headless replay: apply each input at its recorded step until the level ends. */
  static replay(level: LevelData, inputs: Input[], maxSteps = 20000): Simulation {
    const sim = new Simulation(level);
    const sorted = [...inputs].sort((a, b) => a.step - b.step);
    let i = 0;
    while (sim.phase !== 'ended' && sim.step < maxSteps) {
      while (i < sorted.length && sorted[i].step <= sim.step) {
        const { step: _s, ...cmd } = sorted[i++];
        sim.apply(cmd as InputCommand);
      }
      sim.update();
      sim.drainEvents();
    }
    return sim;
  }

  /** Compact fingerprint of world state, for determinism checks. */
  hash(): string {
    let h = 0;
    for (const e of this.entities.values()) {
      if (e.removed) continue;
      const p = e.body.getPosition();
      h = (h * 31 + Math.round(p.x * 1000) * 7 + Math.round(p.y * 1000) * 13 + e.id) | 0;
    }
    return `${this.step}:${this.liveScore}:${h}`;
  }

  // ---------------------------------------------------------------- construction

  private add<T extends Entity>(e: T): T {
    e.body.setUserData(e);
    this.entities.set(e.id, e);
    return e;
  }

  private createGround(): void {
    const body = this.world.createBody({ type: 'static', position: { x: this.widthM / 2, y: this.groundYM + 5 } });
    body.createFixture({ shape: new Box(this.widthM / 2 + 30, 5), friction: 0.9 });
    this.add({ kind: 'ground', id: this.nextId++, body, cause: null, removed: false });
  }

  private createBlock(type: MaterialId, x: number, y: number, wPx: number, hPx: number, angle: number, isStatic?: boolean): BlockEntity {
    const mat = MATERIALS[type];
    const st = isStatic ?? mat.defaultStatic ?? false;
    const body = this.world.createBody({ type: st ? 'static' : 'dynamic', position: { x, y }, angle });
    body.createFixture({
      shape: new Box(toM(wPx) / 2, toM(hPx) / 2),
      density: mat.density, friction: mat.friction, restitution: mat.restitution,
    });
    return this.add({
      kind: 'block', id: this.nextId++, body, cause: null, removed: false,
      material: type, mat, health: mat.health, maxHealth: mat.health, w: wPx, h: hPx,
      lastDamageCause: null, breaking: false,
    });
  }

  private createLoot(type: LootEntity['type'], x: number, y: number, value: number, bonus: boolean): LootEntity {
    const s = LOOT_SHAPES[type];
    const body = this.world.createBody({ type: 'dynamic', position: { x, y } });
    body.createFixture({
      shape: s.kind === 'circle' ? new Circle(s.r) : new Box(s.hw, s.hh),
      density: 0.6, friction: 0.6, restitution: 0.2,
    });
    return this.add({ kind: 'loot', id: this.nextId++, body, cause: null, removed: false, type, value, bonus });
  }

  spawnThief(type: ThiefType, x: number, y: number, vx: number, vy: number, cause: number | null, abilityUsed: boolean): ThiefEntity {
    const ab = ABILITIES[type];
    const body = this.world.createBody({ type: 'dynamic', position: { x, y }, bullet: true, angularDamping: 0.8 });
    body.createFixture({ shape: new Circle(THIEF_RADIUS), density: ab.density, friction: 0.5, restitution: ab.restitution });
    body.setLinearVelocity({ x: vx, y: vy });
    const t = this.add<ThiefEntity>({
      kind: 'thief', id: this.nextId++, body, cause, removed: false, type, abilityUsed, landed: false,
      launchStep: this.step, slowSteps: 0, magnetUntil: 0, nearLootId: null, nearLootDist: Infinity,
    });
    this.emit({ type: 'spawn', id: t.id });
    return t;
  }

  spawnBomb(x: number, y: number, vx: number, vy: number, cause: number | null): BombEntity {
    const body = this.world.createBody({ type: 'dynamic', position: { x, y }, bullet: true });
    body.createFixture({ shape: new Circle(0.28), density: 2, friction: 0.6, restitution: 0.2 });
    body.setLinearVelocity({ x: vx, y: vy });
    const b = this.add<BombEntity>({ kind: 'bomb', id: this.nextId++, body, cause, removed: false, explodeAt: this.step + BOMB_FUSE_STEPS });
    this.emit({ type: 'spawn', id: b.id });
    return b;
  }

  private removeEntity(e: Entity): void {
    if (e.removed) return;
    e.removed = true;
    this.world.destroyBody(e.body);
    this.entities.delete(e.id);
    this.emit({ type: 'remove', id: e.id });
  }

  // ---------------------------------------------------------------- contacts and damage

  private onBeginContact(contact: Contact): void {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const a = fa.getBody().getUserData() as Entity | null;
    const b = fb.getBody().getUserData() as Entity | null;
    if (!a || !b) return;
    const wm = contact.getWorldManifold(null);
    if (!wm) return;
    const ba = a.body;
    const bb = b.body;
    const p = wm.points[0] ?? ba.getPosition();
    const va = ba.getLinearVelocityFromWorldPoint(p);
    const vb = bb.getLinearVelocityFromWorldPoint(p);
    const approach = Math.abs((vb.x - va.x) * wm.normal.x + (vb.y - va.y) * wm.normal.y);
    const ma = ba.isDynamic() ? ba.getMass() : Infinity;
    const mb = bb.isDynamic() ? bb.getMass() : Infinity;
    const reduced = ma === Infinity ? mb : mb === Infinity ? ma : (ma * mb) / (ma + mb);
    this.contacts.push({ a, b, impulse: reduced * approach, x: p.x, y: p.y });
  }

  private handleContact(c: PendingContact): void {
    const { a, b, impulse } = c;
    if (a.removed || b.removed) return;

    for (const [self, other] of [[a, b], [b, a]] as const) {
      if (self.kind === 'thief') {
        if (impulse > LAND_IMPULSE && (other.kind === 'block' || other.kind === 'ground')) self.landed = true;
        ABILITIES[self.type].onCollide?.(this, self, other, impulse);
      }
    }

    if (impulse > IMPACT_EVENT_IMPULSE) {
      const kindOf = (e: Entity): ImpactKind => (e.kind === 'block' ? e.material : e.kind);
      const primary = a.kind === 'block' ? a : b.kind === 'block' ? b : a.kind === 'thief' ? a : b;
      this.emit({
        type: 'impact', x: c.x, y: c.y, strength: impulse, kind: kindOf(primary),
        thiefId: a.kind === 'thief' ? a.id : b.kind === 'thief' ? b.id : undefined,
      });
    }

    if (this.settling) return;

    if (impulse > CAUSE_IMPULSE) this.propagateCause(a, b);

    for (const [self, other] of [[a, b], [b, a]] as const) {
      if (self.kind !== 'block') continue;
      const m = self.mat;
      if (impulse <= m.impactThreshold) continue;
      this.damage(self, (impulse - m.impactThreshold) * m.impactMult, other.cause ?? self.cause);
    }
  }

  /** The faster body hands its cause to the slower one. Thieves keep their launch cause forever. */
  private propagateCause(a: Entity, b: Entity): void {
    const sa = a.body.getLinearVelocity().length();
    const sb = b.body.getLinearVelocity().length();
    const [from, to] = sa >= sb ? [a, b] : [b, a];
    if (from.cause == null || to.kind === 'thief' || to.kind === 'ground' || !to.body.isDynamic()) return;
    to.cause = from.cause;
  }

  private damage(block: BlockEntity, amount: number, cause: number | null): void {
    if (block.breaking || block.removed || block.maxHealth === Infinity || amount <= 0) return;
    block.health -= amount;
    block.lastDamageCause = cause;
    this.emit({ type: 'damage', id: block.id, ratio: Math.max(0, block.health / block.maxHealth) });
    if (block.health <= 0) {
      block.breaking = true;
      this.breakQueue.push(block);
    }
  }

  private processBreaks(): void {
    // Breaks can trigger explosions, which can queue more breaks.
    for (let i = 0; i < this.breakQueue.length; i++) this.breakBlock(this.breakQueue[i]);
    this.breakQueue.length = 0;
  }

  private breakBlock(block: BlockEntity): void {
    if (block.removed) return;
    const p = block.body.getPosition().clone();
    const rec = this.combo.record(block.lastDamageCause, this.step);
    const base = block.mat.points;
    this.award('breaks', base, rec.mult);
    this.broken[block.material] = (this.broken[block.material] ?? 0) + 1;
    const v = block.body.getLinearVelocity();
    this.emit({ type: 'break', id: block.id, material: block.material, x: p.x, y: p.y, angle: block.body.getAngle(), vx: v.x, vy: v.y, points: Math.round(base * rec.mult), mult: rec.mult });
    if (rec.extended) this.emit({ type: 'chain', count: rec.count, mult: rec.mult, x: p.x, y: p.y });

    // Whatever this block was holding up now falls because of this break.
    for (let ce = block.body.getContactList(); ce; ce = ce.next ?? null) {
      if (!ce.contact.isTouching()) continue;
      const other = ce.other?.getUserData() as Entity | null;
      if (!other || other.removed || other.kind === 'thief' || other.kind === 'ground' || !other.body.isDynamic()) continue;
      other.cause = rec.id;
      other.body.setAwake(true);
    }
    this.removeEntity(block);
    if (block.mat.explodes) this.explode(p.x, p.y, block.mat.explodes, rec.id, 0);
  }

  explode(x: number, y: number, spec: ExplosionSpec, cause: number | null, points: number): void {
    const rec = this.combo.record(cause, this.step);
    if (points) this.award('breaks', points, rec.mult);
    if (rec.extended) this.emit({ type: 'chain', count: rec.count, mult: rec.mult, x, y });
    this.emit({ type: 'explode', x, y, radius: spec.radius });

    const r = spec.radius;
    const hit = new Set<Entity>();
    this.world.queryAABB({ lowerBound: { x: x - r, y: y - r }, upperBound: { x: x + r, y: y + r } }, (f) => {
      const e = f.getBody().getUserData() as Entity | null;
      if (e && !e.removed && e.kind !== 'ground') hit.add(e);
      return true;
    });

    // Sort for determinism independent of broad-phase ordering.
    for (const e of [...hit].sort((m, n) => m.id - n.id)) {
      const aabb = e.body.getFixtureList()!.getAABB(0);
      const cx = Math.max(aabb.lowerBound.x, Math.min(x, aabb.upperBound.x));
      const cy = Math.max(aabb.lowerBound.y, Math.min(y, aabb.upperBound.y));
      const d = Math.hypot(cx - x, cy - y);
      if (d >= r) continue;
      const falloff = 1 - d / r;
      if (e.body.isDynamic()) {
        const q = e.body.getPosition();
        let dx = q.x - x;
        let dy = q.y - y - 0.3; // slight upward bias reads better
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const mag = spec.power * falloff * Math.sqrt(e.body.getMass());
        e.body.applyLinearImpulse({ x: dx * mag, y: dy * mag }, q, true);
        if (e.kind !== 'thief') e.cause = rec.id;
      }
      if (e.kind === 'block') this.damage(e, spec.damage * falloff * e.mat.blastMult, rec.id);
    }
  }

  private award(bucket: 'loot' | 'breaks', base: number, mult: number): void {
    this.score[bucket] += base;
    this.score.chainBonus += base * (mult - 1);
  }

  // ---------------------------------------------------------------- loot, thieves, phases

  /** Loot is stolen when a thief touches it, or when it is knocked down to the street. */
  private checkLoot(): void {
    for (const e of this.entities.values()) {
      if (e.kind !== 'loot' || e.removed) continue;
      for (let ce = e.body.getContactList(); ce; ce = ce.next ?? null) {
        if (!ce.contact.isTouching()) continue;
        const other = ce.other?.getUserData() as Entity | null;
        if (!other) continue;
        if (other.kind === 'thief') {
          this.collectLoot(e, other.cause);
          break;
        }
        if (other.kind === 'ground' && e.cause != null && !this.settling) {
          this.collectLoot(e, e.cause);
          break;
        }
      }
    }
  }

  private collectLoot(l: LootEntity, cause: number | null): void {
    const p = l.body.getPosition().clone();
    const rec = this.combo.record(cause, this.step);
    this.lootValue += l.value;
    this.lootCount++;
    if (l.bonus) this.bonusCollected++;
    this.award('loot', l.value, rec.mult);
    this.emit({ type: 'loot', id: l.id, lootType: l.type, x: p.x, y: p.y, value: l.value, points: Math.round(l.value * rec.mult), mult: rec.mult });
    if (rec.extended) this.emit({ type: 'chain', count: rec.count, mult: rec.mult, x: p.x, y: p.y });
    this.removeEntity(l);
  }

  private updateThieves(): void {
    for (const e of this.entities.values()) {
      if (e.kind !== 'thief' || e.removed) continue;
      const p = e.body.getPosition();
      const speed = e.body.getLinearVelocity().length();

      for (const l of this.entities.values()) {
        if (l.kind !== 'loot' || l.removed) continue;
        const q = l.body.getPosition();
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < e.nearLootDist) {
          e.nearLootDist = d;
          e.nearLootId = l.id;
        }
      }

      e.slowSteps = e.landed && speed < THIEF_REST_SPEED && e.magnetUntil === 0 ? e.slowSteps + 1 : 0;
      if (e.slowSteps > THIEF_REST_STEPS || this.step - e.launchStep > MAX_THIEF_STEPS) this.finishThief(e);
    }
  }

  private finishThief(t: ThiefEntity): void {
    const near = t.nearLootId != null ? this.entities.get(t.nearLootId) : undefined;
    if (near && !near.removed && t.nearLootDist < 1.6) {
      const q = near.body.getPosition();
      this.emit({ type: 'nearMiss', x: q.x, y: q.y });
    }
    this.emit({ type: 'thiefDone', id: t.id });
    this.removeEntity(t);
  }

  private cullOutOfBounds(): void {
    for (const e of this.entities.values()) {
      if (e.removed || e.kind === 'ground') continue;
      const p = e.body.getPosition();
      if (p.x > -20 && p.x < this.widthM + 20 && p.y < this.groundYM + 20) continue;
      if (e.kind === 'thief') this.finishThief(e);
      else if (e.kind === 'loot' && e.cause != null) this.collectLoot(e, e.cause);
      else this.removeEntity(e);
    }
  }

  private activeThieves(): number {
    let n = 0;
    for (const e of this.entities.values()) if (e.kind === 'thief' && !e.removed) n++;
    return n;
  }

  private updatePhase(): void {
    const allLoot = this.lootRemaining === 0;
    if (this.phase === 'flying' && this.activeThieves() === 0) {
      this.setPhase(allLoot || this.queue.length === 0 ? 'resolving' : 'ready');
    } else if (this.phase === 'ready' && allLoot) {
      this.setPhase('resolving');
    }
    if (this.phase === 'resolving') {
      this.resolveSteps++;
      if ((this.resolveSteps > 30 && this.isSettled()) || this.resolveSteps > RESOLVE_TIMEOUT_STEPS) this.end();
    }
  }

  private isSettled(): boolean {
    for (const e of this.entities.values()) {
      if (e.removed || e.kind === 'ground') continue;
      if (e.kind === 'bomb' || e.kind === 'thief') return false;
      if (e.body.isDynamic() && e.body.isAwake() && e.body.getLinearVelocity().length() > 0.15) return false;
    }
    return true;
  }

  private setPhase(phase: Phase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    if (phase === 'resolving') this.resolveSteps = 0;
    this.emit({ type: 'phase', phase });
  }

  private end(): void {
    const win = this.lootValue >= this.required;
    const thiefBonus = win ? this.queue.length * UNUSED_THIEF_BONUS : 0;
    const loot = Math.round(this.score.loot);
    const breaks = Math.round(this.score.breaks);
    const chainBonus = Math.round(this.score.chainBonus);
    const score = loot + breaks + chainBonus + thiefBonus;
    const style = this.level.stars.style;
    let styleMet = false;
    if (style.type === 'max_thieves') styleMet = this.thievesUsed <= style.value;
    else if (style.type === 'combo') styleMet = this.combo.maxMultiplier >= style.value;
    else if (style.type === 'no_break') styleMet = !this.broken[style.material];
    else if (style.type === 'bonus_loot') {
      styleMet = this.bonusCollected >= this.level.loot.filter((l) => l.bonus).length;
    }
    this.result = {
      win, score, breakdown: { loot, breaks, chainBonus, thiefBonus },
      stars: [win, win && score >= this.level.stars.score, win && styleMet],
      thievesUsed: this.thievesUsed, thievesLeft: this.queue.length,
      maxMultiplier: this.combo.maxMultiplier, lootValue: this.lootValue, lootCount: this.lootCount, required: this.required, steps: this.step,
      broken: { ...this.broken }, thiefTypes: [...this.launched],
    };
    this.setPhase('ended');
    this.emit({ type: 'end', result: this.result });
  }
}

