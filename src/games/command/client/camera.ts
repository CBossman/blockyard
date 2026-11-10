import type { Client } from '@platform/client';
import { FLOOR, HALF } from '../map';

/**
 * The strategy camera: looking down on the field at a slant (north up the screen), moved with the
 * keys or by pushing the mouse to a screen edge, dragged with the middle button, zoomed with the
 * wheel. The screen's camera is taken every frame (`client.camera.take`), so this works out the same
 * projection itself: where a point in the world lands on the screen (for the overlay), and which
 * spot of the ground is under the mouse.
 */

const PITCH = (55 * Math.PI) / 180;
const FOV = 50;
const MIN = 22;
const MAX = 150;

const START = 60;
export const cam = { x: 0, z: 0, dist: START, keys: new Set<string>(), mouse: null as { x: number; y: number } | null };
/** How far back the wheel wants the view (it eases there); how the keys are pushing it; the title screen's slow drift. */
let goal = START;
let vx = 0;
let vz = 0;
let drift = -1;

interface Basis {
  px: number;
  py: number;
  pz: number;
  rx: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  fx: number;
  fy: number;
  fz: number;
  focal: number;
  w: number;
  h: number;
}
let basis: Basis | null = null;

/** Is this spot on the screen, near enough (what's off it needn't be animated or spark)? */
export const inView = (x: number, z: number, pad = 0): boolean => Math.hypot(x - cam.x, z - cam.z) < cam.dist * 1.35 + pad;

export const zoom = (by: number) => (goal = Math.max(MIN, Math.min(MAX, goal * by)));

/** On the title screen the view wanders over the field; off it, it's back at its usual height. */
export function setDrift(on: boolean): void {
  if (on === drift >= 0) return;
  drift = on ? 0 : -1;
  cam.dist = goal = on ? 84 : START;
  vx = vz = 0;
}

/** The view moved by a drag of (dx, dy) screen pixels: the field follows the mouse. */
export function drag(dx: number, dy: number): void {
  const k = (cam.dist * Math.tan(((FOV / 2) * Math.PI) / 180) * 2) / window.innerHeight;
  cam.x -= dx * k;
  cam.z -= (dy * k) / Math.sin(PITCH);
}

export function lookAt(x: number, z: number): void {
  cam.x = x;
  // (A little below the point, so it sits in the middle of what the bottom panel leaves showing, at any zoom.)
  cam.z = z + cam.dist * 0.12;
}

export function frameCamera(client: Client, dt: number): void {
  const edge = 6;
  const m = cam.mouse;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const k = cam.keys;
  if (drift >= 0) {
    drift += dt;
    cam.x = Math.sin(drift * 0.045) * 58;
    cam.z = Math.cos(drift * 0.033) * 52 + 8;
  } else {
    // The wheel eases in, on the spot under the mouse (it stays under it, unless the mouse is on the panels).
    if (cam.dist !== goal) {
      const next = Math.abs(goal - cam.dist) < 0.02 ? goal : cam.dist + (goal - cam.dist) * Math.min(1, dt * 14);
      const g = m && m.y > 44 && m.y < h - 190 ? toGround(m.x, m.y) : null;
      if (g) {
        const f = next / cam.dist;
        cam.x = g.x - (g.x - cam.x) * f;
        cam.z = g.z - (g.z - cam.z) * f;
      }
      cam.dist = next;
    }
    // The keys and the screen's edge get it moving and let it come to rest, rather than start and stop dead.
    const speed = cam.dist * 1.1;
    const wantX = (k.has('KeyD') || k.has('ArrowRight') || (m && m.x > w - edge) ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') || (m && m.x < edge) ? 1 : 0);
    const wantZ = (k.has('KeyS') || k.has('ArrowDown') || (m && m.y > h - edge) ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') || (m && m.y < edge) ? 1 : 0);
    const ease = Math.min(1, dt * 11);
    vx += (wantX * speed - vx) * ease;
    vz += (wantZ * speed - vz) * ease;
    if (Math.abs(vx) < 0.02) vx = 0;
    if (Math.abs(vz) < 0.02) vz = 0;
    cam.x += vx * dt;
    cam.z += vz * dt;
  }
  cam.x = Math.max(-HALF + 6, Math.min(HALF - 6, cam.x));
  cam.z = Math.max(-HALF + 6, Math.min(HALF - 2, cam.z));
  const p = { x: cam.x, y: FLOOR + cam.dist * Math.sin(PITCH), z: cam.z + cam.dist * Math.cos(PITCH) };
  // (The sun's shadows over the ground on screen, whose middle is a little beyond what the camera looks at.)
  client.camera.take({ position: p, target: { x: cam.x, y: FLOOR, z: cam.z }, fov: FOV, shadows: { at: { x: cam.x, y: FLOOR, z: cam.z - cam.dist * 0.2 }, radius: cam.dist * 1.45 } });
  let fx = cam.x - p.x;
  let fy = FLOOR - p.y;
  let fz = cam.z - p.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  basis = { px: p.x, py: p.y, pz: p.z, rx, rz, ux: -rz * fy, uy: rz * fx - rx * fz, uz: rx * fy, fx, fy, fz, focal: h / 2 / Math.tan(((FOV / 2) * Math.PI) / 180), w, h };
}

/** The patch of ground the screen shows (its middle and size, roughly), for the minimap. */
export function view(): { x: number; z: number; w: number; h: number } | null {
  const a = toGround(0, 0);
  const b = toGround(window.innerWidth, window.innerHeight);
  const c = toGround(window.innerWidth / 2, window.innerHeight / 2);
  if (!a || !b || !c) return null;
  return { x: c.x, z: c.z, w: Math.abs(b.x - a.x), h: Math.abs(b.z - a.z) };
}

/** Where a world point lands on the screen (null: behind the camera). */
export function toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
  const b = basis;
  if (!b) return null;
  const dx = x - b.px;
  const dy = y - b.py;
  const dz = z - b.pz;
  const cz = dx * b.fx + dy * b.fy + dz * b.fz;
  if (cz < 0.1) return null;
  return { x: b.w / 2 + ((dx * b.rx + dz * b.rz) / cz) * b.focal, y: b.h / 2 - ((dx * b.ux + dy * b.uy + dz * b.uz) / cz) * b.focal };
}

/** The point on the ground under a screen point. */
export function toGround(sx: number, sy: number, y = FLOOR): { x: number; z: number } | null {
  const b = basis;
  if (!b) return null;
  const cx = (sx - b.w / 2) / b.focal;
  const cy = -(sy - b.h / 2) / b.focal;
  const dx = b.fx + b.rx * cx + b.ux * cy;
  const dy = b.fy + b.uy * cy;
  const dz = b.fz + b.rz * cx + b.uz * cy;
  if (dy > -1e-6) return null;
  const t = (y - b.py) / dy;
  return { x: b.px + dx * t, z: b.pz + dz * t };
}
