// Probe: bakes Block Royale's minimap (src/games/blockroyale/client/minimap.png): the island seen from above,
// as the game builds it (terrain, trees, water, the landmarks), one pixel to 1.33 blocks.
//
//   node scripts/headless.mjs tests/headless/_minimap.ts
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { CENTER } from '../../src/games/blockroyale/island';
import { launch } from './_harness';

const EXTENT = 170;
const SIZE = 256;

function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const COLORS: Record<string, [number, number, number]> = {
  grass_block: [112, 168, 78],
  dirt: [134, 100, 70],
  podzol: [110, 84, 52],
  sand: [226, 212, 156],
  gravel: [140, 138, 134],
  water: [58, 140, 208],
  stone: [128, 128, 132],
  cobblestone: [120, 120, 122],
  mossy_cobblestone: [96, 124, 96],
  andesite: [140, 140, 142],
  stone_bricks: [140, 140, 146],
  bricks: [160, 92, 80],
  oak_leaves: [62, 124, 52],
  birch_leaves: [112, 160, 72],
  spruce_leaves: [40, 94, 58],
  oak_log: [92, 66, 38],
  spruce_log: [70, 50, 34],
  birch_log: [200, 196, 180],
  oak_planks: [172, 134, 80],
  spruce_planks: [112, 82, 50],
  birch_planks: [200, 180, 126],
  snow_block: [240, 244, 248],
  snowy_grass: [230, 238, 240],
  iron_block: [206, 208, 212],
  glass: [180, 214, 230],
  glowstone: [255, 220, 140],
  sea_lantern: [200, 240, 240],
  hay: [214, 178, 74],
  crate: [140, 100, 56],
  barrel: [140, 100, 56],
  marble: [224, 228, 232],
  lamp: [255, 210, 120],
  chest: [200, 150, 60],
};
function colorOf(name: string): [number, number, number] {
  if (COLORS[name]) return COLORS[name];
  if (name.endsWith('_leaves')) return [62, 124, 52];
  if (name.endsWith('_log')) return [92, 66, 38];
  if (name.endsWith('_planks') || name.endsWith('_slab') || name.endsWith('_stairs'))
    return name.startsWith('oak')
      ? [172, 134, 80]
      : name.startsWith('spruce')
        ? [112, 82, 50]
        : name.startsWith('stone') || name.startsWith('cobble')
          ? [128, 128, 132]
          : [170, 120, 100];
  if (name.endsWith('_concrete'))
    return name.startsWith('red')
      ? [190, 60, 56]
      : name.startsWith('white')
        ? [236, 238, 240]
        : name.startsWith('light_gray')
          ? [170, 172, 176]
          : name.startsWith('gray')
            ? [90, 92, 98]
            : name.startsWith('blue')
              ? [60, 90, 190]
              : [150, 150, 150];
  if (name.endsWith('_wool')) return name.startsWith('red') ? [190, 60, 56] : [236, 238, 240];
  return [120, 130, 120];
}

export default function bake() {
  const h = launch('blockroyale', { seed: 3, radius: 16 });
  const game = h.ctx;
  game.player.teleport({ x: CENTER.x, y: 150, z: CENTER.z });
  h.run(2);
  const world = game.world;
  const heights = new Float32Array(SIZE * SIZE);
  const rgb = new Uint8Array(SIZE * SIZE * 3);
  const names = new Map<number, string>();
  for (let py = 0; py < SIZE; py++)
    for (let px = 0; px < SIZE; px++) {
      const x = Math.floor(CENTER.x - EXTENT + ((px + 0.5) * EXTENT * 2) / SIZE);
      const z = Math.floor(CENTER.z - EXTENT + ((py + 0.5) * EXTENT * 2) / SIZE);
      const y = world.surfaceY(x, z);
      heights[py * SIZE + px] = y;
      const id = world.getBlock(x, y, z);
      let name = names.get(id);
      if (!name) names.set(id, (name = world.blockName(id)));
      rgb.set(colorOf(name), (py * SIZE + px) * 3);
    }
  // Hillshade from the north-west, and the sea a little darker where it's deep.
  for (let i = 0; i < SIZE * SIZE; i++) {
    const e = (j: number) => heights[Math.max(0, Math.min(SIZE * SIZE - 1, j))];
    const shade = 1 + ((e(i - 1) - e(i + 1)) * 0.5 + (e(i - SIZE) - e(i + SIZE)) * 0.5) * 0.06;
    const k = Math.max(0.65, Math.min(1.35, shade));
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.max(0, Math.min(255, Math.round(rgb[i * 3 + c] * k)));
  }
  writeFileSync('src/games/blockroyale/client/minimap.png', png(SIZE, SIZE, rgb));
  console.log(`baked ${SIZE}x${SIZE}, ${names.size} kinds of block`);
}
