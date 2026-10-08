import { LAUNCH_SPEED_PER_PX, MAX_PULL_PX, PPM, THIEF_RADIUS } from './constants';

/**
 * Slingshot math shared by the renderer and the simulation, so the thief launches from
 * exactly where the player let go of it.
 * A pull (dx, dy) is the thief's offset from the slingshot's rest point, in world px.
 */
export function clampPull(dx: number, dy: number): { dx: number; dy: number; len: number; tension: number } {
  const len = Math.hypot(dx, dy);
  if (len > MAX_PULL_PX) {
    dx = (dx / len) * MAX_PULL_PX;
    dy = (dy / len) * MAX_PULL_PX;
  }
  const l = Math.min(len, MAX_PULL_PX);
  return { dx, dy, len: l, tension: l / MAX_PULL_PX };
}

/** Launch velocity (m/s) for a pull: opposite to the pull, proportional to its length. */
export const pullToVelocity = (dx: number, dy: number) => ({ vx: -dx * LAUNCH_SPEED_PER_PX, vy: -dy * LAUNCH_SPEED_PER_PX });

/** Where the thief sits for a pull, in px. It slides along the street rather than sinking into it. */
export function pullPosition(anchorX: number, anchorY: number, dx: number, dy: number, groundY: number): { x: number; y: number } {
  return { x: anchorX + dx, y: Math.min(anchorY + dy, groundY - THIEF_RADIUS * PPM - 2) };
}

/** Launch angle in degrees above horizontal, for the on-screen readout. */
export const pullAngle = (dx: number, dy: number) => Math.round((Math.atan2(dy, -dx) * 180) / Math.PI);
