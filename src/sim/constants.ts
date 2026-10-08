/** Pixels per meter. Level JSON is authored in pixels; the simulation runs in meters. */
export const PPM = 32;
export const STEP_HZ = 60;
export const DT = 1 / STEP_HZ;
export const GRAVITY = 10;

/** Top launch speed (m/s). Fixed: recorded solutions and replays depend on it. */
export const MAX_LAUNCH_SPEED = 21.75;
/** How far the band stretches (world px). Longer = finer aim; speed per px is derived from it. */
export const MAX_PULL_PX = 190;
export const LAUNCH_SPEED_PER_PX = MAX_LAUNCH_SPEED / MAX_PULL_PX;
/** Releasing closer than this to the rest point cancels the shot. */
export const CANCEL_PULL_PX = 30;

/** Blocks are invulnerable and causes don't propagate while the level settles. */
export const SETTLE_STEPS = 45;
/** Two linked events this many steps apart still count as one chain (1.5s). */
export const CHAIN_WINDOW_STEPS = 90;

export const THIEF_RADIUS = 0.45;
export const UNUSED_THIEF_BONUS = 500;
export const MAX_THIEF_STEPS = 600;
export const RESOLVE_TIMEOUT_STEPS = 360;

export const DEFAULT_LEVEL_WIDTH = 1600;
export const DEFAULT_GROUND_Y = 620;
export const VIEW_W = 1280;
export const VIEW_H = 720;

export const toM = (px: number) => px / PPM;
export const toPx = (m: number) => m * PPM;
