import { HeldModels } from '@platform';
import { defineClient, type Client, type Node } from '@platform/client';
import { sounds } from '@platform/client/kits';
import { WATER_TOP, WINDWARD } from './islands';
import { SCENE_MODELS } from './models';
import { UPWIND_VMG } from './sailing';
import { shared } from './shared';

/**
 * Each skipper's screen. The boats are the server's props and their camera is the vehicle's, and
 * the sea is the engine's own water; this draws the rest: the islands, marks and committee boat
 * (models, `tools/models.mjs`), the gusts' ripples drifting over the water (from where the server
 * says the gusts are), the laylines while beating upwind, and the wind's sound. (The wakes are
 * the server's props.)
 */

type Gust = [x: number, z: number, radius: number, strength: number];

let gusts: Gust[] = [];
let drift: [number, number] = [0, 4.4];
let gustsAt = 0;
let now = 0;
let wind: ReturnType<Client['audio']['loop']> | null = null;

/** Where the wind blows from, read off the gusts' drift (they go downwind). */
const windDir = () => Math.atan2(-drift[0], drift[1]);

// ---------------------------------------------------------------------------------------------
// Models drawn here

let placed = false;
const gustPool: Node[] = [];
const lullPool: Node[] = [];

/** A model as a node in the world, once its file has come (null until then). */
function make(client: Client, id: keyof typeof SCENE_MODELS): Node | null {
  const made = client.scene.item(id);
  if (!made) return null;
  client.scene.add(made.node);
  return made.node;
}

function placeScenery(client: Client): void {
  if (placed) return;
  const scenery = client.scene.item('rg_scenery');
  if (!scenery) return;
  client.scene.add(scenery.node);
  placed = true;
}

// ---------------------------------------------------------------------------------------------
// Gusts: a patch of dark ripples where each gust is (pale ones for a lull), carried on its drift.

// ---------------------------------------------------------------------------------------------
// Laylines: while this skipper is beating upwind, two dashed lines out from the windward mark at
// the best angle to the wind, swinging as it shifts. Sail up to one, tack, and you just make it.

let upwind = false;
const lines: Node[] = [];

function laylines(client: Client): void {
  while (lines.length < 2) {
    const n = make(client, 'rg_layline');
    if (!n) return;
    lines.push(n);
  }
  const d = windDir();
  lines.forEach((n, k) => {
    n.visible = upwind;
    if (!upwind) return;
    // Out from the mark, back along the heading a boat close-hauled on each tack would sail.
    const h = d + Math.PI + (k ? 1 : -1) * UPWIND_VMG;
    n.position.set(WINDWARD.x, WATER_TOP, WINDWARD.z);
    n.rotation.set(0, -h, 0);
  });
}

function patches(client: Client): void {
  const age = now - gustsAt;
  const d = windDir();
  let g = 0;
  let l = 0;
  for (const [gx, gz, r, s] of gusts) {
    const pool = s > 0 ? gustPool : lullPool;
    const k = s > 0 ? g++ : l++;
    while (pool.length <= k) {
      const n = make(client, s > 0 ? 'rg_gust' : 'rg_lull');
      if (!n) return;
      pool.push(n);
    }
    const node = pool[k];
    node.visible = true;
    node.position.set(gx + drift[0] * age, WATER_TOP + 0.08, gz + drift[1] * age);
    node.rotation.set(0, -d, 0);
    const size = r * Math.min(1.1, 0.7 + Math.abs(s) * 1.2);
    node.scale.set(size, 1, size);
  }
  for (let i = g; i < gustPool.length; i++) gustPool[i].visible = false;
  for (let i = l; i < lullPool.length; i++) lullPool[i].visible = false;
}

// ---------------------------------------------------------------------------------------------
// The wind's sound

function gustiness(client: Client): number {
  const cam = client.camera.position;
  const age = now - gustsAt;
  let s = 0;
  for (const [gx, gz, r, k] of gusts) {
    const dist = Math.hypot(gx + drift[0] * age - cam.x, gz + drift[1] * age - cam.z);
    if (dist < r) s += k * (1 - dist / r);
  }
  return s;
}

export default defineClient(shared, {
  kits: [...sounds.standard()],
  setup(client) {
    for (const [id, url] of Object.entries(SCENE_MODELS)) client.items.look(id, { icon: { gltf: url }, hold: { model: HeldModels.gltf(url) } });
    client.on('upwind', (data) => {
      upwind = data === true;
    });
    client.on('gusts', (data) => {
      const d = data as { drift?: [number, number]; gusts?: Gust[] };
      if (!Array.isArray(d?.gusts) || !Array.isArray(d.drift)) return;
      gusts = d.gusts;
      drift = d.drift;
      gustsAt = now;
    });
  },
  frame(client, dt) {
    now += dt;
    placeScenery(client);
    patches(client);
    laylines(client);
    const g = gustiness(client);
    wind ??= client.audio.loop('wind', { volume: 0.2 });
    wind.set({ volume: Math.min(0.7, 0.18 + g * 0.9), pitch: 1 + g * 0.3 });
  },
});
