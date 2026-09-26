/**
 * A player's avatar: the body they wear in every game that doesn't dress its players itself, made
 * of choices (skin tone, hair, top, bottoms, shoes and their colours) and painted as a skin on
 * each screen. It travels as a short code (`avatarCode`): on the wire it's the name of the skin's
 * atlas (`avatar:<code>`), which every screen paints the same from the code alone.
 */
export interface Avatar {
  tone: number;
  hair: number;
  hairColor: number;
  eyes: number;
  top: number;
  topColor: number;
  bottom: number;
  bottomColor: number;
  shoes: number;
}

/** The choices, in the order the code keeps them. */
export const AVATAR_FIELDS = ['tone', 'hair', 'hairColor', 'eyes', 'top', 'topColor', 'bottom', 'bottomColor', 'shoes'] as const;

/** What each choice can be: names (for the locker) by index. */
export const AVATAR_OPTIONS: Record<keyof Avatar, readonly string[]> = {
  tone: ['Porcelain', 'Fair', 'Light', 'Tan', 'Olive', 'Brown', 'Deep', 'Ebony'],
  hair: ['Short', 'Long', 'Buzzed', 'Bun', 'Spiky', 'Bald', 'Curly', 'Side part'],
  hairColor: ['Black', 'Dark brown', 'Brown', 'Auburn', 'Ginger', 'Blond', 'Platinum', 'Grey', 'Pink', 'Blue'],
  eyes: ['Brown', 'Hazel', 'Green', 'Blue', 'Grey', 'Violet'],
  top: ['T-shirt', 'Hoodie', 'Jacket', 'Tank top', 'Tunic', 'Sweater'],
  topColor: CLOTH_NAMES(),
  bottom: ['Jeans', 'Shorts', 'Cargo pants', 'Joggers'],
  bottomColor: CLOTH_NAMES(),
  shoes: ['Black', 'White', 'Brown', 'Red', 'Blue', 'Green'],
};

function CLOTH_NAMES(): readonly string[] {
  return ['Teal', 'Red', 'Orange', 'Yellow', 'Green', 'Forest', 'Sky', 'Navy', 'Purple', 'Pink', 'White', 'Grey', 'Charcoal', 'Black', 'Denim', 'Tan'];
}

/** Colours (hex) for the choices that are colours. */
export const AVATAR_COLORS = {
  tone: [0xf6d7c3, 0xeec1a0, 0xe0a882, 0xc98d64, 0xb07a52, 0x8c5a3a, 0x6b4128, 0x4a2c1b],
  hairColor: [0x1c1714, 0x3b2619, 0x6a4424, 0x8e3b1f, 0xc2622a, 0xd9b45e, 0xe8e2cf, 0x8d8d8d, 0xe0709e, 0x3f6fd1],
  eyes: [0x4a2e1a, 0x7a5a2a, 0x3f7a3a, 0x3a6fb8, 0x6f7f8a, 0x7a4ab0],
  cloth: [0x2a8f8a, 0xc0392b, 0xe07b28, 0xe8c33a, 0x4caf50, 0x2e6b3a, 0x5aa9e6, 0x24346b, 0x7a4bb0, 0xe57fa8, 0xeeeeea, 0x8c9096, 0x3c4048, 0x1e1f24, 0x3d5f8f, 0xb99a6b],
  shoes: [0x222226, 0xe8e8e4, 0x6b4a2e, 0xb8322c, 0x2f5fb0, 0x3b7a3a],
};

/** The default avatar (the platform's classic look: teal tunic, dark hair). */
export const DEFAULT_AVATAR: Avatar = { tone: 2, hair: 0, hairColor: 1, eyes: 0, top: 4, topColor: 0, bottom: 0, bottomColor: 7, shoes: 0 };

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** An avatar as its code: a letter per choice (`a2019401070`). */
export function avatarCode(a: Avatar): string {
  return `a${AVATAR_FIELDS.map((f) => DIGITS[clampChoice(f, a[f])]).join('')}`;
}

/** An avatar from its code, or null if it isn't one (unknown choices come back as the first). */
export function parseAvatar(code: string | null | undefined): Avatar | null {
  if (typeof code !== 'string' || code.length !== AVATAR_FIELDS.length + 1 || code[0] !== 'a') return null;
  const out = { ...DEFAULT_AVATAR };
  for (let i = 0; i < AVATAR_FIELDS.length; i++) {
    const v = DIGITS.indexOf(code[i + 1]);
    if (v < 0) return null;
    out[AVATAR_FIELDS[i]] = clampChoice(AVATAR_FIELDS[i], v);
  }
  return out;
}

/** The atlas an avatar's skin is painted into on each screen (its skin is at [0, 0]). */
export function avatarAtlas(code: string): string {
  return `avatar:${code}`;
}

/** The avatar an atlas name is (`avatar:<code>`), or null. */
export function atlasAvatar(atlas: string | undefined): Avatar | null {
  return atlas?.startsWith('avatar:') ? parseAvatar(atlas.slice(7)) : null;
}

function clampChoice(f: keyof Avatar, v: number): number {
  const n = AVATAR_OPTIONS[f].length;
  return Number.isInteger(v) && v >= 0 && v < n ? v : 0;
}

/** A random avatar (a guest's first), from `rnd` (0..1). */
export function randomAvatar(rnd: () => number = Math.random): Avatar {
  const out = { ...DEFAULT_AVATAR };
  for (const f of AVATAR_FIELDS) out[f] = Math.floor(rnd() * AVATAR_OPTIONS[f].length);
  // (Mostly hair: bald is a choice, not a roll of the dice.)
  if (out.hair === 5 && rnd() < 0.8) out.hair = 0;
  return out;
}
