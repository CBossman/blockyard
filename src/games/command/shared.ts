import { defineShared } from '@platform';
import { GROUND_Y } from './map';
import { woods } from './woods';
import meta from './meta';

/**
 * What the server and every screen agree on: open ground as the battlefield (a flat meadow, the
 * only block), every unit, building and deposit a smooth model the server places, no walking body
 * (commanders look down on the field, `client/camera.ts`), and the HUD's look.
 */
const mottled = (color: string[], scale = 3) => ({ color, noise: 0.18, scale });
const EARTH = mottled(['#6e5434', '#77593a', '#684f30']);

const speck = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** A blade's height (texture rows, up from the bottom) in each column of a tuft; 0 leaves the column clear. */
const blades = (seed: number, most: number) => (x: number) => (speck(x, seed) < 0.3 ? 0 : 3 + Math.floor(speck(seed, x) * most));
/** Grass in a clump, its blades lighter toward the tips. (Row 0 is the top of the texture.) */
const tuft = (seed: number, most: number, root: string, mid: string, tip: string) => {
  const high = blades(seed, most);
  return (x: number, y: number) => {
    const h = high(x);
    const up = 16 - y;
    if (!h || up > h) return null;
    return up > h - 2 ? tip : up > h * 0.45 ? mid : root;
  };
};
/** A clump of flowers: a few stems with a blossom on each, over short grass. */
const bloom = (seed: number, petal: string, heart: string) => {
  const grass = tuft(seed, 3, '#426c3c', '#517a45', '#5e864d');
  return (x: number, y: number) => {
    const up = 16 - y;
    for (const [cx, top] of [[3, 8], [8, 10], [12, 7]] as const) {
      const c = cx + ((seed * 3) % 2);
      if (up >= top - 1 && up <= top + 1 && Math.abs(x - c) <= 1) return up === top && x === c ? heart : petal;
      if (x === c && up < top - 1) return '#487141';
    }
    return grass(x, y);
  };
};

export const shared = defineShared({
  ...meta,
  world: {
    terrain: 'void',
    ground: { y: GROUND_Y, top: 'cm_ground', depth: 1 },
    structures: [woods()],
    viewDistance: 12,
    maxViewDistance: 12,
    spawn: { x: 0, y: GROUND_Y + 60, z: 0 },
    time: 0.33,
    freezeTime: true,
    // (Their shadows, drifting over the field: the clouds themselves are above the highest the camera goes.)
    clouds: true,
  },
  blocks: {
    // (Blockilization's: grassland mottled green on earth, leaves, pines and grey rock.)
    // Six greens, deep to straw: the meadow fades from one to the next (`woods.ts`).
    cm_g0: { texture: { top: mottled(['#426c3c', '#487141', '#3d6538']), side: EARTH, bottom: EARTH }, label: 'Meadow' },
    cm_g1: { texture: { top: mottled(['#4c7641', '#537c47', '#466f3d']), side: EARTH, bottom: EARTH }, label: 'Meadow' },
    cm_ground: { texture: { top: mottled(['#577f47', '#5e864d', '#517943']), side: EARTH, bottom: EARTH }, label: 'Ground' },
    cm_g3: { texture: { top: mottled(['#66884f', '#6d8e54', '#61834b']), side: EARTH, bottom: EARTH }, label: 'Meadow' },
    cm_g4: { texture: { top: mottled(['#798f59', '#80955f', '#738954']), side: EARTH, bottom: EARTH }, label: 'Dry grass' },
    cm_g5: { texture: { top: mottled(['#8f9966', '#969e6c', '#889260']), side: EARTH, bottom: EARTH }, label: 'Dry grass' },
    cm_worn: { texture: { top: mottled(['#8d8a58', '#958f5e', '#858352'], 2), side: EARTH, bottom: EARTH }, label: 'Worn grass' },
    cm_hill: { texture: { top: mottled(['#60894f', '#678f54', '#5b834a']), side: mottled(['#4d6e41', '#547646', '#47673c']), bottom: EARTH }, label: 'Hillside' },
    cm_flowers: { texture: { top: mottled(['#5b834b', '#628950', '#557c46']), side: EARTH, bottom: EARTH }, label: 'Meadow' },
    // Grass and flowers standing on it (crossed planes, walked through): baked into the ground, so they cost nothing to keep.
    cm_tuft: { texture: { paint: tuft(3, 5, '#426c3c', '#517a45', '#698f54') }, shape: 'cross', label: 'Grass' },
    cm_tuft2: { texture: { paint: tuft(7, 7, '#47703f', '#5c854b', '#809a5f') }, shape: 'cross', label: 'Grass' },
    cm_tuft3: { texture: { paint: tuft(11, 8, '#697d4b', '#83905b', '#a2a36f') }, shape: 'cross', label: 'Dry grass' },
    cm_bloom: { texture: { paint: bloom(2, '#f4efd8', '#e8c040') }, shape: 'cross', label: 'Daisies' },
    cm_bloom2: { texture: { paint: bloom(5, '#e8c83a', '#c88a20') }, shape: 'cross', label: 'Buttercups' },
    cm_bloom3: { texture: { paint: bloom(9, '#c86ad0', '#f0d860') }, shape: 'cross', label: 'Clover' },
    cm_dirt: { texture: { top: mottled(['#86704c', '#907a54', '#7c6646'], 2), side: EARTH, bottom: EARTH }, label: 'Dirt' },
    cm_field: { texture: { top: mottled(['#6a4a2a', '#74502e', '#5e4226'], 1), side: EARTH, bottom: EARTH }, label: 'Field' },
    cm_field2: { texture: { top: mottled(['#a8962e', '#b4a236', '#9c8a2a'], 1), side: EARTH, bottom: EARTH }, label: 'Crop' },
    cm_road: { texture: { top: mottled(['#8b7354', '#7e6749', '#958060'], 2), side: EARTH, bottom: EARTH }, label: 'Road' },
    cm_road2: { texture: { top: mottled(['#7a6446', '#6f5a40', '#8a7656'], 2), side: EARTH, bottom: EARTH }, label: 'Road' },
    cm_pad: { texture: { top: mottled(['#9a968e', '#8e8a82', '#a4a098'], 2), side: EARTH, bottom: EARTH }, label: 'Gravel' },
    cm_pad2: { texture: { top: mottled(['#85817a', '#7a766f', '#908c84'], 2), side: EARTH, bottom: EARTH }, label: 'Gravel' },
    cm_soil: { texture: { top: mottled(['#4a3a28', '#54422e', '#3e3022'], 2), side: EARTH, bottom: EARTH }, label: 'Soil' },
    cm_deep: { texture: { top: { color: ['#23689f', '#2a70a8'], noise: 0.12, scale: 4 }, side: { color: '#1f5a8a', noise: 0 }, bottom: { color: '#1f5a8a', noise: 0 } }, label: 'Deep water' },
    cm_water: { texture: { top: { color: ['#2f7fbc', '#378ac6'], noise: 0.12, scale: 4 }, side: { color: '#2a74b8', noise: 0 }, bottom: { color: '#2a74b8', noise: 0 } }, label: 'Water' },
    cm_shallows: { texture: { top: { color: ['#57a9cf', '#62b3d6'], noise: 0.12, scale: 4 }, side: { color: '#4aa8d8', noise: 0 }, bottom: { color: '#4aa8d8', noise: 0 } }, label: 'Shallows' },
    cm_sand: { texture: { top: { color: ['#e2cf98', '#ead8a4', '#d8c48c'], noise: 0.18, scale: 3 }, side: { color: '#6e5434', noise: 0.18, scale: 3 }, bottom: { color: '#6e5434', noise: 0.18, scale: 3 } }, label: 'Sand' },
    cm_cliff: { texture: { color: ['#8d8a84', '#9a968e', '#7e7b75'], noise: 0.22, scale: 3 }, label: 'Cliff' },
    cm_cliff2: { texture: { color: ['#7a6a56', '#86755f', '#6e5f4c'], noise: 0.22, scale: 3 }, label: 'Cliff' },
    cm_snow: { texture: mottled(['#f4f8fa', '#e8eef2', '#ffffff']), label: 'Snow' },
    cm_trunk: { texture: mottled(['#5a4028', '#644830', '#523a24']), label: 'Trunk' },
    cm_leaves: { texture: mottled(['#2a6a2c', '#317434', '#245e28']), label: 'Leaves' },
    cm_leaves2: { texture: mottled(['#3a8a32', '#44963a', '#32802c']), label: 'Leaves' },
    cm_leaves3: { texture: mottled(['#4f9a3e', '#58a444', '#468e38']), label: 'Sunlit leaves' },
    cm_amber: { texture: mottled(['#b07a2e', '#bc8634', '#a06e2a']), label: 'Autumn leaves' },
    cm_amber2: { texture: mottled(['#cf9a3c', '#d8a444', '#c49036']), label: 'Autumn leaves' },
    cm_pine2: { texture: mottled(['#38604a', '#3e6850', '#325842']), label: 'Pines' },
    cm_pine: { texture: mottled(['#2a4a3a', '#30523f', '#244234']), label: 'Pines' },
    cm_rock: { texture: mottled(['#7e7e80', '#8a8a8c', '#727274']), label: 'Rock' },
    cm_rock2: { texture: mottled(['#8d8d90', '#9a9a9d', '#80808a']), label: 'Rock' },
  },
  player: { controller: 'none', health: false },
  hud: {
    theme: {
      display: "'Chakra Petch', 'Rajdhani', sans-serif",
      text: "'Chakra Petch', system-ui, sans-serif",
      fonts: ['Chakra Petch:500;600;700'],
      colors: { accent: '#ffc83a', ink: '#1d2b44', paper: '#ffffff', text: '#1d2b44', danger: '#f04438', good: '#45c93a' },
      // The board (a modal widget that frees the mouse) lies over everything without dimming it or catching clicks.
      css: '.widget-screen { background: none; pointer-events: none !important; backdrop-filter: none; } .gw-board { pointer-events: none !important; }',
    },
  },
});
