import { CAMPS } from './map';

/**
 * The scenery set about the field (`models.ts`): only what's part of the game. At each camp the
 * supply cache (the `relic`) the wild guard and a side can hold for steel. (The wrecks and ruins out on
 * the field are scrap, among the deposits: `map.ts`.) Same for the server and every screen.
 */
export interface Dress {
  model: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** How far round it units must keep (0: they walk through it). */
  block: number;
}

export const DRESSING: Dress[] = CAMPS.map((c) => ({ model: 'relic', x: c.x, z: c.z, yaw: 0, scale: 1, block: 0 }));
