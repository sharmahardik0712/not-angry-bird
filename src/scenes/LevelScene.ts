import Phaser from 'phaser';
import { levelById, levelIndex, LEVELS } from '../levels';
import { Effects } from '../render/Effects';
import { ensureBlockTexture, generateBackdrop, lootKey, thiefKey, type Expression } from '../render/textures';
import { clampPull, pullAngle, pullPosition, pullToVelocity } from '../sim/aim';
import {
  CANCEL_PULL_PX, DEFAULT_GROUND_Y, DEFAULT_LEVEL_WIDTH, DT, MAX_PULL_PX, PPM, THIEF_RADIUS, VIEW_H, VIEW_W, toM,
} from '../sim/constants';
import type { Entity } from '../sim/entities';
import { Simulation } from '../sim/Simulation';
import type { Input, InputCommand, LevelData, LevelResult, SimEvent, ThiefType } from '../sim/types';
import { sfx } from '../systems/Audio';
import { load, recordRun } from '../systems/Save';
import { C, N, hex, skinById } from '../ui/theme';
import { BANTER, textStyle } from '../ui/ui';
import type { HUDScene } from './HUDScene';

// Drawn a little larger than the physics circle so the crew reads at phone sizes.
const THIEF_PX = THIEF_RADIUS * 2 * PPM * 1.3;
const THIEF_TEX = 72;
const MAX_FRAME_DT = 0.1;
/**
 * Simulated seconds per real second. Physics is unchanged (fixed 1/60 s steps, same results,
 * replays still match); we just run more steps per frame so flights feel snappy, not floaty.
 */
const GAME_SPEED = 1.45;
const INTRO_MS = 1100;
/** Fork tips sit this far left/right and above the slingshot's rest point. */
const FORK = 22;
/** Pouch spring after release: stiff with one overshoot, so the band visibly snaps. */
const SPRING_K = 900;
const SPRING_D = 26;
/** Extra world left of x=0, so a full pull back from the slingshot stays on screen. */
const LEFT_PAD = 180;
/** Pressing this close to the loaded thief grabs it directly (it sits under your finger). */
const GRAB_RADIUS = 110;
/** Street shown below the ground line. Small: the street is not where the action is. */
const STREET = 44;

export type PlayMode = 'play' | 'watch' | 'demo';

export interface LevelStart {
  levelId?: string;
  /** play = normal; watch = replay your best run; demo = replay the shipped solution. */
  mode?: PlayMode;
}

/** sx/sy: the drag origin; dx/dy: current pull (thief offset from the rest point, px). */
interface Aim { sx: number; sy: number; dx: number; dy: number }
interface ThiefLook { expr: Expression; until: number }

export class LevelScene extends Phaser.Scene {
  sim!: Simulation;
  level!: LevelData;
  fx!: Effects;
  mode: PlayMode = 'play';

  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private trails = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();
  private looks = new Map<number, ThiefLook>();
  private magnetRings = new Map<number, Phaser.GameObjects.Arc>();
  private acc = 0;
  private aim: Aim | null = null;
  private pendingLaunch: { vx: number; vy: number; ox: number; oy: number; x: number; y: number } | null = null;
  private loaded!: Phaser.GameObjects.Image;
  private queueIcons: Phaser.GameObjects.Image[] = [];
  private bandBack!: Phaser.GameObjects.Graphics;
  private bandFront!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private aimLabel!: Phaser.GameObjects.Text;
  private tapBubble!: Phaser.GameObjects.Container;
  private hand?: Phaser.GameObjects.Container;
  private pouch = { x: 0, y: 0, vx: 0, vy: 0 };
  private atMax = false;
  private idle = { zoom: 1, x: 0, y: 0 };
  private widthPx = DEFAULT_LEVEL_WIDTH;
  private groundPx = DEFAULT_GROUND_Y;
  private followId: number | null = null;
  private lastStretch = 0;
  private ended = false;
  private introUntil = 0;
  private finaleDone = false;
  private script: Input[] | null = null;
  private introPop?: Phaser.Tweens.Tween;

  constructor() {
    super('Level');
  }

  get hud(): HUDScene {
    return this.scene.get('HUD') as HUDScene;
  }

  init(data: LevelStart): void {
    this.level = levelById(data.levelId ?? LEVELS[0].id) ?? LEVELS[0];
    this.mode = data.mode ?? 'play';
    const best = load().levels[this.level.id]?.bestInputs;
    this.script = this.mode === 'demo' ? [...(this.level.solution ?? [])] : this.mode === 'watch' ? [...(best ?? [])] : null;
    this.sprites = new Map();
    this.trails = new Map();
    this.looks = new Map();
    this.magnetRings = new Map();
    this.queueIcons = [];
    this.acc = 0;
    this.aim = null;
    this.pendingLaunch = null;
    this.followId = null;
    this.ended = false;
    this.finaleDone = false;
    this.hand = undefined;
  }

  create(): void {
    const l = this.level;
    this.sim = new Simulation(l);
    this.widthPx = l.width ?? DEFAULT_LEVEL_WIDTH;
    this.groundPx = l.groundY ?? DEFAULT_GROUND_Y;
    const bottom = this.groundPx + STREET;
    this.idle = this.frameContent(bottom);
    const top = bottom - VIEW_H / this.idle.zoom - 400; // headroom for high lobs

    const bgKey = `bg3-${this.widthPx}-${this.groundPx}`;
    generateBackdrop(this, bgKey, this.widthPx + LEFT_PAD, top, this.groundPx, bottom);
    this.add.image(-LEFT_PAD, top, bgKey).setOrigin(0, 0).setDepth(0);

    this.fx = new Effects(this);
    this.fx.shakeEnabled = load().settings.shake;

    this.drawSlingshot();
    if (this.mode === 'play' && load().settings.ghost) this.drawGhost();
    for (const e of this.sim.entities.values()) this.createSprite(e);
    this.loaded = this.add.image(l.slingshot.x, l.slingshot.y, thiefKey(this.sim.queue[0], 'idle')).setDisplaySize(THIEF_PX, THIEF_PX).setDepth(21);
    this.refreshQueue();
    this.tapBubble = this.makeTapBubble();

    // The camera holds one framing for the whole level: everything you need is always on screen.
    const cam = this.cameras.main;
    cam.setBounds(-LEFT_PAD, top, this.widthPx + LEFT_PAD, bottom - top);
    cam.setZoom(this.idle.zoom);
    cam.centerOn(this.idle.x, this.idle.y);
    this.introUntil = this.time.now + INTRO_MS;

    this.setupInput();
    this.scene.launch('HUD', { levelId: l.id, mode: this.mode });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop('HUD');
      this.scene.stop('Result');
    });

    // The thief hops into the pouch as the level opens.
    this.loaded.setScale(0);
    this.introPop = this.tweens.add({ targets: this.loaded, scaleX: THIEF_PX / THIEF_TEX, scaleY: THIEF_PX / THIEF_TEX, duration: 320, ease: 'Back.easeOut', delay: 250 });
    if (l.id === LEVELS[0].id && this.mode === 'play' && !load().levels[l.id]?.plays) this.time.delayedCall(INTRO_MS, () => this.showHand());
  }

  // ---------------------------------------------------------------- setup

  /** Tight framing around the slingshot (with room for a full pull) and everything worth stealing. */
  private frameContent(bottom: number): { zoom: number; x: number; y: number } {
    const l = this.level;
    let maxX = l.slingshot.x + 300, minY = l.slingshot.y;
    for (const b of l.blocks) { maxX = Math.max(maxX, b.x + b.w / 2); minY = Math.min(minY, b.y - b.h / 2); }
    for (const t of l.loot) { maxX = Math.max(maxX, t.x + 20); minY = Math.min(minY, t.y - 20); }
    const minX = Math.max(-LEFT_PAD, l.slingshot.x - MAX_PULL_PX - 40);
    maxX = Math.min(this.widthPx, maxX + 80);
    minY -= 110; // room for the HUD row
    const zoom = Phaser.Math.Clamp(Math.min(VIEW_W / (maxX - minX), VIEW_H / (bottom - minY)), 0.6, 1.3);
    return { zoom, x: (minX + maxX) / 2, y: bottom - VIEW_H / zoom / 2 };
  }

  /**
   * Slingshot in layers: back arm and back band sit behind the thief, front arm and front band
   * in front of it, so the thief reads as sitting *in* the pouch.
   */
  private drawSlingshot(): void {
    const { x, y } = this.level.slingshot;
    this.add.image(x, this.groundPx + 2, 'shadow').setDisplaySize(84, 16).setDepth(4);
    const wood = 0xc49a72, woodDark = 0xa57c58;
    const back = this.add.graphics().setDepth(5);
    back.fillStyle(woodDark).fillRoundedRect(x - 7, y + 10, 14, this.groundPx - y - 8, 7);
    back.lineStyle(12, woodDark).beginPath().moveTo(x, y + 18).lineTo(x - FORK, y - FORK).strokePath();
    back.fillStyle(woodDark).fillCircle(x - FORK, y - FORK, 6);
    const front = this.add.graphics().setDepth(24);
    front.lineStyle(12, wood).beginPath().moveTo(x + 1, y + 18).lineTo(x + FORK, y - FORK).strokePath();
    front.fillStyle(wood).fillCircle(x + FORK, y - FORK, 6);
    front.fillStyle(0xffffff, 0.3).fillCircle(x + FORK - 2, y - FORK - 2, 2.2);
    this.bandBack = this.add.graphics().setDepth(19);
    this.bandFront = this.add.graphics().setDepth(23);
    this.preview = this.add.graphics().setDepth(18);
    this.aimLabel = this.add.text(0, 0, '', textStyle(15, C.ink, 'bold', true)).setOrigin(0.5).setDepth(42).setVisible(false);
    this.pouch = { x, y, vx: 0, vy: 0 };
  }

  /**
   * Ghost trail: replay your best run headlessly (deterministic, so it's exact) and draw each
   * thief's flight path faintly. Shows what you did last time without giving the answer away.
   */
  private drawGhost(): void {
    const inputs = load().levels[this.level.id]?.bestInputs;
    if (!inputs?.length) return;
    const sim = new Simulation(this.level);
    const paths = new Map<number, { x: number; y: number }[]>();
    const sorted = [...inputs].sort((a, b) => a.step - b.step);
    let i = 0;
    while (sim.phase !== 'ended' && sim.step < 4000) {
      while (i < sorted.length && sorted[i].step <= sim.step) {
        const { step: _s, ...cmd } = sorted[i++];
        sim.apply(cmd as InputCommand);
      }
      sim.update();
      sim.drainEvents();
      if (sim.step % 3) continue;
      for (const e of sim.entities.values()) {
        if (e.kind !== 'thief') continue;
        const p = e.body.getPosition();
        const path = paths.get(e.id) ?? [];
        path.push({ x: p.x * PPM, y: p.y * PPM });
        paths.set(e.id, path);
      }
    }
    const g = this.add.graphics().setDepth(3);
    // Lilac and small, so it never reads as the aim preview.
    for (const path of paths.values()) path.forEach((p, k) => { if (k % 3 === 0) g.fillStyle(N.lilac, 0.35).fillCircle(p.x, p.y, 2.5); });
  }

  private createSprite(e: Entity): void {
    if (e.kind === 'ground') return;
    const p = e.body.getPosition();
    let img: Phaser.GameObjects.Image;
    if (e.kind === 'block') {
      img = this.add.image(0, 0, ensureBlockTexture(this, e.material, e.w, e.h)).setDepth(10);
    } else if (e.kind === 'loot') {
      img = this.add.image(0, 0, lootKey(e.type)).setDepth(12);
      const f = e.body.getFixtureList()!.getAABB(0);
      img.setDisplaySize((f.upperBound.x - f.lowerBound.x) * PPM * (e.type === 'cash' ? 1.15 : 1.1), (f.upperBound.y - f.lowerBound.y) * PPM * 1.1);
    } else if (e.kind === 'thief') {
      img = this.add.image(0, 0, thiefKey(e.type, 'fly')).setDisplaySize(THIEF_PX, THIEF_PX).setDepth(20);
      const color = hex(skinById(load().skin).colors[e.type]);
      this.trails.set(e.id, this.fx.trail(img, color));
    } else {
      img = this.add.image(0, 0, 'bomb').setDisplaySize(0.28 * 2.6 * PPM, 0.28 * 2.6 * PPM).setDepth(20);
      this.tweens.add({ targets: img, tint: N.coral, yoyo: true, repeat: -1, duration: 120 });
    }
    img.setPosition(p.x * PPM, p.y * PPM).setRotation(e.body.getAngle());
    this.sprites.set(e.id, img);
  }

  private refreshQueue(): void {
    for (const i of this.queueIcons) i.destroy();
    this.queueIcons = [];
    const { x } = this.level.slingshot;
    this.sim.queue.slice(1).forEach((t, i) => {
      // Waiting crew stands right of the slingshot (out of the pull) and breathes gently.
      const img = this.add.image(x + 46 + i * 38, this.groundPx - THIEF_PX / 2, thiefKey(t, 'idle')).setDisplaySize(THIEF_PX, THIEF_PX).setDepth(18).setOrigin(0.5, 0.5);
      const base = img.scaleY;
      this.tweens.add({ targets: img, scaleY: base * 1.05, scaleX: img.scaleX * 0.97, yoyo: true, repeat: -1, duration: 900 + i * 130, ease: 'Sine.easeInOut' });
      this.queueIcons.push(img);
    });
    const next = this.sim.queue[0];
    if (this.loaded) {
      this.loaded.setVisible(!!next);
      if (next) this.loaded.setTexture(thiefKey(next, 'idle')).setPosition(this.level.slingshot.x, this.level.slingshot.y);
    }
  }

  private makeTapBubble(): Phaser.GameObjects.Container {
    const t = this.add.text(0, 0, 'Tap!', textStyle(16, '#ffffff')).setOrigin(0.5);
    const g = this.add.graphics();
    g.fillStyle(N.coral, 1).fillRoundedRect(-t.width / 2 - 12, -15, t.width + 24, 30, 15);
    g.fillTriangle(-6, 14, 6, 14, 0, 22);
    return this.add.container(0, 0, [g, t]).setDepth(43).setVisible(false);
  }

  /** First-ever play only: a hand shows the drag-back motion until the first launch. */
  private showHand(): void {
    if (this.hand || this.sim.thievesUsed > 0) return;
    const { x, y } = this.level.slingshot;
    const g = this.add.graphics();
    g.fillStyle(N.ink, 0.18).fillCircle(0, 0, 22);
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, 13);
    g.lineStyle(3, N.ink, 0.6).strokeCircle(0, 0, 13);
    this.hand = this.add.container(x, y, [g]).setDepth(44);
    this.tweens.add({ targets: this.hand, x: x - 130, y: y + 60, duration: 900, ease: 'Sine.easeInOut', yoyo: false, repeat: -1, repeatDelay: 500 });
  }

  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      if (this.time.now < this.introUntil) { this.skipIntro(); }
      if (this.ended || this.script) return;
      if (this.sim.phase === 'flying' && this.sim.tappableThief) {
        this.sim.apply({ type: 'tap', x: toM(p.worldX), y: toM(p.worldY) });
        return;
      }
      if (this.sim.phase !== 'ready' || this.sim.queue.length === 0 || this.pendingLaunch) return;
      const { x, y } = this.level.slingshot;
      // Near the thief: grab it, so it sits under your finger. Anywhere else: it follows your drag.
      const near = Math.hypot(p.worldX - x, p.worldY - y) < GRAB_RADIUS;
      this.aim = near ? { sx: x, sy: y, dx: 0, dy: 0 } : { sx: p.worldX, sy: p.worldY, dx: 0, dy: 0 };
      this.updatePull(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updatePull(p));
    const release = () => {
      if (!this.aim) return;
      const { dx, dy } = this.aim;
      this.aim = null;
      this.lastStretch = 0;
      this.atMax = false;
      if (Math.hypot(dx, dy) < CANCEL_PULL_PX) return; // released in the cancel zone
      const { x, y } = this.level.slingshot;
      const at = pullPosition(x, y, dx, dy, this.groundPx);
      const { vx, vy } = pullToVelocity(dx, dy);
      this.pendingLaunch = { vx, vy, ox: toM(at.x - x), oy: toM(at.y - y), x: at.x, y: at.y };
      sfx.snap(Math.hypot(dx, dy) / MAX_PULL_PX);
      navigator.vibrate?.(14);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const kb = this.input.keyboard;
    kb?.on('keydown-SPACE', () => {
      if (this.script) return;
      const p = this.input.activePointer;
      if (this.sim.phase === 'flying') this.sim.apply({ type: 'tap', x: toM(p.worldX), y: toM(p.worldY) });
    });
    kb?.on('keydown-R', () => this.restart());
    kb?.on('keydown-ESC', () => this.toMenu());
    kb?.on('keydown-G', () => this.getaway());
  }

  private updatePull(p: Phaser.Input.Pointer): void {
    if (!this.aim) return;
    const pull = clampPull(p.worldX - this.aim.sx, p.worldY - this.aim.sy);
    this.aim.dx = pull.dx;
    this.aim.dy = pull.dy;
    if (Math.abs(pull.len - this.lastStretch) > 12 && pull.tension < 0.99) { sfx.stretch(pull.tension); this.lastStretch = pull.len; }
    // Full stretch: a tick and a tiny buzz, once per reach.
    if (pull.tension >= 0.99 && !this.atMax) { this.atMax = true; sfx.maxPull(); navigator.vibrate?.(8); }
    else if (pull.tension < 0.92) this.atMax = false;
  }

  /** Ends the opening beat now and puts the thief in the pouch straight away. */
  skipIntro(): void {
    this.introUntil = 0;
    if (this.introPop && !this.introPop.isFinished() && !this.introPop.isDestroyed()) this.introPop.complete();
    this.loaded.setDisplaySize(THIEF_PX, THIEF_PX);
    this.hud.hideIntro();
  }

  // ---------------------------------------------------------------- actions (also used by HUD/Result)

  restart(mode: PlayMode = 'play'): void {
    this.scene.restart({ levelId: this.level.id, mode });
  }

  toMenu(): void {
    this.scene.start('Menu');
  }

  getaway(): void {
    if (this.script) return;
    if (this.sim.apply({ type: 'getaway' })) sfx.win();
  }

  nextLevel(): void {
    const next = LEVELS[levelIndex(this.level.id) + 1];
    if (next) this.scene.restart({ levelId: next.id });
    else this.toMenu();
  }

  // ---------------------------------------------------------------- frame

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_DT);
    const intro = time < this.introUntil;
    if (!intro && this.pendingLaunch && this.sim.canLaunch) {
      const { vx, vy, ox, oy } = this.pendingLaunch;
      this.pendingLaunch = null;
      this.sim.apply({ type: 'launch', vx, vy, ox, oy });
      // Kick the pouch forward so the band snaps through the rest point and wobbles once.
      const { x: sx, y: sy } = this.level.slingshot;
      this.pouch.vx = (sx - this.pouch.x) * 16;
      this.pouch.vy = (sy - this.pouch.y) * 16;
    }

    // Fixed-step simulation; game speed, slow-mo and hit stop scale the time fed in, never the step size.
    const scale = this.fx.timeScale(time);
    if (!intro) this.acc += dt * scale * GAME_SPEED;
    while (this.acc >= DT) {
      while (this.script?.length && this.script[0].step <= this.sim.step) {
        const { step: _s, ...cmd } = this.script.shift()!;
        this.sim.apply(cmd as InputCommand);
      }
      this.sim.update();
      this.acc -= DT;
      for (const ev of this.sim.drainEvents()) this.onEvent(ev, time);
    }

    this.fx.updateDebris(dt * scale * GAME_SPEED);
    this.syncSprites(time);
    this.drawAim(dt, time);
    this.updateTapBubble();
    this.updateCamera(time);
  }

  private syncSprites(time: number): void {
    for (const [id, img] of this.sprites) {
      const e = this.sim.entities.get(id);
      if (!e) continue;
      const p = e.body.getPosition();
      img.setPosition(p.x * PPM, p.y * PPM);
      if (e.kind !== 'thief') { img.setRotation(e.body.getAngle()); continue; }

      const v = e.body.getLinearVelocity();
      const speed = v.length();
      if (!e.landed && speed > 3) {
        // In flight: face the direction of travel (mirrored, never upside down) with a gentle stretch.
        const s = 1 + Math.min(speed / 60, 0.2);
        img.setFlipX(v.x < 0);
        img.setRotation(Phaser.Math.Clamp(Math.atan2(v.y, Math.abs(v.x)), -0.7, 0.7) * (v.x < 0 ? -1 : 1));
        img.setDisplaySize(THIEF_PX * s, THIEF_PX / s);
      } else if (!this.tweens.isTweening(img)) {
        img.setFlipX(false);
        img.setRotation(e.body.getAngle());
        img.setDisplaySize(THIEF_PX, THIEF_PX);
      }
      if (e.landed) this.trails.get(id)?.stop();
      const look = this.looks.get(id);
      const expr: Expression = look && time < look.until ? look.expr : e.landed ? 'idle' : 'fly';
      img.setTexture(thiefKey(e.type, expr));
      this.magnetRings.get(id)?.setPosition(img.x, img.y);
    }
  }

  private updateTapBubble(): void {
    const t = this.sim.tappableThief;
    const img = t && this.sprites.get(t.id);
    const show = !!img && this.sim.phase === 'flying' && !this.script;
    this.tapBubble.setVisible(show);
    if (show) this.tapBubble.setPosition(img!.x, img!.y - THIEF_PX - 8).setScale(1 + Math.sin(this.time.now / 90) * 0.06);
  }

  private drawAim(dt: number, time: number): void {
    const { x, y } = this.level.slingshot;
    const tipL = { x: x - FORK, y: y - FORK };
    const tipR = { x: x + FORK, y: y - FORK };
    this.bandBack.clear();
    this.bandFront.clear();
    this.preview.clear();
    this.aimLabel.setVisible(false);

    const aiming = !!this.aim && this.loaded.visible;
    const pull = aiming ? clampPull(this.aim!.dx, this.aim!.dy) : { dx: 0, dy: 0, len: 0, tension: 0 };
    const cancel = aiming && pull.len < CANCEL_PULL_PX;
    const at = this.pendingLaunch ?? pullPosition(x, y, pull.dx, pull.dy, this.groundPx);

    // Pouch: glued to the thief while aiming, otherwise a damped spring back to rest.
    const pouch = this.pouch;
    if (aiming || this.pendingLaunch) {
      pouch.x = at.x; pouch.y = at.y; pouch.vx = 0; pouch.vy = 0;
    } else {
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        pouch.vx += (-SPRING_K * (pouch.x - x) - SPRING_D * pouch.vx) * h;
        pouch.vy += (-SPRING_K * (pouch.y - y) - SPRING_D * pouch.vy) * h;
        pouch.x += pouch.vx * h;
        pouch.y += pouch.vy * h;
      }
    }

    // Bands thin out and warm up as they stretch.
    const t = pull.tension;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x8a6a4f), Phaser.Display.Color.ValueToColor(N.coral), 100, Math.round(t * 100));
    const color = cancel ? N.faint : Phaser.Display.Color.GetColor(col.r, col.g, col.b);
    const width = 6 - t * 3;
    const dirX = pouch.x - x, dirY = pouch.y - y;
    const dl = Math.hypot(dirX, dirY) || 1;
    const behind = Math.min(1, dl / 20) * THIEF_PX * 0.32; // the pouch wraps the back of the thief
    const px = pouch.x + (dirX / dl) * behind, py = pouch.y + (dirY / dl) * behind;
    this.bandBack.lineStyle(width, color).beginPath().moveTo(tipL.x, tipL.y).lineTo(px, py).strokePath();
    this.bandBack.fillStyle(0x6e5340).fillCircle(px, py, 5);
    this.bandFront.lineStyle(width, color).beginPath().moveTo(px, py).lineTo(tipR.x, tipR.y).strokePath();

    if (!this.loaded.visible || this.tweens.isTweening(this.loaded)) return;
    const type = this.sim.queue[0];
    if (!aiming) {
      if (!this.pendingLaunch) {
        // Resting in the pouch: a slow breath so the scene never looks frozen.
        const b = Math.sin(time / 420) * 0.03;
        this.loaded.setPosition(x, y).setRotation(0).setFlipX(false).setDisplaySize(THIEF_PX * (1 - b * 0.5), THIEF_PX * (1 + b)).setTexture(thiefKey(type, 'idle'));
      }
      return;
    }
    if (this.hand) { this.hand.destroy(); this.hand = undefined; }

    // Thief sits in the pouch, leans toward the shot, squashes with tension, trembles at full stretch.
    const tremble = t >= 0.99 ? (Math.random() - 0.5) * 1.6 : 0;
    this.loaded.setPosition(at.x + tremble, at.y + tremble * 0.5);
    this.loaded.setTexture(thiefKey(type, cancel ? 'idle' : 'fly'));
    this.loaded.setRotation(cancel ? 0 : Math.atan2(-pull.dy, -pull.dx) * 0.25);
    this.loaded.setDisplaySize(THIEF_PX * (1 + t * 0.12), THIEF_PX * (1 - t * 0.1));

    if (cancel) {
      this.aimLabel.setText('Release to cancel').setColor(C.muted).setPosition(x, y - 62).setVisible(true);
      return;
    }

    // Arc preview with evenly spaced dots: the first third of the flight only.
    const v = pullToVelocity(pull.dx, pull.dy);
    const vx = v.vx * PPM, vy = v.vy * PPM, g = this.sim.gravity * PPM;
    const flight = vy < 0 ? (2 * -vy) / g : 0.6;
    const tMax = Math.max(0.25, flight * 0.33);
    const spacing = 22;
    let travelled = spacing * 0.6, lx = at.x, ly = at.y, k = 0;
    for (let s = 0; s <= tMax; s += 1 / 240) {
      const qx = at.x + vx * s, qy = at.y + vy * s + 0.5 * g * s * s;
      travelled += Math.hypot(qx - lx, qy - ly);
      lx = qx; ly = qy;
      if (travelled < spacing) continue;
      travelled = 0;
      const f = s / tMax;
      this.preview.fillStyle(N.ink, 0.5 * (1 - f) + 0.08).fillCircle(qx, qy, 5.5 - f * 3);
      if (++k > 30) break;
    }

    this.aimLabel.setText(`${Math.round(t * 100)}%  ·  ${pullAngle(pull.dx, pull.dy)}°`)
      .setColor(t >= 0.99 ? C.coral : C.ink).setPosition(at.x, at.y - THIEF_PX - 14).setVisible(true);
  }

  /** Static framing; only drifts if a thief leaves the view (a high lob), then settles back. */
  private updateCamera(time: number): void {
    const cam = this.cameras.main;
    const zoom = this.idle.zoom + this.fx.kickZoom(time);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, zoom, this.fx.kickZoom(time) ? 0.5 : 0.15));
    let cx = this.idle.x, cy = this.idle.y;
    const target = this.followId != null ? this.sprites.get(this.followId) : undefined;
    if (target) {
      const halfW = VIEW_W / this.idle.zoom / 2, halfH = VIEW_H / this.idle.zoom / 2;
      if (target.y < this.idle.y - halfH + 60) cy = target.y + halfH - 60;
      if (target.x > this.idle.x + halfW - 60) cx = target.x - halfW + 60;
    }
    cam.centerOn(Phaser.Math.Linear(cam.midPoint.x, cx, 0.1), Phaser.Math.Linear(cam.midPoint.y, cy, 0.1));
  }

  // ---------------------------------------------------------------- juice

  private look(id: number, expr: Expression, ms: number): void {
    this.looks.set(id, { expr, until: this.time.now + ms });
  }

  private cheerAll(ms: number): void {
    for (const e of this.sim.entities.values()) if (e.kind === 'thief') this.look(e.id, 'cheer', ms);
    for (const q of this.queueIcons) this.tweens.add({ targets: q, y: q.y - 10, yoyo: true, duration: 160, ease: 'Sine.easeOut' });
  }

  /** World point → HUD (screen) point. */
  private toScreen(wx: number, wy: number): { x: number; y: number } {
    const v = this.cameras.main.worldView;
    const z = this.cameras.main.zoom;
    return { x: (wx - v.x) * z, y: (wy - v.y) * z };
  }

  private onEvent(ev: SimEvent, now: number): void {
    const px = (m: number) => m * PPM;
    switch (ev.type) {
      case 'spawn': {
        const e = this.sim.entities.get(ev.id);
        if (e) this.createSprite(e);
        break;
      }
      case 'launch':
        this.followId = ev.id;
        sfx.launch();
        this.hud.onLaunch();
        this.say(ev.id, BANTER[ev.thief]);
        this.refreshQueue();
        this.loaded.setVisible(false);
        break;
      case 'ability':
        sfx.ability(ev.thief);
        this.abilityFx(ev.id, ev.thief, px(ev.x), px(ev.y), px(ev.tx), px(ev.ty));
        break;
      case 'impact': {
        sfx.impact(ev.kind, ev.strength);
        if (ev.strength > 18) this.fx.shake(ev.strength / 110);
        if (ev.strength > 30) { this.fx.hitStop(now, Math.min(80, 30 + ev.strength)); this.fx.kick(0.02); }
        if (ev.thiefId != null && ev.strength > 4) {
          this.look(ev.thiefId, 'hit', 650);
          const img = this.sprites.get(ev.thiefId);
          if (img) {
            this.tweens.add({ targets: img, displayWidth: THIEF_PX * 1.25, displayHeight: THIEF_PX * 0.8, duration: 70, yoyo: true });
            if (ev.kind === 'ground' || ev.strength > 8) this.fx.dust(px(ev.x), px(ev.y), Math.min(14, 4 + ev.strength / 3));
          }
        }
        break;
      }
      case 'damage': {
        const img = this.sprites.get(ev.id);
        if (img) {
          const c = Math.round(175 + 80 * ev.ratio);
          img.setTint(Phaser.Display.Color.GetColor(c, c, c));
        }
        break;
      }
      case 'break': {
        // The block is already gone from the sim; its sprite still knows its size (texture = block px).
        const img = this.sprites.get(ev.id);
        if (img) this.fx.crumble(img.texture.key, img.x, img.y, ev.angle, px(ev.vx), px(ev.vy), img.width, img.height);
        this.fx.burst(ev.material, px(ev.x), px(ev.y), ev.material === 'glass' ? 18 : 8);
        sfx.breakSound(ev.material);
        break;
      }
      case 'explode':
        this.fx.explosion(px(ev.x), px(ev.y), px(ev.radius));
        this.fx.shake(1);
        this.fx.hitStop(now, 70);
        this.fx.kick(0.05);
        sfx.explosion();
        break;
      case 'loot': {
        const img = this.sprites.get(ev.id);
        this.fx.coins(px(ev.x), px(ev.y), ev.lootType === 'idol' ? 20 : 10);
        sfx.coin(ev.mult);
        // The loot itself flies up into its slot in the HUD.
        if (img) this.hud.collectLoot(ev.id, img.texture.key, this.toScreen(img.x, img.y), img.displayWidth * this.cameras.main.zoom);
        this.cheerAll(700);
        if (!this.finaleDone && this.sim.lootValue >= this.sim.required) this.finale(now, px(ev.x), px(ev.y));
        break;
      }
      case 'chain':
        sfx.combo(ev.count);
        this.fx.badge(px(ev.x), px(ev.y) - 30, `×${ev.mult % 1 ? ev.mult.toFixed(1) : ev.mult}`, ev.count >= 3 ? N.coral : N.lilac);
        if (ev.count === 3) this.fx.slowMo(now, 800, 0.35);
        if (ev.count >= 3) this.fx.kick(0.015 + Math.min(ev.count, 8) * 0.003);
        this.cheerAll(800);
        break;
      case 'nearMiss':
        sfx.nearMiss();
        this.fx.popup(px(ev.x), px(ev.y) - 40, 'So close!', C.coral, 26);
        break;
      case 'remove': {
        const img = this.sprites.get(ev.id);
        if (img) {
          if (img.texture.key.startsWith('thief')) this.fx.poof(img.x, img.y);
          img.destroy();
        }
        const trail = this.trails.get(ev.id);
        if (trail) { trail.stop(); this.time.delayedCall(400, () => trail.destroy()); }
        this.trails.delete(ev.id);
        this.sprites.delete(ev.id);
        this.looks.delete(ev.id);
        this.magnetRings.get(ev.id)?.destroy();
        this.magnetRings.delete(ev.id);
        if (this.followId === ev.id) this.followId = this.firstThiefId();
        break;
      }
      case 'phase':
        if (ev.phase === 'ready') this.loadNext();
        if (ev.phase !== 'flying') this.followId = null;
        break;
      case 'end':
        this.finish(ev.result);
        break;
      case 'thiefDone':
        break;
    }
  }

  /** The moment the goal is met: a beat of slow motion and confetti. */
  private finale(now: number, x: number, y: number): void {
    this.finaleDone = true;
    this.fx.slowMo(now, 900, 0.3);
    this.fx.confetti(x, y - 20, 60);
    this.hud.goalMet();
  }

  private firstThiefId(): number | null {
    for (const e of this.sim.entities.values()) if (e.kind === 'thief') return e.id;
    return null;
  }

  private loadNext(): void {
    const next = this.sim.queue[0];
    if (!next) return;
    this.refreshQueue();
    const { x, y } = this.level.slingshot;
    // Hop from the line-up into the pouch.
    this.loaded.setVisible(true).setPosition(x + 46, this.groundPx - THIEF_PX / 2).setDisplaySize(THIEF_PX, THIEF_PX);
    this.tweens.add({ targets: this.loaded, x, duration: 300, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.loaded, y: y - 46, duration: 160, ease: 'Sine.easeOut',
      onComplete: () => this.tweens.add({ targets: this.loaded, y, duration: 140, ease: 'Bounce.easeOut' }) });
  }

  private abilityFx(id: number, t: ThiefType, x: number, y: number, tx: number, ty: number): void {
    this.look(id, 'cheer', 400);
    this.fx.ring(x, y, 34, N.panel);
    if (t === 'bouncer') {
      const ring = this.add.circle(tx, ty, 24, 0, 0).setStrokeStyle(3, N.coral, 0.8).setDepth(19);
      this.tweens.add({ targets: ring, scale: 0.2, alpha: 0, duration: 360, onComplete: () => ring.destroy() });
    } else if (t === 'magnet') {
      const ring = this.add.circle(x, y, 6.5 * PPM, N.sky, 0.08).setStrokeStyle(2, N.sky, 0.6).setDepth(19);
      this.tweens.add({ targets: ring, scale: { from: 1, to: 0.15 }, repeat: -1, duration: 500 });
      this.magnetRings.set(id, ring);
      this.time.delayedCall(2000 / GAME_SPEED, () => { ring.destroy(); this.magnetRings.delete(id); });
    }
    this.fx.poof(x, y);
  }

  private say(id: number, lines: string[]): void {
    const img = this.sprites.get(id);
    if (!img) return;
    const t = this.add.text(img.x, img.y - 34, Phaser.Utils.Array.GetRandom(lines), textStyle(16, C.ink, 'bold', true)).setOrigin(0.5).setDepth(41);
    this.tweens.add({
      targets: t, alpha: { from: 1, to: 0 }, duration: 800, ease: (k: number) => (k < 0.6 ? 0 : (k - 0.6) / 0.4),
      onUpdate: () => { if (img.active) t.setPosition(img.x, img.y - 36); },
      onComplete: () => t.destroy(),
    });
  }

  private finish(result: LevelResult): void {
    this.ended = true;
    this.aim = null;
    const rewards = this.mode === 'play' ? recordRun(this.level.id, result, this.sim.inputs) : null;
    const mid = this.cameras.main.midPoint;
    if (result.win && !this.finaleDone) this.fx.confetti(mid.x, mid.y, 60);
    this.hud.onEnd(result);
    this.time.delayedCall(result.win ? 650 : 850, () => {
      this.scene.launch('Result', { levelId: this.level.id, result, rewards, mode: this.mode });
    });
  }
}
