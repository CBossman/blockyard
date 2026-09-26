import { Canvas, clamp, paintBox, part, px, type Px, type S } from '../art';
import { AVATAR_COLORS, type Avatar } from '../avatar';

/** A colour's ramp of seven levels, darkest first (the base at 3), for the painter's light. */
function ramp(hex: number): number[] {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return [0.52, 0.66, 0.82, 1, 1.1, 1.2, 1.3].map((k) => {
    const c = (v: number) => clamp(Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1) * 1.1), 0, 255);
    return (c(r) << 16) | (c(g) << 8) | c(b);
  });
}

/**
 * Paint an avatar's skin (the 64x64 Minecraft layout, at the canvas's top left): the head with its
 * face and hair, the top on the body and arms, the bottoms and shoes on the legs. The model mirrors
 * the right arm and leg for the left.
 */
export function paintAvatar(cv: Canvas, a: Avatar) {
  const skin = ramp(AVATAR_COLORS.tone[a.tone]);
  const hair = ramp(AVATAR_COLORS.hairColor[a.hairColor]);
  const eye = ramp(AVATAR_COLORS.eyes[a.eyes]);
  const top = ramp(AVATAR_COLORS.cloth[a.topColor]);
  const bottom = ramp(AVATAR_COLORS.cloth[a.bottomColor]);
  const shoe = ramp(AVATAR_COLORS.shoes[a.shoes]);
  const white = ramp(0xf2f2ee);
  const leather = ramp(0x6b4a2e);
  const skinPx = (s: S) => px(skin, 3 + (s.rnd(11) < 0.12 ? -0.3 : 0));
  const cloth = (pal: number[], s: S, h = 0.25) => px(pal, 3 + (s.rnd(5) - 0.5) * 0.35).h(h);

  // Head: skin, the face on the front, the hair over it.
  paintBox(cv, 0, 0, part(0, 0, 8, 8, 8), (s) => {
    const h = hairAt(a.hair, s);
    if (h !== null) return px(hair, 3 + (s.rnd(3) - 0.5) * 0.9 + (a.hair === 2 ? 0.4 : 0)).h(0.5 + h);
    if (s.f === 'front') {
      const c = s.c;
      if (s.r === 3 && a.hair !== 5 && (c === 1 || c === 2 || c === 5 || c === 6)) return px(hair, 2).h(0.2);
      if (s.r === 4) {
        if (c === 1 || c === 6) return px(white, 3);
        if (c === 2 || c === 5) return px(eye, 2);
      }
      if (s.r === 5 && (c === 3 || c === 4)) return px(skin, 2);
      if (s.r === 6 && (c === 3 || c === 4)) return px(skin, 1.4);
    }
    return skinPx(s);
  });

  // Body: the top (and the waistband of the bottoms under it).
  paintBox(cv, 0, 0, part(16, 16, 8, 12, 4), (s) => {
    const front = s.f === 'front';
    const c = s.side() ? s.c : -1;
    if (s.iy === 11 && a.top !== 4) return a.top === 1 || a.top === 5 ? cloth(top, s, 0.35).dl(-0.6) : px(bottom, 2.4).h(0.3);
    switch (a.top) {
      case 0: // T-shirt: a crew neck.
        if (front && s.r === 0 && (c === 3 || c === 4)) return skinPx(s);
        return cloth(top, s);
      case 1: // Hoodie: the hood down the back, drawstrings, a pocket.
        if (s.f === 'back' && s.r <= 2) return cloth(top, s, 0.5).dl(-0.5);
        if (front && (c === 2 || c === 5) && s.r >= 1 && s.r <= 4) return px(white, s.r === 4 ? 2 : 2.8).h(0.4);
        if (front && s.r >= 7 && s.r <= 9 && c >= 1 && c <= 6) return cloth(top, s, s.r === 7 || c === 1 || c === 6 ? 0.45 : 0.3).dl(-0.4);
        return cloth(top, s);
      case 2: // Jacket: open, a shirt under it, a collar.
        if (front && (c === 3 || c === 4)) return px(white, s.r === 0 ? 2 : 3).h(0.1);
        if (s.r === 0 && s.f !== 'top') return cloth(top, s, 0.5).dl(-0.5);
        return cloth(top, s, 0.35);
      case 3: // Tank top: bare shoulders, a scoop neck.
        if (front && s.r <= 1 && c >= 2 && c <= 5) return skinPx(s);
        if (s.f === 'top' && (s.c <= 1 || s.c >= 6)) return skinPx(s);
        return cloth(top, s);
      case 4: // Tunic: a leather sash from the shoulder to the hip, a belt.
        if (s.iy === 11) return px(leather, 2.6).h(0.4);
        if ((front || s.f === 'back') && Math.abs((front ? c : 7 - c) - s.r * 0.6 - 0.5) < 0.9) return px(leather, 3).h(0.45);
        return cloth(top, s);
      default: // Sweater: knit rows, a ribbed hem.
        if (s.iy >= 10) return cloth(top, s, 0.35).dl(s.c % 2 ? -0.5 : 0);
        return cloth(top, s).dl(s.r % 2 ? -0.35 : 0);
    }
  });

  // Arms: sleeves, the hands (and the tunic's bracers).
  paintBox(cv, 0, 0, part(40, 16, 4, 12, 4), (s) => {
    const y = s.iy;
    if (s.f === 'bottom' || y >= 11) return skinPx(s);
    switch (a.top) {
      case 0:
        return y <= 3 ? cloth(top, s, 0.3).dl(y === 3 ? -0.4 : 0) : skinPx(s);
      case 3:
        return skinPx(s);
      case 4:
        if (y <= 4) return cloth(top, s);
        if (y >= 7 && y <= 9) return px(leather, 3).h(0.35);
        return skinPx(s);
      default:
        // Long sleeves, their cuffs darker.
        return cloth(top, s, 0.3).dl(y >= 9 ? -0.5 : 0);
    }
  });

  // Legs: the bottoms, and shoes.
  paintBox(cv, 0, 0, part(0, 16, 4, 12, 4), (s) => {
    const y = s.iy;
    if (y >= 10 || s.f === 'bottom') return px(shoe, s.f === 'front' && y === 11 ? 4 : 3 + (s.rnd(2) - 0.5) * 0.3).h(0.4);
    switch (a.bottom) {
      case 1: // Shorts.
        if (y <= 5) return cloth(bottom, s).dl(y === 5 ? -0.4 : 0);
        return y === 9 ? px(white, 3) : skinPx(s);
      case 2: // Cargo pants: a pocket on the outside of the thigh.
        if (s.f === 'right' && y >= 4 && y <= 6) return cloth(bottom, s, 0.45).dl(y === 4 ? -0.5 : -0.2);
        return cloth(bottom, s);
      case 3: // Joggers: cuffed at the ankle.
        return cloth(bottom, s).dl(y === 9 ? -0.6 : 0);
      default: // Jeans: an outer seam.
        return cloth(bottom, s).dl(s.f === 'right' && s.c === 1 ? 0.5 : 0);
    }
  });
}

/**
 * Hair over a head texel, as a raise (its height over the skin), or null where there's none. `s`:
 * the head's texel (x across from its right, y down from the top, z from the face back).
 */
function hairAt(style: number, s: S): number | null {
  if (style === 5) return s.f === 'top' ? null : null;
  const { f, r, c } = s;
  const top = f === 'top';
  const back = f === 'back';
  const front = f === 'front';
  const side = f === 'left' || f === 'right';
  switch (style) {
    case 1: // Long: past the ears, down the back.
      if (top || back) return 0.1;
      if (front) return r <= 1 || ((c === 0 || c === 7) && r <= 5) ? 0 : null;
      return r <= 6 || (side && s.z > 4) ? 0 : null;
    case 2: // Buzzed.
      if (top) return 0;
      return r === 0 && !front ? 0 : front && r === 0 ? 0 : null;
    case 3: // A bun at the back.
      if (back && r >= 1 && r <= 3 && c >= 2 && c <= 5) return 0.6;
      if (top || (back && r <= 4)) return 0.1;
      if (front) return r <= 1 ? 0 : null;
      return r <= 2 ? 0 : null;
    case 4: // Spiky: a jagged fringe.
      if (top) return s.rnd(9) * 0.8;
      if (front) return r <= 1 || (r === 2 && c % 2 === 0) ? 0.2 : null;
      if (back) return r <= 3 || (r === 4 && c % 2 === 1) ? 0.2 : null;
      return r <= 2 || (r === 3 && c % 2 === 0) ? 0.2 : null;
    case 6: // Curly: fuller, lumpy.
      if (top) return s.n1(1.6, 4) * 0.9;
      if (front) return r <= 1 || ((c <= 1 || c >= 6) && r <= 3) ? s.n1(1.6, 4) * 0.6 : null;
      return r <= 3 || (back && r <= 5) ? s.n1(1.6, 4) * 0.6 : null;
    case 7: // Side part: swept over one eye.
      if (top) return s.x > 2.5 && s.x < 3.5 ? -0.3 : 0.1;
      if (front) return r <= 1 || (r === 2 && c <= 4) ? 0 : null;
      return r <= 2 || (back && r <= 3) ? 0 : null;
    default: // Short.
      if (top) return 0.1;
      if (front) return r <= 1 || (r === 2 && (c === 0 || c === 7)) ? 0 : null;
      return r <= 2 || (back && r <= 3) ? 0 : null;
  }
}

/** An avatar's skin: a 256x256 atlas (as the art toolkit's canvases are), the skin at its top left. */
export function avatarPixels(a: Avatar): { albedo: Uint8Array; emissive: Uint8Array } {
  const cv = new Canvas();
  paintAvatar(cv, a);
  return cv.finish();
}

export type { Px };
