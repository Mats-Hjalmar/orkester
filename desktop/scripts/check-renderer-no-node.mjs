// Offline guard: the Electron RENDERER bundle must contain NO node:* builtin
// import (the engine lives in the MAIN process; the renderer only talks to it
// over the IPC bridge). Run AFTER `electron-vite build`. Exits non-zero on a leak.
//
// We scan for import/require/from specifiers that name a Node builtin — NOT bare
// substrings like the object key `node:` in minified React internals, which are
// not module specifiers.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rendererDir = join(here, '..', 'out', 'renderer', 'assets');

if (!existsSync(rendererDir)) {
  console.error(`renderer assets not found at ${rendererDir} — run \`pnpm build\` first`);
  process.exit(1);
}

const BUILTINS = ['dgram', 'net', 'fs', 'os', 'http', 'https', 'tls', 'child_process', 'crypto', 'stream', 'path'];
// Match real module specifiers only: require("x") / from "x" / import("x").
const specifierRe = new RegExp(
  String.raw`(?:require\(|\bfrom\s|import\()\s*["'](node:[a-z_/]+|(?:${BUILTINS.join('|')}))["']`,
  'g',
);

const leaks = [];
for (const file of readdirSync(rendererDir)) {
  if (!file.endsWith('.js')) continue;
  const src = readFileSync(join(rendererDir, file), 'utf8');
  let m;
  while ((m = specifierRe.exec(src)) !== null) {
    leaks.push({ file, spec: m[1] });
  }
}

if (leaks.length > 0) {
  console.error('RENDERER LEAK: node:* builtin imports found in the renderer bundle:');
  for (const l of leaks) console.error(`  ${l.file} imports "${l.spec}"`);
  process.exit(1);
}

console.log('OK: renderer bundle contains no node:* builtin imports.');
