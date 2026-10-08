import { CHAIN_WINDOW_STEPS } from './constants';

export interface ComboRecord {
  id: number;
  /** 0 = root (a launch), 1 = direct result of a root, 2+ = caused by an earlier event. */
  depth: number;
  chainId: number;
  /** Chained events in this chain so far. */
  count: number;
  mult: number;
  /** True when this event raised the chain's count. */
  extended: boolean;
}

/**
 * Causal combo tracking. Every scored event names the event that caused it.
 * An event extends its cause's chain when it is at least two links from a launch
 * and arrives within the window of that chain's last event. Direct thief hits keep
 * a chain alive but don't raise the multiplier, so planned chains beat brute force.
 */
export class ComboTracker {
  private events = new Map<number, { depth: number; chainId: number }>();
  private chains = new Map<number, { count: number; lastStep: number }>();
  private nextId = 1;
  maxMultiplier = 1;
  maxCount = 0;

  constructor(readonly windowSteps = CHAIN_WINDOW_STEPS) {}

  static multiplier(count: number): number {
    return 1 + 0.5 * count;
  }

  record(parent: number | null, step: number): ComboRecord {
    const id = this.nextId++;
    const p = parent != null ? this.events.get(parent) : undefined;
    const depth = p ? p.depth + 1 : 0;

    let chainId = id;
    let chain = p ? this.chains.get(p.chainId) : undefined;
    if (p && chain && step - chain.lastStep <= this.windowSteps) {
      chainId = p.chainId;
    } else {
      chain = { count: 0, lastStep: step };
      this.chains.set(id, chain);
    }

    const extended = chainId !== id && depth >= 2;
    if (extended) chain.count++;
    chain.lastStep = step;
    this.events.set(id, { depth, chainId });

    const count = chain.count;
    const mult = ComboTracker.multiplier(count);
    if (mult > this.maxMultiplier) this.maxMultiplier = mult;
    if (count > this.maxCount) this.maxCount = count;
    return { id, depth, chainId, count, mult, extended };
  }
}
