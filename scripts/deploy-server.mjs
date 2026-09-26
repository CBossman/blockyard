#!/usr/bin/env node
// Deploys the game server to Fly (the app in fly.toml): builds the engine here (Fly's builder gets
// engine/pkg with the rest of the Dockerfile's context) and runs `fly deploy`. The release's image
// is labelled with a hash of what the server runs (its bundle, the engine, its dependencies and
// Fly settings), so --if-changed can skip a deploy that would change nothing: a deploy restarts
// the server, which ends every match in progress. CI deploys each push to main this way
// (.github/workflows/ci.yml).
//
//   npm run deploy:server                   build and deploy
//   npm run deploy:server -- --if-changed   unless the live server is this same build
//   npm run deploy:server -- --no-wasm      with the engine already built (engine/pkg)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildHash } from './build-hash.mjs';

const flag = (name) => process.argv.includes(name);
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const app = /^app\s*=\s*"([^"]+)"/m.exec(readFileSync('fly.toml', 'utf8'))[1];

if (!flag('--no-wasm')) run('npm run wasm');
// The bundle the image will build, built here only to hash it.
run('npm run build:server');
const build = `server-${buildHash(['dist-server', 'engine/pkg/voxel_engine_bg.wasm', 'package-lock.json', 'Dockerfile', 'fly.toml'])}`;

// Every machine's image tag: the label of the release it runs.
let live = [];
try {
  live = JSON.parse(execSync(`fly image show -a ${app} --json`, { encoding: 'utf8' })).map((m) => m.Tag);
} catch {}
if (flag('--if-changed') && live.length && live.every((tag) => tag === build)) {
  console.log(`The server (${app}) is already this build (${build}): nothing to deploy.`);
} else {
  console.log(`Deploying the server: ${[...new Set(live)].join(', ') || 'unknown'} -> ${build}`);
  run(`fly deploy --remote-only --image-label ${build}`);
}
