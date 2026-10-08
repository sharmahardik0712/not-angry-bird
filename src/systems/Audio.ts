import type { ImpactKind, MaterialId, ThiefType } from '../sim/types';

/**
 * Procedural sound effects via Web Audio. No files to download, and pitch can follow the combo.
 * Browsers require a user gesture before audio starts, so call `unlock()` from a pointer handler.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private recent: number[] = [];
  enabled = true;
  volume = 0.7;

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Cap simultaneous one-shots so a 40-block collapse doesn't clip. */
  private budget(max = 14): boolean {
    if (!this.ctx || !this.enabled) return false;
    const now = this.ctx.currentTime;
    this.recent = this.recent.filter((t) => now - t < 0.12);
    if (this.recent.length >= max) return false;
    this.recent.push(now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master!);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, filter: BiquadFilterType, freq: number, gain: number, q = 1, freqTo?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  impact(kind: ImpactKind, strength: number): void {
    if (!this.budget()) return;
    const v = Math.min(1, strength / 40) * 0.5 + 0.08;
    switch (kind) {
      case 'wood': this.noise(0.09, 'bandpass', 520, v, 2); this.tone(150, 0.08, 'triangle', v * 0.6, 90); break;
      case 'stone': case 'vault': case 'steel': this.noise(0.12, 'lowpass', 300, v * 1.2); this.tone(85, 0.12, 'sine', v * 0.8, 50); break;
      case 'glass': case 'ice': this.noise(0.06, 'highpass', 3500, v * 0.6); this.tone(2400 + Math.random() * 900, 0.15, 'sine', v * 0.25); break;
      case 'rubber': this.tone(320, 0.22, 'sine', v * 0.7, 120); break;
      case 'thief': this.tone(230, 0.1, 'triangle', v * 0.6, 150); break;
      case 'tnt': this.noise(0.08, 'bandpass', 380, v, 2); break;
      default: this.noise(0.1, 'lowpass', 220, v * 0.8); break;
    }
  }

  breakSound(m: MaterialId): void {
    if (!this.budget()) return;
    if (m === 'wood') { this.noise(0.25, 'bandpass', 900, 0.45, 1.2, 300); this.tone(110, 0.15, 'square', 0.08, 60); }
    else if (m === 'stone' || m === 'vault') { this.noise(0.4, 'lowpass', 600, 0.6, 1, 80); this.tone(60, 0.3, 'sine', 0.3, 35); }
    else if (m === 'glass' || m === 'ice') {
      this.noise(0.3, 'highpass', 2500, 0.4);
      for (let i = 0; i < 4; i++) this.tone(1800 + Math.random() * 2400, 0.25, 'sine', 0.12, undefined, i * 0.03);
    } else this.noise(0.2, 'bandpass', 600, 0.4);
  }

  explosion(): void {
    if (!this.ctx || !this.enabled) return;
    this.noise(0.9, 'lowpass', 1400, 0.9, 0.7, 60);
    this.tone(70, 0.6, 'sine', 0.7, 28);
    this.noise(0.15, 'highpass', 2000, 0.3);
  }

  coin(mult: number): void {
    if (!this.budget(18)) return;
    const k = Math.pow(2, Math.min(12, (mult - 1) * 4) / 12);
    this.tone(988 * k, 0.08, 'square', 0.08);
    this.tone(1319 * k, 0.3, 'square', 0.08, undefined, 0.07);
  }

  combo(count: number): void {
    if (!this.ctx || !this.enabled) return;
    const semis = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = 523 * Math.pow(2, semis[Math.min(count, semis.length - 1)] / 12);
    this.tone(f, 0.18, 'sawtooth', 0.09);
    this.tone(f * 1.5, 0.22, 'triangle', 0.08, undefined, 0.05);
  }

  stretch(amount: number): void {
    if (!this.budget(3)) return;
    this.tone(120 + amount * 260, 0.05, 'triangle', 0.04);
  }

  /** Tick when the band hits full stretch. */
  maxPull(): void {
    if (!this.budget(3)) return;
    this.tone(1400, 0.04, 'triangle', 0.08);
    this.tone(2100, 0.05, 'sine', 0.05, undefined, 0.03);
  }

  /** Band snapping back after release; pitch rises with how hard it was pulled. */
  snap(tension: number): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(260 + tension * 220, 0.12, 'triangle', 0.14, 90);
    this.noise(0.06, 'bandpass', 1800 + tension * 1500, 0.2, 2);
  }

  launch(): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(180, 0.18, 'sawtooth', 0.12, 520);
    this.noise(0.35, 'bandpass', 500, 0.25, 1.5, 2400);
  }

  ability(t: ThiefType): void {
    if (!this.ctx || !this.enabled) return;
    if (t === 'bouncer') { this.tone(400, 0.14, 'square', 0.12, 1400); this.noise(0.1, 'highpass', 3000, 0.15); }
    else if (t === 'bomber') { this.tone(900, 0.04, 'square', 0.12); this.noise(1.0, 'bandpass', 4000, 0.08, 3); }
    else if (t === 'magnet') { for (let i = 0; i < 6; i++) this.tone(140 + (i % 2) * 30, 0.35, 'sine', 0.15, undefined, i * 0.33); }
    else for (let i = 0; i < 3; i++) this.tone(600 + i * 200, 0.08, 'square', 0.1, 300, i * 0.05);
  }

  fuseTick(): void {
    if (!this.budget(4)) return;
    this.tone(1500, 0.03, 'square', 0.05);
  }

  nearMiss(): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(440, 0.25, 'triangle', 0.12, 330);
  }

  win(): void {
    if (!this.ctx || !this.enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.6 : 0.16, 'square', 0.1, undefined, i * 0.11));
  }

  lose(): void {
    if (!this.ctx || !this.enabled) return;
    [392, 370, 349, 311].forEach((f, i) => this.tone(f, i === 3 ? 0.7 : 0.25, 'sawtooth', 0.08, i === 3 ? 250 : undefined, i * 0.28));
  }

  click(): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(700, 0.05, 'square', 0.06, 900);
  }

  star(i: number): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(784 * Math.pow(2, (i * 4) / 12), 0.35, 'triangle', 0.14);
  }
}

export const sfx = new Sfx();
