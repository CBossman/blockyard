/**
 * Block Command's voxel models (node src/games/command/tools/models.mjs): the shapes of
 * `shapes.mjs` written as GLBs to `../models/`: each unit and building once per army
 * (`cm_<kind>_<team>.glb`, in that army's colours; the camps' guards only in the wild's), and the
 * rest once (`cm_<id>.glb`). Each stands on its origin facing +z, a voxel a sixteenth of a unit.
 * It writes `../modelfiles.ts` too (the files, and each model's size in voxels).
 *
 * It uses a copy of Call of Blocky's voxel mesher (`./voxel.mjs`, by way of Blockilization).
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { faces, atlas, quadCorners, png, writeGlb, DIRS, cellOf } from './voxel.mjs';
import { PLAIN, TEAMED, TEAMS, palette } from './shapes.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'models');
const WILD = TEAMS.length - 1;
/** The camps' own: only the wild's colours. */
const WILD_ONLY = new Set(['guard', 'guard_t', 'brute']);

function glb(m, P, name) {
  const { faces: list } = faces(m.vox, P, { merge: true });
  const A = atlas(list, P);
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  list.forEach((f, fi) => {
    const base = pos.length / 3;
    const n = DIRS[f.dir].n;
    quadCorners(f).forEach((c, ci) => {
      pos.push(...c.map((v) => v / 16));
      nor.push(...n);
      uv.push(Math.round(A.uvs[fi][ci][0] * 65535), Math.round(A.uvs[fi][ci][1] * 65535));
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const used = new Set(m.vox.parts.get('m').values());
  const glows = [...used].some((c) => P.get(c).glow > 0);
  return writeGlb({
    generator: 'Block Command src/games/command/tools/models.mjs',
    nodes: [{ name, children: [1] }, { name: `${name}_body` }],
    sceneName: name,
    meshName: `${name}_body`,
    meshNode: 1,
    attributes: {
      POSITION: { values: pos, componentType: 5126, type: 'VEC3', minmax: true },
      NORMAL: { values: nor, componentType: 5126, type: 'VEC3' },
      TEXCOORD_0: { values: uv, componentType: 5123, type: 'VEC2', normalized: true },
    },
    indices: idx,
    material: { name: `${name}_atlas`, albedo: png(A.albedo), mr: png(A.mr), glow: glows ? png(A.glow, { grey: true }) : null },
    compress: true,
  });
}

function extent(m) {
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (const key of m.vox.parts.get('m').keys()) {
    const c = cellOf(key);
    lo = lo.map((v, a) => Math.min(v, c[a]));
    hi = hi.map((v, a) => Math.max(v, c[a] + 1));
  }
  return { lo, hi };
}

mkdirSync(OUT, { recursive: true });
// Last run's files go (this run writes them all again).
for (const f of readdirSync(OUT)) if (f.startsWith('cm_') && f.endsWith('.glb')) unlinkSync(join(OUT, f));
const palettes = TEAMS.map((_, t) => palette(t));
const size = {};
const imports = [];
const teamed = {};
const plain = {};
let total = 0;
let files = 0;
const write = (name, bytes) => {
  writeFileSync(join(OUT, `${name}.glb`), bytes);
  total += bytes.length;
  files++;
  imports.push(`import ${name} from './models/${name}.glb?url';`);
};
for (const def of TEAMED) {
  const m = def.build();
  size[def.id] = extent(m);
  const teams = WILD_ONLY.has(def.id) ? [WILD] : TEAMS.slice(0, WILD).map((_, t) => t);
  for (const t of teams) write(`cm_${def.id}_${t}`, glb(m, palettes[t], `cm_${def.id}_${t}`));
  // Every army's slot has a file: the wild's own for the camps' kinds, else the first army's.
  teamed[def.id] = TEAMS.map((_, t) => `cm_${def.id}_${teams.includes(t) ? t : teams[0]}`);
}
for (const def of PLAIN) {
  const m = def.build();
  size[def.id] = extent(m);
  write(`cm_${def.id}`, glb(m, palettes[1], `cm_${def.id}`));
  plain[def.id] = `cm_${def.id}`;
}
const obj = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`).join(', ')} }`;
writeFileSync(
  join(OUT, '..', 'modelfiles.ts'),
  [
    "// Block Command's voxel models (written by tools/models.mjs; don't edit).",
    ...imports,
    '',
    '/** Each unit\'s and building\'s file for each army (by seat; the last is the wild\'s). */',
    `export const TEAM_FILES: Record<string, string[]> = ${obj(teamed)};`,
    '/** The models with one look for all. */',
    `export const PLAIN_FILES: Record<string, string> = ${obj(plain)};`,
    '/** Each model\'s extent in voxels (a sixteenth of a unit): [lo, hi) on x, y, z. */',
    `export const MODEL_SIZE: Record<string, { lo: number[]; hi: number[] }> = ${JSON.stringify(size)};`,
    '',
  ].join('\n'),
);
console.log(`${files} files, ${Math.round(total / 1024)} KB, in ${OUT}`);
