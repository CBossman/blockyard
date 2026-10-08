import { HeldModels, type GunHold, type ItemLook } from '@platform';
import type { Client } from '@platform/client';
import { MODELS } from '../models';
import { RARITIES } from '../rarity';
import { FAMILY_IDS, gunId, type FamilyId } from '../weapons';

/**
 * How every item looks and sounds on each screen (`client.items.look`): the guns' models, icons
 * and first-person holds, their tracers and voices (`./sounds`), and the loot's. The server's
 * `weapons.ts` and `loot.ts` have only what the items do.
 */

/** A full-length gun: close and low at the right, the forearms dropping away under it. */
const LONG: GunHold = {
  fist: [0.22, -0.31, -0.44],
  barrel: [-0.3, 0.04, -1],
  roll: -0.12,
  forearm: { hip: [0.35, -0.8, 0.45] },
  forearm2: { hip: [-0.35, -0.85, 0.35] },
  ads: 0.4,
};
/** A compact one: nearer the middle. */
const COMPACT: GunHold = { ...LONG, fist: [0.12, -0.27, -0.4] };

const FAMILY: Record<FamilyId, { hold: GunHold; stance?: 'pistol'; tracer: string; sounds: { use: string; reload: string; cycle?: string } }> = {
  plinker: { hold: COMPACT, stance: 'pistol', tracer: '#ffd36b', sounds: { use: 'shot_plinker', reload: 'reload_pistol' } },
  zipper: { hold: COMPACT, tracer: '#ffb36b', sounds: { use: 'shot_zipper', reload: 'reload_mag' } },
  trailblazer: { hold: LONG, tracer: '#ffe08a', sounds: { use: 'shot_trailblazer', reload: 'reload_mag' } },
  boomstick: { hold: LONG, tracer: '#ffb36b', sounds: { use: 'shot_boomstick', reload: 'reload_shell', cycle: 'pump' } },
  longshot: { hold: LONG, tracer: '#fff1a8', sounds: { use: 'shot_longshot', reload: 'reload_mag', cycle: 'bolt' } },
};

export function defineLooks(client: Client) {
  for (const f of FAMILY_IDS) {
    const l = FAMILY[f];
    RARITIES.forEach((r, tier) => {
      const id = gunId(f, tier);
      const url = MODELS[id];
      if (!url) return;
      const look: ItemLook = {
        icon: { gltf: url, view: 'side' },
        hold: { style: 'gun', model: HeldModels.gltf(url), gun: l.hold, ...(l.stance && { stance: l.stance }) },
        // The better guns leave their rarity's colour in the air.
        tracer: tier >= 3 ? r.color : l.tracer,
        sounds: l.sounds,
      };
      client.items.look(id, look);
    });
  }
  const item = (id: string, look: Partial<ItemLook> = {}) =>
    MODELS[id] && client.items.look(id, { icon: { gltf: MODELS[id] }, hold: { style: 'item', model: HeldModels.gltf(MODELS[id]) }, ...look });
  item('bandage', { sounds: { use: 'heal' } });
  item('medkit', { sounds: { use: 'heal' } });
  item('shield', { sounds: { use: 'heal' } });
  item('ammo', { hold: { style: 'item', model: HeldModels.gltf(MODELS.ammo) } });
  if (MODELS.frag) client.items.look('frag', { icon: { gltf: MODELS.frag }, hold: { style: 'throw', model: HeldModels.gltf(MODELS.frag) }, trail: '#ffb347' });
}
