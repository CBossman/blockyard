#!/usr/bin/env node
// Deploys the website to Vercel: builds it here (Vercel's builders have no Rust for the engine),
// pointed at the game server (GAME_SERVER, default the Fly app at play.blockyard.gg: under the
// site's own domain, so its sign-in cookie goes with the site's requests), and uploads the result as a
// prebuilt static site to the Vercel project this repo is linked to (`vercel link`).
//
//   npm run deploy:site                 production
//   npm run deploy:site -- --preview    a preview URL instead
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const server = process.env.GAME_SERVER ?? 'wss://play.blockyard.gg';
/** The site's home, and the older addresses that send visitors there (sign-in works only under it). */
const home = 'blockyard.gg';
const moved = ['www.blockyard.gg', 'blockyard.potrock.xyz', 'blockyard-games.vercel.app', 'voxel-platform-roan.vercel.app'];
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

run('npm run build', { VITE_GAME_SERVER: server });
const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('dist', `${out}/static`, { recursive: true });
// The old addresses redirect home, keeping the path and query (an invite link still lands in its
// room). Hashed assets never change: cache them for good. The page itself is always checked.
const redirects = moved.map((host) => ({ src: '/(.*)', has: [{ type: 'host', value: host }], status: 308, headers: { Location: `https://${home}/$1` } }));
writeFileSync(
  `${out}/config.json`,
  JSON.stringify({ version: 3, routes: [...redirects, { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true }] }, null, 2),
);
run(`vercel deploy --prebuilt${process.argv.includes('--preview') ? '' : ' --prod'}`);
