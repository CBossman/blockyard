import { FLOOR, HALF, MESAS, heightAt } from '../map';
import { cam, toGround, toScreen } from './camera';

/**
 * The fog of war on the field itself, as Blockilization draws its: a layer over the world, in the
 * world's place on the screen, dark where this side has never looked and veiled where it has looked
 * but doesn't see now. The field is cut into cells (`CELL` blocks); those this side sees (`eyes`,
 * from the server) are cleared and remembered as explored. Drawn small and blurred, so its edges are
 * soft, and only when the view or what's seen has changed; only the cells on the screen, in runs. It lies on the ground as it stands (over the hills and mesas, not under them), and
 * on past the field over the highlands round it, which take the shade of the field at their feet;
 * past their crest it is black, so nothing beyond the world's edge shows.
 */

const CELL = 5;
const N = Math.ceil((HALF * 2) / CELL);
let explored = new Uint8Array(N * N);
const seen = new Uint8Array(N * N);
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
const small = document.createElement('canvas');
// (Small and redrawn in bursts: quicker on the processor than queued for the graphics card.)
const sctx = small.getContext('2d', { willReadFrequently: true })!;
const SCALE = 0.25;
/** Spare pixels round the small picture, so the blur doesn't thin out at the screen's edges. */
const MARGIN = 12;
/** Goes up when what's seen changes. */
let version = 0;
let drawnKey = '';
const before = new Uint8Array(N * N);

export function mountFog(layer: HTMLElement): void {
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  layer.prepend(canvas);
  ctx = canvas.getContext('2d', { willReadFrequently: true })!;
}

/** A new match: nothing explored. */
export function resetFog(): void {
  explored = new Uint8Array(N * N);
  version++;
}

/** What this side sees now (x, z, radius, three numbers each), or everything. */
export function seeFog(all: boolean, eyes: number[]): void {
  if (all) {
    seen.fill(1);
    explored.fill(1);
    version++;
    return;
  }
  before.set(seen);
  seen.fill(0);
  for (let i = 0; i < eyes.length; i += 3) {
    const ex = eyes[i];
    const ez = eyes[i + 1];
    const r = eyes[i + 2];
    const i0 = Math.max(0, Math.floor((ex - r + HALF) / CELL));
    const i1 = Math.min(N - 1, Math.floor((ex + r + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((ez - r + HALF) / CELL));
    const j1 = Math.min(N - 1, Math.floor((ez + r + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let k = i0; k <= i1; k++) {
        const cx = k * CELL - HALF + CELL / 2;
        const cz = j * CELL - HALF + CELL / 2;
        if ((cx - ex) ** 2 + (cz - ez) ** 2 <= r * r) {
          seen[j * N + k] = 1;
          explored[j * N + k] = 1;
        }
      }
    }
  }
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] !== before[i]) {
      version++;
      break;
    }
  }
}

/** Whether a point is in sight (for hiding what's in the fog), or has been seen at all. */
export const inSight = (x: number, z: number) => seen[Math.floor((z + HALF) / CELL) * N + Math.floor((x + HALF) / CELL)] === 1;

/** How far past the field the fog is drawn (blocks), and where the highlands' crest is (black past it). */
const EXT = 150;
const CREST = HALF + 20;
const M = Math.ceil(((HALF + EXT) * 2) / CELL);
const CORNERS = (M + 1) * (M + 1);
const heights = new Float32Array(CORNERS);
let heightsDone = false;
const px = new Float32Array(CORNERS);
const py = new Float32Array(CORNERS);
const shades = new Uint8Array(M * M);

/** The top of the ground at a point: the hills, the mesas, the highlands' terraces (roughly). */
function groundY(x: number, z: number): number {
  const d = Math.max(Math.abs(x), Math.abs(z)) - (HALF - 2);
  if (d > 0) return FLOOR + Math.min(16, d * 0.55 + 1.5);
  const m = MESAS.find((s) => Math.hypot(s.x - x, s.z - z) < s.r);
  return FLOOR + Math.max(heightAt(x, z), m ? m.h : 0);
}

/** A cell's shade: 0 never seen, 1 seen once, 2 in sight now, 3 past the crest (black). */
function shadeOf(k: number, j: number): number {
  const cx = k * CELL - HALF - EXT + CELL / 2;
  const cz = j * CELL - HALF - EXT + CELL / 2;
  if (Math.max(Math.abs(cx), Math.abs(cz)) > CREST) return 3;
  const mk = Math.max(0, Math.min(N - 1, Math.floor((cx + HALF) / CELL)));
  const mj = Math.max(0, Math.min(N - 1, Math.floor((cz + HALF) / CELL)));
  const c = mj * N + mk;
  return seen[c] ? 2 : explored[c];
}

/** One run of cells in a row, as one shape: corners only where the ground bends (it's straight on the screen between). */
function run(j: number, from: number, to: number, g: number): void {
  const row = j * (M + 1);
  const below = row + M + 1;
  sctx.moveTo(px[row + from] - g, py[row + from] - g);
  for (let k = from + 1; k < to; k++) {
    const i = row + k;
    if (heights[i] - heights[i - 1] !== heights[i + 1] - heights[i]) sctx.lineTo(px[i], py[i] - g);
  }
  sctx.lineTo(px[row + to] + g, py[row + to] - g);
  sctx.lineTo(px[below + to] + g, py[below + to] + g);
  for (let k = to - 1; k > from; k--) {
    const i = below + k;
    if (heights[i] - heights[i - 1] !== heights[i + 1] - heights[i]) sctx.lineTo(px[i], py[i] + g);
  }
  sctx.lineTo(px[below + from] - g, py[below + from] + g);
  sctx.closePath();
}

/** Each frame: the fog, over the field (redrawn only if it would look any different). */
export function drawFog(show: boolean): void {
  if (!canvas) return;
  if (!show) {
    if (drawnKey) ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawnKey = '';
    return;
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const key = `${version}|${cam.x}|${cam.z}|${cam.dist}|${w}|${h}`;
  if (key === drawnKey) return;
  const edges = [toGround(0, 0), toGround(w, 0), toGround(0, h), toGround(w, h)];
  if (edges.some((p) => !p)) return;
  drawnKey = key;
  const sw = Math.ceil(w * SCALE);
  const sh = Math.ceil(h * SCALE);
  // (The canvas stays this small: the screen stretches it, smoothly, for nothing.)
  if (canvas.width !== sw || canvas.height !== sh) {
    canvas.width = sw;
    canvas.height = sh;
    small.width = sw + MARGIN * 2;
    small.height = sh + MARGIN * 2;
  }
  if (!heightsDone) {
    for (let j = 0; j <= M; j++) for (let k = 0; k <= M; k++) heights[j * (M + 1) + k] = groundY(k * CELL - HALF - EXT, j * CELL - HALF - EXT);
    heightsDone = true;
  }
  sctx.clearRect(0, 0, small.width, small.height);
  // Which cells can be on the screen (and a few more, for the hills that stand up into it).
  const xs = edges.map((p) => p!.x);
  const zs = edges.map((p) => p!.z);
  const cellOf = (v: number) => Math.max(0, Math.min(M - 1, Math.floor((v + HALF + EXT) / CELL)));
  const k0 = cellOf(Math.min(...xs) - CELL * 5);
  const k1 = cellOf(Math.max(...xs) + CELL * 5);
  const j0 = cellOf(Math.min(...zs) - CELL * 5);
  const j1 = cellOf(Math.max(...zs) + CELL * 5);
  for (let j = j0; j <= j1 + 1; j++) {
    for (let k = k0; k <= k1 + 1; k++) {
      const i = j * (M + 1) + k;
      const p = toScreen(k * CELL - HALF - EXT, heights[i], j * CELL - HALF - EXT);
      px[i] = p ? p.x * SCALE + MARGIN : NaN;
      py[i] = p ? p.y * SCALE + MARGIN : NaN;
    }
  }
  for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) shades[j * M + k] = shadeOf(k, j);
  // Three shades: past the crest (black), never seen (dark), seen once (a veil). Each one shape, filled once.
  for (const [shade, color] of [[3, 'rgb(6,10,16)'], [0, 'rgba(10,16,26,0.82)'], [1, 'rgba(10,16,26,0.34)']] as const) {
    sctx.beginPath();
    // (A touch bigger than the cells, so neighbours overlap and leave no seams.)
    const g = shade === 3 ? 1.5 : 0.35;
    for (let j = j0; j <= j1; j++) {
      let k = k0;
      while (k <= k1) {
        if (shades[j * M + k] !== shade) {
          k++;
          continue;
        }
        let last = k;
        while (last < k1 && shades[j * M + last + 1] === shade) last++;
        run(j, k, last + 1, g);
        k = last + 1;
      }
    }
    sctx.fillStyle = color;
    sctx.fill('nonzero');
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, sw, sh);
  ctx.filter = 'blur(4px)';
  ctx.drawImage(small, -MARGIN, -MARGIN);
  ctx.filter = 'none';
}
