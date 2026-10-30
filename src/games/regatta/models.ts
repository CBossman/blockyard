import hull0 from './models/hull_0.glb?url';
import hull1 from './models/hull_1.glb?url';
import hull2 from './models/hull_2.glb?url';
import hull3 from './models/hull_3.glb?url';
import hull4 from './models/hull_4.glb?url';
import hull5 from './models/hull_5.glb?url';
import hull6 from './models/hull_6.glb?url';
import rig0s from './models/rig_0_s.glb?url';
import rig0p from './models/rig_0_p.glb?url';
import rig1s from './models/rig_1_s.glb?url';
import rig1p from './models/rig_1_p.glb?url';
import rig2s from './models/rig_2_s.glb?url';
import rig2p from './models/rig_2_p.glb?url';
import rig3s from './models/rig_3_s.glb?url';
import rig3p from './models/rig_3_p.glb?url';
import rig4s from './models/rig_4_s.glb?url';
import rig4p from './models/rig_4_p.glb?url';
import rig5s from './models/rig_5_s.glb?url';
import rig5p from './models/rig_5_p.glb?url';
import rig6s from './models/rig_6_s.glb?url';
import rig6p from './models/rig_6_p.glb?url';
import scenery from './models/scenery.glb?url';
import foilsS from './models/foils_s.glb?url';
import foilsP from './models/foils_p.glb?url';
import gust from './models/gust.glb?url';
import lull from './models/lull.glb?url';
import wake from './models/wake.glb?url';
import layline from './models/layline.glb?url';

/**
 * The game's models, made in code by `tools/models.mjs` (run it again after changing a shape).
 * The boats are the server's props; the rest each screen draws itself, as items no one carries.
 */

/** A hull in each fleet colour. */
export const HULLS = [hull0, hull1, hull2, hull3, hull4, hull5, hull6];
/** Each colour's rig, the sails cambered to starboard (`s`) or to port (`p`). */
export const RIGS = [
  { s: rig0s, p: rig0p },
  { s: rig1s, p: rig1p },
  { s: rig2s, p: rig2p },
  { s: rig3s, p: rig3p },
  { s: rig4s, p: rig4p },
  { s: rig5s, p: rig5p },
  { s: rig6s, p: rig6p },
];

/** The foil arms, canted for the boom out to starboard (`s`: that foil down) or to port (`p`). */
export const FOILS = { s: foilsS, p: foilsP };

/** A boat's wake, lying on the water under it (the server moves it with the boat). */
export const WAKE = wake;

/** What the screens draw, by the item each is the look of. */
export const SCENE_MODELS = { rg_scenery: scenery, rg_gust: gust, rg_lull: lull, rg_layline: layline };
