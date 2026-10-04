#!/usr/bin/env node
// Games outside the platform's build (docs/PROPOSAL-UPLOADS.md):
//
//   npm run game -- build <folder> [--id other-id] [--out data/games] [--no-smoke]
//
// `build` packages the game in <folder> (src/games/<id>, or anywhere) the way a game server does
// for an upload: it checks the game's boundaries, bundles its server and client code with the
// platform left out, writes <out>/<id>/<version>/, then smoke-tests it (its server code in a room
// of its own with a player, for a few seconds of play). Vite's SSR loader runs the TypeScript, as
// for the other scripts.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const valued = ['--id', '--out'];
const [command, folder] = args.filter((a, i) => !a.startsWith('--') && !valued.includes(args[i - 1]));

if (command !== 'build' || !folder) {
  console.error('usage: npm run game -- build <folder> [--id other-id] [--out data/games] [--no-smoke]');
  process.exit(2);
}

const vite = await createServer({
  appType: 'custom',
  logLevel: 'warn',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let code = 0;
try {
  const { buildGame, BuildError } = await vite.ssrLoadModule('/src/platform/package/build.ts');
  const out = flag('out') ?? 'data/games';
  let built;
  try {
    const t0 = performance.now();
    built = await buildGame(folder, { out, id: flag('id') });
    const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
    const size = (f) => readFileSync(`${built.dir}/${f}`).length;
    console.log(`built ${built.id} ${built.version} in ${(performance.now() - t0).toFixed(0)} ms: server.js ${kb(size('server.js'))}, client.js ${kb(size('client.js'))}, ${built.manifest.assets.length} files`);
    console.log(`  server imports ${built.manifest.modules.server.join(', ')}`);
    console.log(`  client imports ${built.manifest.modules.client.join(', ')}`);
    console.log(`  in ${built.dir}`);
  } catch (err) {
    if (!(err instanceof BuildError)) throw err;
    console.error(`can't build ${folder}:\n${err.problems.map((p) => `  ${p}`).join('\n')}`);
    code = 1;
  }
  if (built && !args.includes('--no-smoke')) {
    const { smokeTest } = await vite.ssrLoadModule('/src/platform/host/packaged.ts');
    const result = await smokeTest(built.dir, readFileSync('engine/pkg/voxel_engine_bg.wasm'));
    if (result.ok) console.log(`smoke test passed: ${result.summary}`);
    else {
      console.error(`smoke test failed:\n${result.errors.map((e) => `  ${e}`).join('\n')}`);
      code = 1;
    }
  }
} finally {
  await vite.close();
}
process.exit(code);
