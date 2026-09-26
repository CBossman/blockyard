import type { Avatar } from '../avatar';
import type { CosmeticDef } from '../api/types';
import { avatarPixels } from '../render/avatar';

/** Texels of the skin atlas (it's 256 wide; the skin is at its top left). */
const ATLAS = 256;

/** Where each part's face is on the skin (x, y, width, height), seen from the front and from the back. */
const FACES = {
  front: { head: [8, 8, 8, 8], body: [20, 20, 8, 12], arm: [44, 20, 4, 12], leg: [4, 20, 4, 12] },
  back: { head: [24, 8, 8, 8], body: [32, 20, 8, 12], arm: [52, 20, 4, 12], leg: [12, 20, 4, 12] },
} as const;

/** Room above the head for a hat, and the drawing's size, in texels. */
const ABOVE = 8;
const W = 24;
const H = ABOVE + 32 + 1;

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};

/**
 * A flat picture of an avatar in what it wears (the locker's preview, a face on the home page): the
 * skin's front (or back) faces laid out as the figure stands, the hat and back item drawn as their
 * boxes seen straight on. `scale`: pixels to a texel.
 */
export function drawAvatar(canvas: HTMLCanvasElement, a: Avatar, wear: CosmeticDef[], opts: { back?: boolean; scale?: number } = {}) {
  const k = opts.scale ?? 8;
  canvas.width = W * k;
  canvas.height = H * k;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { albedo } = avatarPixels(a);
  const skin = new ImageData(64, 64);
  for (let y = 0; y < 64; y++) skin.data.set(albedo.subarray(y * ATLAS * 4, y * ATLAS * 4 + 64 * 4), y * 64 * 4);
  const src = document.createElement('canvas');
  src.width = src.height = 64;
  src.getContext('2d')!.putImageData(skin, 0, 0);
  const back = !!opts.back;
  const f = back ? FACES.back : FACES.front;
  const cx = W / 2;
  // A face of the skin at (x, y) in the drawing, mirrored for the left limbs (and, from behind, the lot).
  const face = (r: readonly number[], x: number, y: number, mirror: boolean) => {
    ctx.save();
    if (mirror !== back) {
      ctx.translate((x + r[2]) * k, y * k);
      ctx.scale(-1, 1);
      ctx.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, r[2] * k, r[3] * k);
    } else ctx.drawImage(src, r[0], r[1], r[2], r[3], x * k, y * k, r[2] * k, r[3] * k);
    ctx.restore();
  };
  // Boxes seen straight on (from behind, turned round), the far ones first.
  const boxes = (def: CosmeticDef | undefined, ox: number, oy: number, behindBody: boolean) => {
    if (!def?.model) return;
    const list = def.model.boxes.map((b) => {
      const x0 = Math.min(b.from[0], b.to[0]);
      const x1 = Math.max(b.from[0], b.to[0]);
      const z = Math.max(b.from[2], b.to[2]);
      return { b, x0: back !== behindBody ? -x1 : x0, x1: back !== behindBody ? -x0 : x1, z: back !== behindBody ? -z : z };
    });
    list.sort((p, q) => p.z - q.z);
    for (const { b, x0, x1 } of list) {
      const y0 = Math.min(b.from[1], b.to[1]);
      const y1 = Math.max(b.from[1], b.to[1]);
      ctx.fillStyle = shade(b.color, 1);
      ctx.fillRect((ox + x0) * k, (oy - y1) * k, (x1 - x0) * k, (y1 - y0) * k);
      // A lit top edge, a shaded bottom one.
      ctx.fillStyle = shade(b.color, 1.18);
      ctx.fillRect((ox + x0) * k, (oy - y1) * k, (x1 - x0) * k, Math.max(1, k * 0.35));
      ctx.fillStyle = shade(b.color, 0.72);
      ctx.fillRect((ox + x0) * k, (oy - y0) * k - Math.max(1, k * 0.35), (x1 - x0) * k, Math.max(1, k * 0.35));
    }
  };
  const hat = wear.find((w) => w.slot === 'hat');
  const pack = wear.find((w) => w.slot === 'back');
  // The back item hangs behind the body (seen from the front, only what sticks out shows).
  if (!back) boxes(pack, cx, ABOVE + 8 + 12 * 0.28, true);
  face(f.leg, cx - 4, ABOVE + 20, false);
  face(f.leg, cx, ABOVE + 20, true);
  face(f.body, cx - 4, ABOVE + 8, false);
  face(f.arm, cx - 8, ABOVE + 8, false);
  face(f.arm, cx + 4, ABOVE + 8, true);
  face(f.head, cx - 4, ABOVE, false);
  if (back) boxes(pack, cx, ABOVE + 8 + 12 * 0.28, true);
  boxes(hat, cx, ABOVE, false);
}

/** Just the face (the head's front, and the hat seen straight on), for the home page. */
export function drawFace(canvas: HTMLCanvasElement, a: Avatar, hat: CosmeticDef | undefined, scale = 4) {
  const full = document.createElement('canvas');
  drawAvatar(full, a, hat ? [hat] : [], { scale });
  canvas.width = 12 * scale;
  canvas.height = 12 * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // The head (8 across, under the hat's room) with a little of the hat above it.
  ctx.drawImage(full, (W / 2 - 6) * scale, (ABOVE - 4) * scale, 12 * scale, 12 * scale, 0, 0, 12 * scale, 12 * scale);
}
