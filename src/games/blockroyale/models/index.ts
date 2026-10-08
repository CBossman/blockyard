/**
 * The models (GLB, built by `tools/build.mjs`) by id: every gun in every rarity (`zipper_rare`),
 * and the loot (`bandage`, `medkit`, `shield`, `frag`, `ammo`). Only client code reads them.
 */
const files = import.meta.glob('./*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const MODELS: Record<string, string> = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.slice(2, -4), url]));
