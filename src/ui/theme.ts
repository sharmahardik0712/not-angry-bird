import type { MaterialId, ThiefType } from '../sim/types';

/** Clean minimal palette: soft pastels, one ink color for text, flat shapes with soft shadows. */
export const C = {
  skyTop: '#FDF3EA',
  skyBottom: '#ECE3F7',
  far: '#EFE9F7',
  near: '#E6DEF2',
  ground: '#CDC1E2',
  groundLine: '#B8ABD4',
  ink: '#3D3553',
  muted: '#8A82A3',
  faint: '#B9B2CC',
  panel: '#FFFFFF',
  coral: '#FF8A80',
  sky: '#7EC8E3',
  mint: '#7FCFA0',
  sun: '#FFC773',
  lilac: '#B79CE6',
} as const;

export const hex = (s: string) => parseInt(s.replace('#', ''), 16);
export const N = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, hex(v)])) as Record<keyof typeof C, number>;

export const FONT = '"SF Pro Rounded", "Segoe UI Variable Display", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const MATERIAL_COLORS: Record<MaterialId, { base: string; accent: string }> = {
  wood: { base: '#EDBE8F', accent: '#C98F5C' },
  stone: { base: '#BDBBCF', accent: '#9794AE' },
  glass: { base: '#BFE6F5', accent: '#FFFFFF' },
  ice: { base: '#DDF3FA', accent: '#A9DCEB' },
  rubber: { base: '#C9A7E8', accent: '#A57FCB' },
  tnt: { base: '#FF8A80', accent: '#FFFFFF' },
  vault: { base: '#7D7A96', accent: '#FFD27A' },
  steel: { base: '#6E6A86', accent: '#5B5773' },
};

export interface Skin {
  id: string;
  name: string;
  /** Total stars needed to unlock. */
  stars: number;
  colors: Record<ThiefType, string>;
  mask: string;
}

/** Cosmetic crew color sets, unlocked by earning stars. Never affects gameplay. */
export const SKINS: Skin[] = [
  { id: 'classic', name: 'Classic', stars: 0, mask: '#3D3553', colors: { bouncer: '#FF8A80', bomber: '#8E8AA8', magnet: '#7EC8E3', splitter: '#7FCFA0' } },
  { id: 'sorbet', name: 'Sorbet', stars: 3, mask: '#5A3D5C', colors: { bouncer: '#FFB3C7', bomber: '#FFD6A5', magnet: '#CAFFBF', splitter: '#BDB2FF' } },
  { id: 'ocean', name: 'Ocean', stars: 6, mask: '#1F3B4D', colors: { bouncer: '#5FA8D3', bomber: '#2F6690', magnet: '#9AD1D4', splitter: '#62B6CB' } },
  { id: 'mono', name: 'Mono', stars: 9, mask: '#111111', colors: { bouncer: '#F2F2F2', bomber: '#9E9E9E', magnet: '#D6D6D6', splitter: '#BDBDBD' } },
  { id: 'sunset', name: 'Sunset', stars: 12, mask: '#4A2040', colors: { bouncer: '#FF7B54', bomber: '#B5446E', magnet: '#FFB26B', splitter: '#FFD56F' } },
  { id: 'gold', name: 'Gold Heist', stars: 18, mask: '#5C4310', colors: { bouncer: '#F6C453', bomber: '#E0A526', magnet: '#FFE08A', splitter: '#F2B705' } },
];

export const skinUnlocked = (skin: Skin, totalStars: number) => totalStars >= skin.stars;
export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];
