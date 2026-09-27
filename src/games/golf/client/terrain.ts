import { HeldModels } from '@platform';
import type { Client, ClientKit, Node } from '@platform/client';
import { course } from '../course';
import { BASE, CHUNK } from '../scale';
import { chunkFile } from './terrain-mesh';

/**
 * The course, drawn smooth. The world's blocks under it are only footing (`course/build.ts`); what
 * you see is made on this screen, from the same landscape the ball rolls on, a square at a time
 * (`terrain-mesh.ts`, in a worker), nearest the camera first, and shown as an item's model
 * (`client.items.look` with the file's address, then `client.scene.item`).
 */

const RANGE = 250;

type Chunk = (typeof course.chunks)[number] & { cx: number; cz: number; state: 'none' | 'asked' | 'made' | 'shown'; node: Node | null };

export function terrainKit(): ClientKit {
  const chunks: Chunk[] = course.chunks.map((c) => ({ ...c, cx: c.x0 + CHUNK / 2, cz: c.z0 + CHUNK / 2, state: 'none', node: null }));
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const workers: Worker[] = [];
  let next = 0;
  let busy = 0;
  let client: Client | null = null;

  const done = (c: Chunk, bytes: Uint8Array<ArrayBuffer>) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
    client?.items.look(c.id, { hold: { model: HeldModels.gltf(url) } });
    c.state = 'made';
  };
  const make = (c: Chunk) => {
    c.state = 'asked';
    if (workers.length) {
      busy++;
      workers[next++ % workers.length].postMessage({ id: c.id, x0: c.x0, z0: c.z0, shaped: c.shaped });
    } else done(c, chunkFile(c.x0, c.z0, c.shaped));
  };
  const nearest = (x: number, z: number) =>
    chunks
      .filter((c) => c.state === 'none' && Math.hypot(c.cx - x, c.cz - z) < RANGE)
      .sort((a, b) => Math.hypot(a.cx - x, a.cz - z) - Math.hypot(b.cx - x, b.cz - z));

  return {
    name: 'golf.terrain',
    setup(c) {
      client = c;
      // Two workers make the squares, round the camera first.
      try {
        for (let i = 0; i < 2; i++) {
          const w = new Worker(new URL('./terrain-worker.ts', import.meta.url), { type: 'module' });
          w.onmessage = (e: MessageEvent<{ id: string; bytes: Uint8Array<ArrayBuffer> }>) => {
            busy--;
            const chunk = byId.get(e.data.id);
            if (chunk) done(chunk, e.data.bytes);
          };
          workers.push(w);
        }
      } catch {
        workers.length = 0;
      }
    },
    frame(c) {
      // Show what's made and loaded.
      for (const chunk of chunks) {
        if (chunk.state !== 'made') continue;
        const made = c.scene.item(chunk.id);
        if (!made) continue;
        made.node.position.set(chunk.x0, BASE, chunk.z0);
        c.scene.add(made.node);
        chunk.node = made.node;
        chunk.state = 'shown';
      }
      // Ask for the nearest still to make: a few at a time in the worker (or one a frame without).
      const cam = c.camera.position;
      for (const chunk of nearest(cam.x, cam.z)) {
        if (workers.length && busy >= 4) break;
        make(chunk);
        if (!workers.length) break;
      }
    },
    dispose() {
      for (const w of workers) w.terminate();
      for (const chunk of chunks) if (chunk.node) client?.scene.remove(chunk.node);
    },
  };
}
