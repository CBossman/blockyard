import { MODEL_SIZE, PLAIN_FILES, TEAM_FILES } from './modelfiles';
import flag0 from './models/flag_0.glb?url';
import flag1 from './models/flag_1.glb?url';
import flag2 from './models/flag_2.glb?url';
import flag3 from './models/flag_3.glb?url';
import flag4 from './models/flag_4.glb?url';
import flag5 from './models/flag_5.glb?url';
import flag6 from './models/flag_6.glb?url';

/**
 * The models. The army and the base are Block Command's own (`tools/shapes.mjs`, written by
 * `tools/models.mjs`): each unit and building in every army's colours, the camps' guards in the
 * wild's; the camps' supply caches and the scrap (wrecks, ruins) too. Every model is about a
 * unit across; `SCALE` makes it the size it is on this field.
 */

/** Which of a model's colourings a seat wears: an army's own, or the wild's (seat 6). */
export const variantOf = (seat: number) => (seat >= 6 || seat < 0 ? 6 : seat % 6);

const DRESS_FILES: Record<string, string> = PLAIN_FILES;

/** A unit's, building's or piece of scenery's model (for a seat). */
export const modelFor = (kind: string, seat = 0) => TEAM_FILES[kind]?.[variantOf(seat)] ?? DRESS_FILES[kind];
export const DEPOSIT_MODELS = { steel: PLAIN_FILES.steel, oil: PLAIN_FILES.oil };

/**
 * The items the screens draw: each unit and building as `ic_<kind>_<variant>` (on the field, and
 * the interface's pictures, in the seat's colours); the rotor, the scaffolding, the loads and the resources.
 */
export const PORTRAITS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(TEAM_FILES).flatMap(([k, files]) => files.map((url, v) => [`ic_${k}_${v}`, url]))),
  ...Object.fromEntries(['arms_rifle', 'arms_ak', 'arms_at', 'arm_e_r', 'arm_e_l', 'arm_h_r', 'arm_h_l', 'tail_rotor', 'hq_dish', 'tower_gun', 'tower_lamp', 'pump', 'sock', 'rocket', 'jet', 'bird', 'wing_r', 'wing_l', 'chunk_m', 'chunk_c', 'chunk_e', 'puff_d', 'puff_m', 'puff_l', 'puff_s', 'puff_o', 'puff_f', 'puff_y'].map((k) => [`ic_${k}`, PLAIN_FILES[k]])),
  ic_rotor: PLAIN_FILES.rotor,
  ic_radar: PLAIN_FILES.radar,
  ic_scaffold: PLAIN_FILES.scaffold,
  ic_crate: PLAIN_FILES.crate,
  ic_drum: PLAIN_FILES.drum,
  ic_leg: PLAIN_FILES.leg,
  ic_leg_e: PLAIN_FILES.leg_e,
  ic_leg_w: PLAIN_FILES.leg_w,
  ic_scorch: PLAIN_FILES.scorch,
  ic_shell: PLAIN_FILES.shell,
  ic_mine: PLAIN_FILES.mine,
  ic_airdrop: PLAIN_FILES.airdrop,
  ic_chute: PLAIN_FILES.chute,
  ic_tracks: PLAIN_FILES.tracks,
  ic_steel: PLAIN_FILES.steel,
  ic_oil: PLAIN_FILES.oil,
};

/** Each team's flag (`flags.cjs` in the tools: a pole and a banner), and the wild's grey one: `flag_<seat>`. */
export const FLAGS: Record<string, string> = { flag_0: flag0, flag_1: flag1, flag_2: flag2, flag_3: flag3, flag_4: flag4, flag_5: flag5, flag_6: flag6 };

/**
 * How big each of ours is on the field: people by their height, vehicles and boats by their
 * length, buildings by their footprint (its widest), the rest by their width.
 */
const TALL: Record<string, number> = { engineer: 2.6, rifle: 2.6, at: 2.6, guard: 2.7, hero: 3.3 };
const LONG: Record<string, number> = { scout: 3.3, tank: 6.2, artillery: 6.8, aa: 5.3, heli: 7.2, brute: 5.3, gunboat: 7.2, transport: 6.6 };
const WIDE: Record<string, number> = {
  hq: 10.6, depot: 5.6, barracks: 7.8, factory: 9.6, airfield: 10.6, lab: 7.2, tower: 4.4, bunker: 5.6, dock: 7.2, rampart: 3, gate: 3, market: 7.2,
  steel: 5.6, oil: 2.1, crate: 1.1, drum: 0.9, scorch: 1, shell: 0.34, mine: 1.5, airdrop: 2.9, chute: 7.4, tracks: 3.2,
  rubble: 5.6, house: 5.6, hut: 3.8, wall: 5.4, tent: 5.6, relic: 4.8, ruin: 5.4, henge: 5.6,
};
const fit = (k: string): number => {
  const s = MODEL_SIZE[k];
  const d = (a: number) => (s.hi[a] - s.lo[a]) / 16;
  if (TALL[k]) return TALL[k] / d(1);
  if (LONG[k]) return LONG[k] / d(2);
  return WIDE[k] / Math.max(d(0), d(2));
};

/** How much each is scaled up. */
export const SCALE: Record<string, number> = {
  ...Object.fromEntries([...Object.keys(TALL), ...Object.keys(LONG), ...Object.keys(WIDE)].map((k) => [k, fit(k)])),
  // The rotor turns over the helicopter, at its scale.
  rotor: fit('heli'),
};

/** Models set on the field that aren't units, buildings or steel and oil: the camps' caches, and the scrap. */
export const DRESSING = ['relic', 'ruin', 'henge', 'rubble'] as const;
